import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { cleanHttpUrl, cleanText, REPORT_REASONS } from "@/lib/campus/logic";
import { buildListQuery, CONTENT_TABS, PAGE, STORIES_SQL } from "@/lib/campus/showcase-sql";
import { db, fail, flag, limited, member, num, parse, str, type Row } from "@/lib/campus/common";
import { LIMITS, spend, usedToday } from "@/lib/campus/quota";
import { toE164 } from "@/lib/campus/pay-logic";

export { CONTENT_TABS };
export type ContentTabId = (typeof CONTENT_TABS)[number];

export const SHOWCASE_CATEGORIES = [
  "Talent",
  "Knowledge",
  "Projects",
  "Art and design",
  "Music",
  "Tech",
  "Business",
  "Sports",
  "Other",
] as const;

/** Largest uploaded video, in bytes. */
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export type ShowcaseItem = {
  id: number;
  userId: string;
  author: string;
  role: string;
  roleConfirmed: boolean;
  kind: "post" | "image" | "video";
  title: string;
  body: string;
  category: string;
  /** A file stored on Hugging Face (photo or uploaded video). */
  hasMedia: boolean;
  hasThumb: boolean;
  linkUrl: string | null;
  views: number;
  shares: number;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  following: boolean;
  saved: boolean;
  createdAt: string;
};

export type StoryItem = { id: number; userId: string; author: string; caption: string; createdAt: string };

function map(row: Row): ShowcaseItem {
  return {
    id: num(row, "id"),
    userId: str(row, "user_id"),
    author: str(row, "full_name"),
    role: str(row, "role"),
    roleConfirmed: flag(row, "role_confirmed"),
    kind: (["image", "video"].includes(str(row, "kind")) ? str(row, "kind") : "post") as ShowcaseItem["kind"],
    title: str(row, "title"),
    body: str(row, "body"),
    category: str(row, "category"),
    hasMedia: Boolean(row.media_path),
    hasThumb: Boolean(row.thumb_path),
    linkUrl: row.link_url ? str(row, "link_url") : null,
    views: num(row, "views"),
    shares: num(row, "shares"),
    likeCount: num(row, "like_count"),
    commentCount: num(row, "comment_count"),
    liked: flag(row, "liked"),
    following: flag(row, "following"),
    saved: flag(row, "saved"),
    createdAt: str(row, "created_at"),
  };
}

const ownerSlug = (userId: string) => userId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "member";
const fileStamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const hfBackground = (job: (hf: typeof import("@/lib/hf.server")) => Promise<unknown>) =>
  void import("@/lib/hf.server").then(job).catch(() => undefined);

// ---------------------------------------------------------------- feed ----

export const listShowcase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        offset: z.number().int().min(0).max(600).optional(),
        tab: z.enum(CONTENT_TABS).optional(),
        kind: z.enum(["post", "image", "video"]).optional(),
        category: z.string().max(40).optional(),
        authorId: z.string().max(80).optional(),
        q: z.string().trim().max(60).optional(),
        id: z.number().int().positive().optional(),
      }),
      data ?? {},
    );
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const { text, values } = buildListQuery(context.userId, parsed);
    const rows = await sql.query<Row>(text, values);
    return { ok: true as const, items: rows.map(map), more: rows.length === PAGE };
  });

// ------------------------------------------------------------- creating ----

const IMAGE = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_IMAGE_CHARS = 820_000;

