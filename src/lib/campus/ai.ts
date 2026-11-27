import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { audit, db, fail, flag, isAdmin, limited, member, num, parse, str, type Row } from "@/lib/campus/common";
import { DEFAULT_AI_CREDITS, minutesUntilRenewal, refund, spend, usedToday } from "@/lib/campus/quota";
import { cleanText } from "@/lib/campus/logic";
import { readPaySettings } from "@/lib/campus/pay-logic";
import { effectiveTier, type Feature } from "@/lib/campus/plans";

/** Credits each action costs. Students start every day with the daily allowance. */
export const AI_COSTS = { message: 1, pdf: 2, hdVoice: 2 } as const;
export const MAX_PDF_BYTES = 8 * 1024 * 1024;

export type AiMessage = { id: number; role: "user" | "model"; body: string; fileName: string | null; createdAt: string };
export type AiFile = { id: number; name: string; size: number; createdAt: string };

async function ai() {
  return import("@/lib/ai.server");
}

/** The member's plan: Free, or the best paid plan that has not expired. */
async function planFor(sql: Awaited<ReturnType<typeof db>>, userId: string) {
  const engine = await ai();
  const settings = await engine.readSettings(sql, { credits: DEFAULT_AI_CREDITS });
  const pay = await readPaySettings(sql);
  const { tier, expiresAt } = await effectiveTier(sql, userId, pay.tiers, settings.credits, settings.models);
  return { engine, settings, tier, expiresAt, models: [...new Set([...tier.models, ...settings.models])] };
}

const MAX_PHOTO_CHARS = 1_300_000;

async function creditsFor(sql: Awaited<ReturnType<typeof db>>, userId: string, limit: number) {
  const used = await usedToday(sql, userId, "ai");
  return { used, limit, left: Math.max(0, limit - used), renewsInMinutes: minutesUntilRenewal() };
}

function outOfCredits(limit: number) {
  const m = minutesUntilRenewal();
  const wait = m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  return fail(`You have used all ${limit} of today's Zapa AI credits. They renew at midnight, in about ${wait}.`);
}

export const aiStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const { tier, expiresAt } = await planFor(sql, context.userId);
    const keys = await sql.query<Row>(`select count(*) as n from ai_keys where enabled = true`);
    const messages = await sql.query<Row>(
      `select id, role, body, file_name, created_at from ai_chats where user_id = $1 order by id desc limit 40`,
      [context.userId],
    );
    const files = await sql.query<Row>(`select id, name, size, created_at from ai_files where user_id = $1 order by id desc limit 50`, [context.userId]);
    return {
      ok: true as const,
      enabled: num(keys[0] ?? {}, "n") > 0,
      credits: await creditsFor(sql, context.userId, tier.credits),
      plan: { name: tier.name, price: tier.price, features: tier.features as Feature[], voiceCost: tier.voiceCost, maxPdfMb: tier.maxPdfMb, expiresAt },
      messages: messages.reverse().map((r): AiMessage => ({ id: num(r, "id"), role: str(r, "role") === "model" ? "model" : "user", body: str(r, "body"), fileName: r.file_name ? str(r, "file_name") : null, createdAt: str(r, "created_at") })),
      files: files.map((r): AiFile => ({ id: num(r, "id"), name: str(r, "name"), size: num(r, "size"), createdAt: str(r, "created_at") })),
    };
  });

