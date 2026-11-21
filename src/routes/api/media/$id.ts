import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";

const TYPES = new Set(["image/jpeg", "video/mp4", "video/webm", "video/quicktime"]);

/**
 * Streams a Zapa Content photo or video (or its poster with ?thumb=1) from the
 * private Hugging Face dataset to signed-in members. Supports Range requests so
 * videos can start playing and seek without downloading everything.
 */
export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getSessionUser();
        if (!user) return new Response("Sign in to view this.", { status: 401 });
        const id = Number(params.id);
        if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
        const wantsThumb = new URL(request.url).searchParams.get("thumb") === "1";
        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        const rows = await sql.query<{ media_path: string | null; thumb_path: string | null; media_type: string | null }>(
          `select media_path, thumb_path, media_type from showcase_items where id = $1 and hidden = false and pending = false`,
          [id],
        );
        const row = rows[0];
        const path = wantsThumb ? row?.thumb_path : row?.media_path;
        if (!path) return new Response("Not found", { status: 404 });
        const { hfFetch } = await import("@/lib/hf.server");
        const upstream = await hfFetch(path, request.headers.get("range"));
        if (!upstream.ok) return new Response("Not found", { status: 404 });
        const type = wantsThumb ? "image/jpeg" : row?.media_type && TYPES.has(row.media_type) ? row.media_type : "application/octet-stream";
        const headers = new Headers({ "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" });
        for (const name of ["content-length", "content-range"]) {
          const value = upstream.headers.get(name);
          if (value) headers.set(name, value);
        }
        return new Response(upstream.body, { status: upstream.status, headers });
      },
    },
  },
});
