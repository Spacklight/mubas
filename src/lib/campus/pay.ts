import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { audit, db, fail, flag, isAdmin, limited, member, num, parse, str, type Row } from "@/lib/campus/common";
import { cleanHttpUrl, cleanText } from "@/lib/campus/logic";
import { ACTIVE_ADS_SQL, applyApproved, readPaySettings, revokeGranted, toE164, whatsappUrl } from "@/lib/campus/pay-logic";
import { cleanTxn, FEATURE_LABEL, parseTiers } from "@/lib/campus/plans";

export type AdCard = {
  id: number;
  itemId: number;
  business: string;
  title: string;
  body: string;
  kind: "post" | "image" | "video";
  hasMedia: boolean;
  hasThumb: boolean;
  linkUrl: string | null;
  contactUrl: string;
  callUrl: string;
  ctaUrl: string | null;
};

export type MyAd = { id: number; itemId: number; business: string; title: string; status: string; startsAt: string | null; endsAt: string | null; impressions: number; clicks: number; hasMedia: boolean; hasThumb: boolean; kind: string };

const IMAGE = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_IMAGE_CHARS = 820_000;
const ownerSlug = (userId: string) => userId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "member";
const stamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function sha256Hex(base64: string): Promise<string> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- config ----

export const payConfig = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const s = await readPaySettings(sql);
    return {
      ok: true as const,
      number: s.number,
      adsPrice: s.adsPrice,
      adsDays: s.adsDays,
      planDays: s.planDays,
      tiers: s.tiers,
      featureLabels: FEATURE_LABEL,
    };
  });

// -------------------------------------------------------------- payments ----

export const submitPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        purpose: z.enum(["ad", "plan"]),
        adId: z.number().int().positive().optional(),
        tier: z.number().int().positive().optional(),
        proof: z.string().max(MAX_IMAGE_CHARS + 40),
        txnId: z.string().trim().max(60).optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const match = IMAGE.exec(parsed.proof);
    if (!match || match[1].length > MAX_IMAGE_CHARS) return fail("Send the payment screenshot as a photo under about 600 KB.");
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const settings = await readPaySettings(sql);

    let expected = 0;
    let refId: number | null = null;
    if (parsed.purpose === "ad") {
      if (!parsed.adId) return fail("Choose which ad you are paying for.");
      const ad = await sql.query<Row>(`select id, status from ads where id = $1 and user_id = $2`, [parsed.adId, context.userId]);
      if (!ad[0] || str(ad[0], "status") !== "awaiting_payment") return fail("That ad is not waiting for payment.");
      expected = settings.adsPrice;
      refId = parsed.adId;
    } else {
      const tier = settings.tiers.find((t) => t.price === parsed.tier);
      if (!tier) return fail("Choose a plan first.");
      expected = tier.price;
    }
    const paced = await limited(sql, context.userId, "payment-proof", 8);
    if (paced) return paced;

    const hf = await import("@/lib/hf.server");
    if (!hf.hfConfigured()) return fail("Payments are not switched on yet. Please try again later.");
    const hash = await sha256Hex(match[1]);
    const dupe = await sql.query<Row>(`select id from payments where image_hash = $1`, [hash]);
    if (dupe.length) return fail("This screenshot has already been used. Please send the screenshot of your own new payment.");

    const engine = await import("@/lib/ai.server");
    const aiSettings = await engine.readSettings(sql);
    const checker = await import("@/lib/payments.server");
    const { fields, result } = await checker.verifyProof(sql, { imageBase64: match[1], expected, payNumber: settings.number, models: aiSettings.models });

    let txn = cleanTxn(fields.transactionId);
    let verdict = result.verdict;
    let reason = result.reason;
    const typed = cleanTxn(parsed.txnId);
    if (txn && typed && txn !== typed && verdict === "approved") {
      verdict = "review";
      reason = "The transaction ID you typed does not match the screenshot.";
    }
    if (!txn && typed) txn = typed;
    if (txn) {
      const used = await sql.query<Row>(`select id from payments where txn_id = $1`, [txn]);
      if (used.length) return fail("That transaction has already been used. Each payment can only be used once.");
    }

    const path = `payments/${ownerSlug(context.userId)}/${stamp()}.jpg`;
    try {
      await hf.hfUpload(path, match[1], "Add payment proof");
    } catch (error) {
      console.error("[pay] proof upload failed", error instanceof Error ? error.message : error);
      return fail("Could not save your screenshot. Please try again.");
    }

    const status = verdict === "approved" ? "approved" : verdict === "review" ? "pending_review" : "rejected";
    let paymentId = 0;
    try {
      const rows = await sql.query<Row>(
        `insert into payments (user_id, purpose, ref_id, tier, expected_amount, status, reason, amount, txn_id, recipient, sender, paid_at, provider, confidence, proof_path, image_hash, extracted)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) returning id`,
        [
          context.userId,
          parsed.purpose,
          refId,
          parsed.purpose === "plan" ? expected : null,
          expected,
          status,
          reason.slice(0, 200),
          fields.amountMWK ?? null,
          txn,
          fields.recipientNumber ?? null,
          fields.senderNumber ?? null,
          fields.dateTime ?? null,
          fields.provider ?? null,
          fields.confidence ?? null,
          path,
          hash,
          JSON.stringify(fields).slice(0, 2000),
        ],
      );
      paymentId = num(rows[0] ?? {}, "id");
    } catch (error) {
      void hf.hfDelete([path]).catch(() => undefined);
      if (/unique|constraint/i.test(error instanceof Error ? error.message : String(error))) return fail("That payment has already been used.");
      throw error;
    }
    if (status === "approved") {
      await applyApproved(sql, { id: paymentId, user_id: context.userId, purpose: parsed.purpose, ref_id: refId, tier: parsed.purpose === "plan" ? expected : null }, settings);
    } else if (status === "pending_review" && refId) {
      await sql.query(`update ads set status = 'pending_review', payment_id = $2 where id = $1`, [refId, paymentId]);
    }
    return { ok: true as const, verdict, reason, paymentId };
  });