export const aiChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        message: z.string().trim().min(1, "Type a question first.").max(2000, "Please keep your question under 2,000 characters."),
        fileId: z.number().int().positive().optional(),
        mode: z.enum(["chat", "quiz", "study-plan", "essay", "exam"]).optional(),
        image: z.object({ data: z.string().max(MAX_PHOTO_CHARS).regex(/^[A-Za-z0-9+/]+={0,2}$/, "That photo could not be read.") }).optional(),
        pdf: z
          .object({
            name: z.string().trim().min(1).max(160),
            size: z.number().int().positive().max(20 * 1048576, "PDFs can be up to 20 MB."),
            data: z.string().max(Math.ceil(20 * 1048576 * 1.4)).regex(/^[A-Za-z0-9+/]+={0,2}$/, "That PDF could not be read."),
          })
          .optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const { engine, tier, models } = await planFor(sql, context.userId);
    const upgrade = tier.price === 0 ? " Upgrade to Zapa AI Plus to unlock it." : "";
    const mode = parsed.mode ?? "chat";
    if (mode !== "chat" && !tier.features.includes(mode)) return fail(`That mode is not part of your plan.${upgrade}`);
    if (parsed.image && !tier.features.includes("photo")) return fail(`Photo questions are not part of your plan.${upgrade}`);
    if (parsed.pdf && parsed.pdf.size > tier.maxPdfMb * 1048576) return fail(`Your plan allows PDFs up to ${tier.maxPdfMb} MB.${upgrade}`);
    const cost = parsed.pdf || parsed.image ? AI_COSTS.pdf : AI_COSTS.message;
    if ((await usedToday(sql, context.userId, "ai")) + cost > tier.credits) return outOfCredits(tier.credits);
    const paced = await limited(sql, context.userId, "ai-chat", 40);
    if (paced) return paced;

    let digest: string | undefined;
    let fileName: string | undefined = parsed.pdf?.name;
    if (!parsed.pdf && parsed.fileId) {
      const f = await sql.query<Row>(`select name, digest from ai_files where id = $1 and user_id = $2`, [parsed.fileId, context.userId]);
      if (f[0]) {
        digest = str(f[0], "digest");
        fileName = str(f[0], "name");
      }
    }
    const history = await sql.query<Row>(`select role, body from ai_chats where user_id = $1 order by id desc limit 12`, [context.userId]);
    await spend(sql, context.userId, "ai", cost);
    try {
      const result = await engine.chat(
        sql,
        models,
        {
          mode,
          maxTokens: tier.maxTokens,
          image: parsed.image ? { data: parsed.image.data } : undefined,
          history: history.reverse().map((r) => ({ role: str(r, "role") === "model" ? "model" : "user", body: str(r, "body").slice(0, 4000) })),
          message: parsed.message,
          digest,
          fileName,
          pdf: parsed.pdf ? { data: parsed.pdf.data } : undefined,
        },
        engine.secretFromEnv(),
      );
      let fileId: number | undefined = parsed.fileId;
      if (parsed.pdf) {
        const saved = await sql.query<Row>(`insert into ai_files (user_id, name, size, digest) values ($1, $2, $3, $4) returning id`, [
          context.userId,
          cleanText(parsed.pdf.name, 160),
          parsed.pdf.size,
          (result.digest ?? result.reply).slice(0, 9000),
        ]);
        fileId = num(saved[0] ?? {}, "id");
      }
      await sql.query(`insert into ai_chats (user_id, role, body, file_name) values ($1, 'user', $2, $3)`, [context.userId, cleanText(parsed.message, 2000), fileName ?? null]);
      await sql.query(`insert into ai_chats (user_id, role, body) values ($1, 'model', $2)`, [context.userId, result.reply.slice(0, 8000)]);
      await sql.query(`delete from ai_chats where user_id = $1 and id not in (select id from ai_chats where user_id = $1 order by id desc limit 200)`, [context.userId]);
      return { ok: true as const, reply: result.reply, fileId, credits: await creditsFor(sql, context.userId, tier.credits) };
    } catch (error) {
      await refund(sql, context.userId, "ai", cost);
      if (error instanceof Error && (error.name === "NoCapacityError" || error.name === "GeminiError")) {
        console.error("[ai] chat failed", error.message);
        return fail(error.name === "NoCapacityError" ? error.message : error.message.replace(/^\d+:\s*/, "").slice(0, 200));
      }
      throw error;
    }
  });

/** HD voice: a spoken version of an answer from Gemini (raw 24 kHz audio, wrapped into a file in the browser). */
export const aiSpeak = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ text: z.string().trim().min(2).max(6000) }), data);
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const { engine, settings, tier } = await planFor(sql, context.userId);
    const cost = tier.voiceCost;
    if (cost > 0 && (await usedToday(sql, context.userId, "ai")) + cost > tier.credits) return outOfCredits(tier.credits);
    const paced = await limited(sql, context.userId, "ai-voice", 12);
    if (paced) return paced;
    if (cost > 0) await spend(sql, context.userId, "ai", cost);
    try {
      const out = await engine.speak(sql, settings.ttsModel, parsed.text, engine.secretFromEnv());
      return { ok: true as const, pcm: out.pcm, sampleRate: 24000, credits: await creditsFor(sql, context.userId, tier.credits) };
    } catch (error) {
      if (cost > 0) await refund(sql, context.userId, "ai", cost);
      console.error("[ai] voice failed", error instanceof Error ? error.message : error);
      return fail("HD voice is not available right now. Use the device voice instead, it is free.");
    }
  });

export const aiManage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ action: z.enum(["clear-chat", "delete-file"]), id: z.number().int().positive().optional() }), data);
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    if (parsed.action === "clear-chat") await sql.query(`delete from ai_chats where user_id = $1`, [context.userId]);
    else if (parsed.id) await sql.query(`delete from ai_files where id = $1 and user_id = $2`, [parsed.id, context.userId]);
    return { ok: true as const };
  });

// --------------------------------------------------------------- admin ----

