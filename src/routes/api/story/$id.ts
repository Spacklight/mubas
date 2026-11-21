import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";

/** Streams a story image to signed-in members while the story is under 24 hours old. */
export const Route = createFileRoute("/api/story/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await getSessionUser();
        if (!user) return new Response("Sign in to view this.", { status: 401 });
        const id = Number(params.id);
        if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        const rows = await sql.query<{ media_path: string }>(
          `select media_path from stories where id = $1 and hidden = false and created_at > now() - interval '24 hours'`,
          [id],
        );
        const path = rows[0]?.media_path;
        if (!path) return new Response("Not found", { status: 404 });
        const { hfFetch } = await import("@/lib/hf.server");
        const upstream = await hfFetch(path);
        if (!upstream.ok) return new Response("Not found", { status: 404 });
        return new Response(upstream.body, {
          status: 200,
          headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
        });
      },
    },
  },
});