export const myPayments = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const rows = await sql.query<Row>(`select id, purpose, tier, expected_amount, status, reason, created_at from payments where user_id = $1 order by id desc limit 30`, [context.userId]);
    return {
      ok: true as const,
      payments: rows.map((r) => ({ id: num(r, "id"), purpose: str(r, "purpose"), tier: r.tier ? num(r, "tier") : null, amount: num(r, "expected_amount"), status: str(r, "status"), reason: str(r, "reason"), createdAt: str(r, "created_at") })),
    };
  });

// ------------------------------------------------------------------- ads ----

export const createAd = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        kind: z.enum(["image", "link"]),
        title: z.string().trim().min(3, "Give your ad a headline.").max(100),
        body: z.string().trim().max(600).optional(),
        business: z.string().trim().min(2, "Enter your business name.").max(80),
        phone: z.string().trim().max(30),
        ctaUrl: z.string().trim().max(300).optional(),
        linkUrl: z.string().trim().max(500).optional(),
        imageData: z.string().max(MAX_IMAGE_CHARS + 40).optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const phone = toE164(parsed.phone);
    if (!phone) return fail("Enter a valid Malawi phone number, for example 0991234567.");
    const cta = parsed.ctaUrl ? cleanHttpUrl(parsed.ctaUrl) : null;
    if (parsed.ctaUrl && !cta) return fail("The website link must start with https://");
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const open = await sql.query<Row>(`select count(*) as n from ads where user_id = $1 and status in ('awaiting_payment', 'pending_review')`, [context.userId]);
    if (num(open[0] ?? {}, "n") >= 5) return fail("You already have several ads waiting. Pay for them or delete them first.");
    const paced = await limited(sql, context.userId, "ad-create", 10);
    if (paced) return paced;

    let path: string | null = null;
    let link: string | null = null;
    if (parsed.kind === "image") {
      const m = parsed.imageData ? IMAGE.exec(parsed.imageData) : null;
      if (!m || m[1].length > MAX_IMAGE_CHARS) return fail("Choose a photo for your ad (JPEG, under about 600 KB).");
      const hf = await import("@/lib/hf.server");
      if (!hf.hfConfigured()) return fail("Ads are not switched on yet.");
      path = `ads/${ownerSlug(context.userId)}/${stamp()}.jpg`;
      try {
        await hf.hfUpload(path, m[1], "Add ad photo");
      } catch (error) {
        console.error("[ads] upload failed", error instanceof Error ? error.message : error);
        return fail("Could not save the photo. Try again in a moment.");
      }
    } else {
      link = parsed.linkUrl ? cleanHttpUrl(parsed.linkUrl) : null;
      if (!link) return fail("Paste a link to your video (for example from YouTube).");
    }
    const item = await sql.query<Row>(
      `insert into showcase_items (user_id, kind, title, body, category, media_path, media_type, link_url, is_ad)
       values ($1, $2, $3, $4, 'Business', $5, $6, $7, true) returning id`,
      [context.userId, parsed.kind === "image" ? "image" : "video", cleanText(parsed.title, 100), cleanText(parsed.body ?? "", 600), path, path ? "image/jpeg" : null, link],
    );
    const itemId = num(item[0] ?? {}, "id");
    const ad = await sql.query<Row>(`insert into ads (user_id, item_id, business, phone, cta_url) values ($1, $2, $3, $4, $5) returning id`, [context.userId, itemId, cleanText(parsed.business, 80), phone, cta]);
    return { ok: true as const, adId: num(ad[0] ?? {}, "id") };
  });

