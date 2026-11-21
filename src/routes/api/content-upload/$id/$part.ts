import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";

const MAX_PART = 64 * 1024 * 1024;

/**
 * Relays one part of a video upload to Hugging Face storage. The signed storage
 * address stays on the server; the browser only talks to this route.
 */
export const Route = createFileRoute("/api/content-upload/$id/$part")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const user = await getSessionUser();
        if (!user) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
        const id = Number(params.id);
        const part = Number(params.part);
        if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(part) || part <= 0) {
          return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
        }
        const length = Number(request.headers.get("content-length") ?? 0);
        if (!length || length > MAX_PART) return Response.json({ ok: false, error: "That part is too large." }, { status: 413 });
        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        const rows = await sql.query<{ upload_plan: string | null }>(
          `select upload_plan from showcase_items where id = $1 and user_id = $2 and pending = true`,
          [id, user.id],
        );
        const row = rows[0];
        if (!row?.upload_plan) return Response.json({ ok: false, error: "This upload is not active." }, { status: 404 });
        const plan = JSON.parse(row.upload_plan) as import("@/lib/hf.server").LfsPlan;
        let url: string | undefined;
        let headers: Record<string, string> = {};
        if (plan.mode === "basic" && part === 1) {
          url = plan.putUrl;
          headers = plan.putHeaders ?? {};
        } else if (plan.mode === "multipart") {
          url = plan.partUrls?.[part - 1];
        }
        if (!url) return Response.json({ ok: false, error: "Unknown part." }, { status: 400 });
        const body = await request.arrayBuffer();
        if (body.byteLength > MAX_PART) return Response.json({ ok: false, error: "That part is too large." }, { status: 413 });
        const upstream = await fetch(url, { method: "PUT", headers, body });
        if (!upstream.ok) return Response.json({ ok: false, error: `Storage refused the part (${upstream.status}).` }, { status: 502 });
        return Response.json({ ok: true, etag: upstream.headers.get("etag") ?? "" });
      },
    },
  },
});
