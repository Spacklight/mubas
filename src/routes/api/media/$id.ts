import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";

/**
 * Streams a Showcase photo from the private Hugging Face dataset to signed-in
 * members. The dataset token never leaves the server.
 */
export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getSessionUser();
        if (!user) return new Response("Sign in to view this.", { status: 401 });
        const id = Number(params.id);
        if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        const rows = await sql.query<{ media_path: string | null; media_type: string | null }>(
          `select media_path, media_type from showcase_items where id = $1 and hidden = false`,
          [id],
        );
        const path = rows[0]?.media_path;
        if (!path) return new Response("Not found", { status: 404 });
        const { hfFetch } = await import("@/lib/hf.server");
        const upstream = await hfFetch(path, request.headers.get("range"));
        if (!upstream.ok) return new Response("Not found", { status: 404 });
        const headers = new Headers({
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        });
        for (const name of ["content-length", "content-range", "accept-ranges"]) {
          const value = upstream.headers.get(name);
          if (value) headers.set(name, value);
        }
        return new Response(upstream.body, { status: upstream.status, headers });
      },
    },
  },
});
