import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { cleanHttpUrl, cleanText, REPORT_REASONS } from "@/lib/campus/logic";
import type { Fail } from "@/lib/campus/types";

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
  hasImage: boolean;
  linkUrl: string | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  createdAt: string;
};

type Row = Record<string, unknown>;

const fail = (error: string): Fail => ({ ok: false, error });
const str = (row: Row, key: string) => (row[key] == null ? "" : String(row[key]));
const num = (row: Row, key: string) => Number(row[key] ?? 0) || 0;
const flag = (row: Row, key: string) => row[key] === true || row[key] === 1 || row[key] === "1" || row[key] === "t";

async function db() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function member(sql: Awaited<ReturnType<typeof db>>, userId: string) {
  const rows = await sql.query<Row>(`select full_name, role, account_status from profiles where user_id = $1`, [userId]);
  const row = rows[0];
  if (!row) return fail("Finish your campus profile first.");
  if (str(row, "account_status") !== "active") return fail("This account cannot post right now.");
  return { name: str(row, "full_name"), role: str(row, "role") };
}

async function limited(sql: Awaited<ReturnType<typeof db>>, userId: string, action: string, limit: number): Promise<Fail | null> {
  const rows = await sql.query<Row>(
    `select count(*)::int as n from rate_hits where user_id = $1 and action = $2 and hit_at > now() - interval '1 hour'`,
    [userId, action],
  );
  if (num(rows[0] ?? {}, "n") >= limit) return fail("You are sharing very quickly. Try again in a little while.");
  await sql.query(`insert into rate_hits (user_id, action) values ($1, $2)`, [userId, action]);
  return null;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T | Fail {
  const result = schema.safeParse(input);
  return result.success ? result.data : fail(result.error.issues[0]?.message ?? "Check the form and try again.");
}

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
    hasImage: Boolean(row.media_path),
    linkUrl: row.link_url ? str(row, "link_url") : null,
    likeCount: num(row, "like_count"),
    commentCount: num(row, "comment_count"),
    liked: flag(row, "liked"),
    createdAt: str(row, "created_at"),
  };
}

const PAGE = 12;

export const listShowcase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        offset: z.number().int().min(0).max(600).optional(),
        kind: z.enum(["post", "image", "video"]).optional(),
        category: z.string().max(40).optional(),
        authorId: z.string().max(80).optional(),
        q: z.string().trim().max(60).optional(),
      }),
      data ?? {},
    );
    if ("ok" in parsed) return parsed;
    const sql = await db();
    const me = await member(sql, context.userId);
    if ("ok" in me) return me;
    const params: unknown[] = [context.userId];
    let where = `s.hidden = false and p.account_status = 'active'
      and not exists (select 1 from blocks b where (b.blocker_id = $1 and b.blocked_id = s.user_id) or (b.blocker_id = s.user_id and b.blocked_id = $1))`;
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where += ` and ${clause.replaceAll("?", `$${params.length}`)}`;
    };
    if (parsed.kind) add("s.kind = ?", parsed.kind);
    if (parsed.category) add("s.category = ?", parsed.category);
    if (parsed.authorId) add("s.user_id = ?", parsed.authorId);
    if (parsed.q) add("(s.title ilike ? or s.body ilike ?)", `%${parsed.q}%`);
    params.push(PAGE, parsed.offset ?? 0);
    const rows = await sql.query<Row>(
      `select s.id, s.user_id, s.kind, s.title, s.body, s.category, s.media_path, s.link_url, s.created_at,
              p.full_name, p.role, p.role_confirmed,
              (select count(*) from showcase_likes l where l.item_id = s.id) as like_count,
              (select count(*) from showcase_comments c where c.item_id = s.id) as comment_count,
              exists(select 1 from showcase_likes l where l.item_id = s.id and l.user_id = $1) as liked
       from showcase_items s join profiles p on p.user_id = s.user_id
       where ${where}
       order by s.created_at desc, s.id desc
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    return { ok: true as const, items: rows.map(map), more: rows.length === PAGE };
  });

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
      const owner = context.userId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "member";
      path = `showcase/${owner}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      try {
        await hf.hfUpload(path, base64, "Add showcase photo");
      } catch (error) {
        console.error("[showcase] upload failed", error instanceof Error ? error.message : error);
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
      if (path) void import("@/lib/hf.server").then((hf) => hf.hfDelete([path as string])).catch(() => undefined);
      throw error;
    }
  });

export const showcaseAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        action: z.enum(["like", "comment", "list-comments", "delete", "report"]),
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
    const found = await sql.query<Row>(`select id, user_id, media_path from showcase_items where id = $1 and hidden = false`, [parsed.id]);
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
    const path = item.media_path ? str(item, "media_path") : "";
    if (path) void import("@/lib/hf.server").then((hf) => hf.hfDelete([path])).catch(() => undefined);
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