export const aiAdminOverview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    if (!isAdmin(me.role)) return fail("Steward tools are not available on this account.");
    const engine = await ai();
    const settings = await engine.readSettings(sql, { credits: DEFAULT_AI_CREDITS });
    const dayAgo = new Date(Date.now() - 86_400_000);
    const keys = await sql.query<Row>(`select id, label, key_tail, enabled, note, created_at from ai_keys order by id`);
    const usage = await sql.query<Row>(`select key_id, model, count(*) as n from ai_requests where created_at > $1 group by key_id, model`, [dayAgo]);
    const blocks = await sql.query<Row>(`select key_id, model, reason from ai_blocks where blocked_until > $1`, [new Date()]);
    const today = await sql.query<Row>(`select count(*) as users, coalesce(sum(used), 0) as credits from daily_usage where kind = 'ai' and day = $1`, [(await import("@/lib/campus/quota")).dayKey()]);
    return {
      ok: true as const,
      settings: { credits: settings.credits, models: settings.models.join(", "), ttsModel: settings.ttsModel },
      keys: keys.map((k) => ({
        id: num(k, "id"),
        label: str(k, "label"),
        tail: str(k, "key_tail"),
        enabled: flag(k, "enabled"),
        note: str(k, "note"),
        createdAt: str(k, "created_at"),
        usage: usage.filter((u) => num(u, "key_id") === num(k, "id")).map((u) => ({ model: str(u, "model"), requests: num(u, "n") })),
        limited: blocks.filter((b) => num(b, "key_id") === num(k, "id")).map((b) => ({ model: str(b, "model"), reason: str(b, "reason") })),
      })),
      today: { users: num(today[0] ?? {}, "users"), credits: num(today[0] ?? {}, "credits") },
      dailyCapacity: keys.filter((k) => flag(k, "enabled")).length * settings.models.length * engine.SAFE_RPD,
    };
  });

export const aiAdminAct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        action: z.enum(["add-key", "toggle-key", "delete-key", "test-key", "settings"]),
        id: z.number().int().positive().optional(),
        label: z.string().trim().max(60).optional(),
        apiKey: z.string().trim().max(200).optional(),
        enabled: z.boolean().optional(),
        credits: z.number().int().min(1).max(500).optional(),
        models: z.string().trim().max(200).optional(),
        ttsModel: z.string().trim().max(80).optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    if (!isAdmin(me.role)) return fail("Steward tools are not available on this account.");
    const engine = await ai();

    if (parsed.action === "add-key") {
      const key = parsed.apiKey ?? "";
      if (!/^[A-Za-z0-9_.-]{20,200}$/.test(key)) return fail("That does not look like a Google API key.");
      const tail = key.slice(-4);
      const sameTail = await sql.query<Row>(`select id, key_cipher from ai_keys where key_tail = $1`, [tail]);
      for (const row of sameTail) {
        try {
          if ((await engine.openKey(str(row, "key_cipher"), engine.secretFromEnv())) === key) return fail("That key is already added.");
        } catch {
          // an unreadable old key cannot be a duplicate
        }
      }
      const check = await engine.validateKey(key);
      if (!check.ok) return fail(`Google did not accept that key: ${check.reason ?? "unknown reason"}`);
      const cipher = await engine.sealKey(key, engine.secretFromEnv());
      await sql.query(`insert into ai_keys (label, key_cipher, key_tail, created_by) values ($1, $2, $3, $4)`, [cleanText(parsed.label || `Key …${tail}`, 60), cipher, tail, context.userId]);
      await audit(sql, context.userId, "ai-add-key", `Added a Gemini key ending ${tail}`);
      return { ok: true as const };
    }
    if (parsed.action === "settings") {
      if (parsed.credits) await engine.writeSetting(sql, "ai_daily_credits", String(parsed.credits));
      if (parsed.models !== undefined) await engine.writeSetting(sql, "ai_models", parsed.models);
      if (parsed.ttsModel !== undefined) await engine.writeSetting(sql, "ai_tts_model", parsed.ttsModel);
      await audit(sql, context.userId, "ai-settings", "Changed Zapa AI settings");
      return { ok: true as const };
    }
    if (!parsed.id) return fail("Choose a key first.");
    if (parsed.action === "toggle-key") {
      await sql.query(`update ai_keys set enabled = $2, note = '' where id = $1`, [parsed.id, Boolean(parsed.enabled)]);
      await audit(sql, context.userId, "ai-toggle-key", `Key #${parsed.id} ${parsed.enabled ? "enabled" : "disabled"}`);
      return { ok: true as const };
    }
    if (parsed.action === "delete-key") {
      await sql.query(`delete from ai_requests where key_id = $1`, [parsed.id]);
      await sql.query(`delete from ai_blocks where key_id = $1`, [parsed.id]);
      await sql.query(`delete from ai_keys where id = $1`, [parsed.id]);
      await audit(sql, context.userId, "ai-delete-key", `Deleted key #${parsed.id}`);
      return { ok: true as const };
    }
    // test-key
    const row = await sql.query<Row>(`select key_cipher from ai_keys where id = $1`, [parsed.id]);
    if (!row[0]) return fail("That key no longer exists.");
    try {
      const check = await engine.validateKey(await engine.openKey(str(row[0], "key_cipher"), engine.secretFromEnv()));
      return check.ok ? { ok: true as const } : fail(`Google rejected this key: ${check.reason ?? "unknown reason"}`);
    } catch {
      return fail("This key cannot be decrypted. Delete it and add it again.");
    }
  });