export const listMyAds = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const rows = await sql.query<Row>(
      `select a.id, a.item_id, a.business, a.status, a.starts_at, a.ends_at, a.impressions, a.clicks, s.title, s.kind, s.media_path, s.thumb_path
       from ads a join showcase_items s on s.id = a.item_id
       where a.user_id = $1 and s.hidden = false and s.pending = false order by a.id desc limit 40`,
      [context.userId],
    );
    const ads: MyAd[] = rows.map((r) => ({
      id: num(r, "id"),
      itemId: num(r, "item_id"),
      business: str(r, "business"),
      title: str(r, "title"),
      status: str(r, "status"),
      startsAt: r.starts_at ? str(r, "starts_at") : null,
      endsAt: r.ends_at ? str(r, "ends_at") : null,
      impressions: num(r, "impressions"),
      clicks: num(r, "clicks"),
      hasMedia: Boolean(r.media_path),
      hasThumb: Boolean(r.thumb_path),
      kind: str(r, "kind"),
    }));
    return { ok: true as const, ads };
  });

export const adAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ id: z.number().int().positive(), action: z.enum(["pause", "resume", "delete"]) }), data);
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const rows = await sql.query<Row>(`select id, item_id, status, ends_at from ads where id = $1 and user_id = $2`, [parsed.id, context.userId]);
    const ad = rows[0];
    if (!ad) return fail("That ad was not found.");
    const status = str(ad, "status");
    if (parsed.action === "pause") {
      if (status !== "active") return fail("Only a running ad can be paused.");
      await sql.query(`update ads set status = 'paused' where id = $1`, [parsed.id]);
    } else if (parsed.action === "resume") {
      if (status !== "paused") return fail("This ad is not paused.");
      if (!(new Date(str(ad, "ends_at")).getTime() > Date.now())) return fail("This ad has run its full time.");
      await sql.query(`update ads set status = 'active' where id = $1`, [parsed.id]);
    } else {
      await sql.query(`update ads set status = 'revoked' where id = $1`, [parsed.id]);
      await sql.query(`update showcase_items set hidden = true where id = $1`, [num(ad, "item_id")]);
    }
    return { ok: true as const };
  });

/** Ads to show in the feeds right now. */
export const listAds = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const rows = await sql.query<Row>(ACTIVE_ADS_SQL, [new Date()]);
    const ads: AdCard[] = rows.map((r) => ({
      id: num(r, "id"),
      itemId: num(r, "item_id"),
      business: str(r, "business"),
      title: str(r, "title"),
      body: str(r, "body"),
      kind: (["image", "video"].includes(str(r, "kind")) ? str(r, "kind") : "post") as AdCard["kind"],
      hasMedia: Boolean(r.media_path),
      hasThumb: Boolean(r.thumb_path),
      linkUrl: r.link_url ? str(r, "link_url") : null,
      contactUrl: whatsappUrl(str(r, "phone"), `Hello ${str(r, "business")}, I saw your ad on Zapa MUBAS.`),
      callUrl: `tel:${str(r, "phone")}`,
      ctaUrl: r.cta_url ? str(r, "cta_url") : null,
    }));
    return { ok: true as const, ads };
  });

export const adEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ id: z.number().int().positive(), type: z.enum(["view", "click"]) }), data);
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const paced = await limited(sql, context.userId, "ad-event", 400);
    if (paced) return paced;
    await sql.query(parsed.type === "view" ? `update ads set impressions = impressions + 1 where id = $1 and status = 'active'` : `update ads set clicks = clicks + 1 where id = $1 and status = 'active'`, [parsed.id]);
    return { ok: true as const };
  });

// ----------------------------------------------------------------- admin ----