export const createShowcase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        kind: z.enum(["post", "image", "video"]),
        title: z.string().trim().min(3, "Give your post a title.").max(120),
        body: z.string().trim().max(3000).optional(),
        category: z.enum(SHOWCASE_CATEGORIES),
        linkUrl: z.string().trim().max(500).optional(),
        imageData: z.string().max(MAX_IMAGE_CHARS + 40).optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;

    let link: string | null = null;
    if (parsed.kind === "video") {
      link = parsed.linkUrl ? cleanHttpUrl(parsed.linkUrl) : null;
      if (!link) return fail("Paste a link to your video (for example from YouTube).");
    }
    let base64 = "";
    if (parsed.kind === "image") {
      const match = parsed.imageData ? IMAGE.exec(parsed.imageData) : null;
      if (!match || match[1].length > MAX_IMAGE_CHARS) return fail("Choose a photo (JPEG) under about 600 KB.");
      base64 = match[1];
    }
    const paced = await limited(sql, context.userId, "showcase", 10);
    if (paced) return paced;

    let path: string | null = null;
    if (parsed.kind === "image") {
      const hf = await import("@/lib/hf.server");
      if (!hf.hfConfigured()) return fail("Photo sharing is not switched on yet. You can still share a post or a video link.");
      path = `showcase/${ownerSlug(context.userId)}/${fileStamp()}.jpg`;
      try {
        await hf.hfUpload(path, base64, "Add photo");
      } catch (error) {
        console.error("[content] upload failed", error instanceof Error ? error.message : error);
        return fail("Could not save the photo right now. Try again in a moment.");
      }
    }
    try {
      const rows = await sql.query<Row>(
        `insert into showcase_items (user_id, kind, title, body, category, media_path, media_type, link_url)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [context.userId, parsed.kind, cleanText(parsed.title, 120), cleanText(parsed.body ?? "", 3000), parsed.category, path, path ? "image/jpeg" : null, link],
      );
      return { ok: true as const, id: num(rows[0] ?? {}, "id") };
    } catch (error) {
      if (path) hfBackground((hf) => hf.hfDelete([path as string]));
      throw error;
    }
  });

// ---------------------------------------------------- video upload (HF) ----

/**
 * Step 1: reserve the upload. The browser has already hashed the file (SHA-256),
 * so Hugging Face can verify the bytes later. The file itself is relayed in parts
 * through /api/content-upload and never held in memory by the server.
 */
export const startVideoUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        title: z.string().trim().min(3, "Give your video a title.").max(120),
        body: z.string().trim().max(3000).optional(),
        category: z.enum(SHOWCASE_CATEGORIES),
        size: z.number().int().min(1024, "That video looks empty.").max(MAX_VIDEO_BYTES, "Videos can be up to 60 MB. Trim your clip and try again."),
        oid: z.string().regex(/^[a-f0-9]{64}$/, "Could not read the video."),
        contentType: z.enum(VIDEO_TYPES),
        /** Set when the video is a paid Zapa Ads creative. */
        ad: z.object({ business: z.string().trim().min(2).max(80), phone: z.string().trim().max(30), ctaUrl: z.string().trim().max(300).optional() }).optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const hf = await import("@/lib/hf.server");
    if (!hf.hfConfigured()) return fail("Video uploads are not switched on yet.");
    const adPhone = parsed.ad ? toE164(parsed.ad.phone) : null;
    if (parsed.ad && !adPhone) return fail("Enter a valid Malawi phone number, for example 0991234567.");
    const adCta = parsed.ad?.ctaUrl ? cleanHttpUrl(parsed.ad.ctaUrl) : null;
    if (parsed.ad?.ctaUrl && !adCta) return fail("The website link must start with https://");
    if (!parsed.ad && (await usedToday(sql, context.userId, "video")) >= LIMITS.video) {
      return fail(`You have used your ${LIMITS.video} video uploads for today. They renew at midnight.`);
    }
    const paced = await limited(sql, context.userId, "content-video", 12);
    if (paced) return paced;

    let plan;
    try {
      plan = await hf.hfLfsPlan(parsed.oid, parsed.size);
    } catch (error) {
      console.error("[content] upload plan failed", error instanceof Error ? error.message : error);
      return fail("Could not start the upload. Try again in a moment.");
    }
    const ext = parsed.contentType === "video/webm" ? "webm" : parsed.contentType === "video/quicktime" ? "mov" : "mp4";
    const path = `content/${ownerSlug(context.userId)}/${fileStamp()}.${ext}`;
    const rows = await sql.query<Row>(
      `insert into showcase_items (user_id, kind, title, body, category, media_path, media_type, media_oid, media_size, upload_plan, pending, is_ad)
       values ($1, 'video', $2, $3, $4, $5, $6, $7, $8, $9, true, $10) returning id`,
      [context.userId, cleanText(parsed.title, 120), cleanText(parsed.body ?? "", 3000), parsed.category, path, parsed.contentType, parsed.oid, parsed.size, JSON.stringify(plan), Boolean(parsed.ad)],
    );
    if (parsed.ad && adPhone) {
      await sql.query(`insert into ads (user_id, item_id, business, phone, cta_url) values ($1, $2, $3, $4, $5)`, [context.userId, num(rows[0] ?? {}, "id"), cleanText(parsed.ad.business, 80), adPhone, adCta]);
    }
    const parts = plan.mode === "multipart" ? Math.ceil(parsed.size / (plan.chunkSize ?? parsed.size)) : plan.mode === "basic" ? 1 : 0;
    if (plan.mode === "multipart" && (plan.partUrls?.length ?? 0) < parts) return fail("Hugging Face returned an unexpected upload plan.");
    return { ok: true as const, itemId: num(rows[0] ?? {}, "id"), mode: plan.mode, chunkSize: plan.chunkSize ?? parsed.size, parts };
  });

/** Step 3: Hugging Face has the bytes. Verify, commit, and publish the video. */
export const finishVideoUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        itemId: z.number().int().positive(),
        etags: z.array(z.string().max(200)).max(400).optional(),
        poster: z.string().max(260_000).optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const rows = await sql.query<Row>(
      `select id, media_path, media_oid, media_size, upload_plan, is_ad from showcase_items where id = $1 and user_id = $2 and pending = true`,
      [parsed.itemId, context.userId],
    );
    const item = rows[0];
    if (!item) return fail("That upload was not found. Start again.");
    const hf = await import("@/lib/hf.server");
    const plan = JSON.parse(str(item, "upload_plan")) as import("@/lib/hf.server").LfsPlan;
    const oid = str(item, "media_oid");
    const size = num(item, "media_size");
    const path = str(item, "media_path");
    try {
      if (plan.mode === "multipart" && (parsed.etags?.length ?? 0) < Math.ceil(size / (plan.chunkSize ?? size))) {
        return fail("Some parts of the video did not upload. Try again.");
      }
      await hf.hfLfsFinish(plan, oid, size, parsed.etags ?? []);
      await hf.hfCommitLfs(path, oid, size, "Add video");
    } catch (error) {
      console.error("[content] finishing upload failed", error instanceof Error ? error.message : error);
      return fail("Hugging Face could not finish saving the video. Try again.");
    }
    let thumb: string | null = null;
    const poster = parsed.poster ? IMAGE.exec(parsed.poster) : null;
    if (poster && poster[1].length <= 250_000) {
      thumb = path.replace(/\.[a-z0-9]+$/i, "") + "-poster.jpg";
      try {
        await hf.hfUpload(thumb, poster[1], "Add video poster");
      } catch {
        thumb = null; // the video still works without a poster
      }
    }
    await sql.query(`update showcase_items set pending = false, thumb_path = $2, upload_plan = null where id = $1`, [parsed.itemId, thumb]);
    if (!flag(item, "is_ad")) {
      await spend(sql, context.userId, "video");
      return { ok: true as const, id: parsed.itemId, adId: null as number | null };
    }
    const adRow = await sql.query<Row>(`select id from ads where item_id = $1`, [parsed.itemId]);
    return { ok: true as const, id: parsed.itemId, adId: adRow[0] ? num(adRow[0], "id") : null };
  });

// ------------------------------------------------------------- actions ----

export const showcaseAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        action: z.enum(["like", "comment", "list-comments", "delete", "report", "view", "share", "save"]),
        id: z.number().int().positive(),
        body: z.string().trim().max(1000).optional(),
        reason: z.enum(REPORT_REASONS).optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const found = await sql.query<Row>(`select id, user_id, media_path, thumb_path from showcase_items where id = $1 and hidden = false and pending = false`, [parsed.id]);
    const item = found[0];
    if (!item) return fail("That post is no longer available.");

    if (parsed.action === "like") {
      const had = await sql.query<Row>(`select 1 as x from showcase_likes where item_id = $1 and user_id = $2`, [parsed.id, context.userId]);
      if (had.length) {
        await sql.query(`delete from showcase_likes where item_id = $1 and user_id = $2`, [parsed.id, context.userId]);
        return { ok: true as const, on: false };
      }
      await sql.query(`insert into showcase_likes (item_id, user_id) values ($1, $2)`, [parsed.id, context.userId]);
      return { ok: true as const, on: true };
    }
    if (parsed.action === "save") {
      const had = await sql.query<Row>(`select 1 as x from showcase_saves where item_id = $1 and user_id = $2`, [parsed.id, context.userId]);
      if (had.length) {
        await sql.query(`delete from showcase_saves where item_id = $1 and user_id = $2`, [parsed.id, context.userId]);
        return { ok: true as const, on: false };
      }
      await sql.query(`insert into showcase_saves (item_id, user_id) values ($1, $2)`, [parsed.id, context.userId]);
      return { ok: true as const, on: true };
    }
    if (parsed.action === "view") {
      // One view per member per post.
      const fresh = await sql.query<Row>(`insert into showcase_views (item_id, user_id) values ($1, $2) on conflict do nothing returning item_id`, [parsed.id, context.userId]);
      if (fresh.length) await sql.query(`update showcase_items set views = views + 1 where id = $1`, [parsed.id]);
      return { ok: true as const };
    }
    if (parsed.action === "share") {
      const paced = await limited(sql, context.userId, "content-share", 40);
      if (paced) return paced;
      await sql.query(`update showcase_items set shares = shares + 1 where id = $1`, [parsed.id]);
      return { ok: true as const };
    }
    if (parsed.action === "list-comments") {
      const rows = await sql.query<Row>(
        `select c.id, c.body, c.created_at, p.full_name from showcase_comments c join profiles p on p.user_id = c.user_id
         where c.item_id = $1 order by c.created_at asc limit 80`,
        [parsed.id],
      );
      return {
        ok: true as const,
        comments: rows.map((r) => ({ id: num(r, "id"), author: str(r, "full_name"), body: str(r, "body"), createdAt: str(r, "created_at") })),
      };
    }
    if (parsed.action === "comment") {
      if (!parsed.body) return fail("Write a comment first.");
      const paced = await limited(sql, context.userId, "showcase-comment", 40);
      if (paced) return paced;
      await sql.query(`insert into showcase_comments (item_id, user_id, body) values ($1, $2, $3)`, [parsed.id, context.userId, cleanText(parsed.body, 1000)]);
      return { ok: true as const };
    }
    if (parsed.action === "report") {
      const paced = await limited(sql, context.userId, "report", 12);
      if (paced) return paced;
      await sql.query(`insert into reports (reporter_id, target_type, target_id, reason, details) values ($1, 'showcase', $2, $3, '')`, [
        context.userId,
        String(parsed.id),
        parsed.reason ?? "Other",
      ]);
      return { ok: true as const };
    }
    // delete: the author or a steward
    const admin = me.role === "admin";
    if (str(item, "user_id") !== context.userId && !admin) return fail("You can only remove your own posts.");
    await sql.query(`update showcase_items set hidden = true where id = $1`, [parsed.id]);
    const paths = [str(item, "media_path"), str(item, "thumb_path")].filter(Boolean);
    if (paths.length) hfBackground((hf) => hf.hfDelete(paths));
    return { ok: true as const };
  });

// ------------------------------------------------------------- stories ----

export const listStories = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const rows = await sql.query<Row>(STORIES_SQL, [context.userId]);
    const stories: StoryItem[] = rows.map((r) => ({
      id: num(r, "id"),
      userId: str(r, "user_id"),
      author: str(r, "full_name"),
      caption: str(r, "caption"),
      createdAt: str(r, "created_at"),
    }));
    return { ok: true as const, stories };
  });

export const createStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({ imageData: z.string().max(MAX_IMAGE_CHARS + 40), caption: z.string().trim().max(140).optional() }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const match = IMAGE.exec(parsed.imageData);
    if (!match || match[1].length > MAX_IMAGE_CHARS) return fail("Choose a photo (JPEG) under about 600 KB.");
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const hf = await import("@/lib/hf.server");
    if (!hf.hfConfigured()) return fail("Stories are not switched on yet.");
    if ((await usedToday(sql, context.userId, "story")) >= LIMITS.story) {
      return fail(`You have added your ${LIMITS.story} stories for today. They renew at midnight.`);
    }
    const path = `stories/${ownerSlug(context.userId)}/${fileStamp()}.jpg`;
    try {
      await hf.hfUpload(path, match[1], "Add story");
    } catch (error) {
      console.error("[story] upload failed", error instanceof Error ? error.message : error);
      return fail("Could not save your story right now. Try again in a moment.");
    }
    const rows = await sql.query<Row>(`insert into stories (user_id, media_path, caption) values ($1, $2, $3) returning id`, [
      context.userId,
      path,
      cleanText(parsed.caption ?? "", 140),
    ]);
    await spend(sql, context.userId, "story");
    return { ok: true as const, id: num(rows[0] ?? {}, "id") };
  });

export const deleteStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ id: z.number().int().positive() }), data);
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const rows = await sql.query<Row>(`select media_path from stories where id = $1 and user_id = $2 and hidden = false`, [parsed.id, context.userId]);
    if (!rows[0]) return fail("That story is already gone.");
    await sql.query(`update stories set hidden = true where id = $1`, [parsed.id]);
    const path = str(rows[0], "media_path");
    if (path) hfBackground((hf) => hf.hfDelete([path]));
    return { ok: true as const };
  });

/** Steward-only: checks that the Hugging Face dataset can be written and read. */
export const checkStorage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    if (me.role !== "admin") return fail("Steward tools are not available on this account.");
    const hf = await import("@/lib/hf.server");
    const result = await hf.hfSelfTest();
    return { ok: true as const, healthy: result.ok, steps: result.steps };
  });

/** What the signed-in member can still do today (limits renew at midnight, Malawi time). */
export const getQuota = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const [video, story] = await Promise.all([usedToday(sql, context.userId, "video"), usedToday(sql, context.userId, "story")]);
    return {
      ok: true as const,
      video: { used: video, limit: LIMITS.video, left: Math.max(0, LIMITS.video - video) },
      story: { used: story, limit: LIMITS.story, left: Math.max(0, LIMITS.story - story) },
    };
  });

/** Fresh like, comment, share and view counts for posts already on screen. */
export const showcaseCounts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ ids: z.array(z.number().int().positive()).min(1).max(40) }), data);
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const ids = [...new Set(parsed.ids)];
    const marks = ids.map((_, i) => `$${i + 2}`).join(", ");
    const rows = await sql.query<Row>(
      `select s.id, s.shares, s.views,
              (select count(*) from showcase_likes l where l.item_id = s.id) as like_count,
              (select count(*) from showcase_comments c where c.item_id = s.id) as comment_count,
              exists(select 1 from showcase_likes l where l.item_id = s.id and l.user_id = $1) as liked
       from showcase_items s where s.id in (${marks}) and s.hidden = false`,
      [context.userId, ...ids],
    );
    return {
      ok: true as const,
      counts: rows.map((r) => ({ id: num(r, "id"), likes: num(r, "like_count"), comments: num(r, "comment_count"), shares: num(r, "shares"), views: num(r, "views"), liked: flag(r, "liked") })),
    };
  });