export const payAdminOverview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    if (!isAdmin(me.role)) return fail("Steward tools are not available on this account.");
    const settings = await readPaySettings(sql);
    const rows = await sql.query<Row>(
      `select p.id, p.user_id, p.purpose, p.tier, p.expected_amount, p.status, p.reason, p.amount, p.txn_id, p.recipient, p.paid_at, p.provider, p.confidence, p.proof_path, p.created_at, pr.full_name
       from payments p left join profiles pr on pr.user_id = p.user_id order by p.id desc limit 60`,
    );
    const totals = await sql.query<Row>(`select purpose, count(*) as n, coalesce(sum(expected_amount), 0) as total from payments where status = 'approved' group by purpose`);
    const activeAds = await sql.query<Row>(`select count(*) as n from ads where status = 'active' and ends_at > $1`, [new Date()]);
    return {
      ok: true as const,
      settings: { number: settings.number, adsPrice: settings.adsPrice, adsDays: settings.adsDays, planDays: settings.planDays, plansJson: settings.plansJson || JSON.stringify(settings.tiers, null, 2) },
      payments: rows.map((r) => ({
        id: num(r, "id"),
        who: str(r, "full_name") || str(r, "user_id"),
        purpose: str(r, "purpose"),
        tier: r.tier ? num(r, "tier") : null,
        expected: num(r, "expected_amount"),
        status: str(r, "status"),
        reason: str(r, "reason"),
        amount: r.amount == null ? null : num(r, "amount"),
        txn: str(r, "txn_id"),
        recipient: str(r, "recipient"),
        paidAt: str(r, "paid_at"),
        provider: str(r, "provider"),
        confidence: r.confidence == null ? null : Number(r.confidence),
        hasProof: Boolean(r.proof_path),
        createdAt: str(r, "created_at"),
      })),
      totals: totals.map((t) => ({ purpose: str(t, "purpose"), count: num(t, "n"), total: num(t, "total") })),
      activeAds: num(activeAds[0] ?? {}, "n"),
    };
  });

export const payAdminAct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        action: z.enum(["approve", "reject", "revoke", "settings"]),
        id: z.number().int().positive().optional(),
        note: z.string().trim().max(200).optional(),
        number: z.string().trim().max(20).optional(),
        adsPrice: z.number().int().min(50).max(100000).optional(),
        adsDays: z.number().int().min(1).max(365).optional(),
        planDays: z.number().int().min(1).max(365).optional(),
        plansJson: z.string().max(8000).optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    if (!isAdmin(me.role)) return fail("Steward tools are not available on this account.");
    const engine = await import("@/lib/ai.server");

    if (parsed.action === "settings") {
      if (parsed.number !== undefined) {
        if (!toE164(parsed.number)) return fail("Enter a valid 10-digit phone number for payments.");
        await engine.writeSetting(sql, "pay_number", parsed.number.replace(/[^0-9+]/g, ""));
      }
      if (parsed.adsPrice) await engine.writeSetting(sql, "ads_price", String(parsed.adsPrice));
      if (parsed.adsDays) await engine.writeSetting(sql, "ads_days", String(parsed.adsDays));
      if (parsed.planDays) await engine.writeSetting(sql, "plan_days", String(parsed.planDays));
      if (parsed.plansJson !== undefined) {
        try {
          if (!Array.isArray(JSON.parse(parsed.plansJson))) throw new Error("not a list");
        } catch {
          return fail("The plans must be a valid JSON list.");
        }
        if (parseTiers(parsed.plansJson).length === 0) return fail("No valid plan found in that list.");
        await engine.writeSetting(sql, "plans_json", parsed.plansJson);
      }
      await audit(sql, context.userId, "pay-settings", "Changed payment settings");
      return { ok: true as const };
    }
    if (!parsed.id) return fail("Choose a payment first.");
    const rows = await sql.query<Row>(`select id, user_id, purpose, ref_id, tier, status from payments where id = $1`, [parsed.id]);
    const p = rows[0];
    if (!p) return fail("That payment was not found.");
    const status = str(p, "status");
    const pay = { id: num(p, "id"), user_id: str(p, "user_id"), purpose: str(p, "purpose"), ref_id: p.ref_id == null ? null : num(p, "ref_id"), tier: p.tier == null ? null : num(p, "tier") };
    if (parsed.action === "approve") {
      if (status !== "pending_review") return fail("Only payments waiting for review can be approved.");
      await sql.query(`update payments set status = 'approved', reason = $2, reviewed_by = $3, reviewed_at = $4 where id = $1`, [pay.id, parsed.note || "Approved by a steward.", context.userId, new Date()]);
      await applyApproved(sql, pay, await readPaySettings(sql));
    } else if (parsed.action === "reject") {
      if (status !== "pending_review") return fail("Only payments waiting for review can be rejected.");
      await sql.query(`update payments set status = 'rejected', reason = $2, reviewed_by = $3, reviewed_at = $4 where id = $1`, [pay.id, parsed.note || "Rejected by a steward.", context.userId, new Date()]);
      if (pay.ref_id) await sql.query(`update ads set status = 'awaiting_payment', payment_id = null where id = $1 and status = 'pending_review'`, [pay.ref_id]);
    } else {
      if (status !== "approved") return fail("Only approved payments can be revoked.");
      await sql.query(`update payments set status = 'revoked', reason = $2, reviewed_by = $3, reviewed_at = $4 where id = $1`, [pay.id, parsed.note || "Revoked by a steward.", context.userId, new Date()]);
      await revokeGranted(sql, pay);
    }
    await audit(sql, context.userId, `pay-${parsed.action}`, `Payment #${pay.id}`);
    return { ok: true as const };
  });
