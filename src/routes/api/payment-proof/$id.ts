import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";

/** Streams a payment screenshot to stewards only. */
export const Route = createFileRoute("/api/payment-proof/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await getSessionUser();
        if (!user) return new Response("Sign in first.", { status: 401 });
        const id = Number(params.id);
        if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        const me = await sql.query<{ role: string }>(`select role from profiles where user_id = $1 and account_status = 'active'`, [user.id]);
        if (me[0]?.role !== "admin") return new Response("Stewards only.", { status: 403 });
        const rows = await sql.query<{ proof_path: string | null }>(`select proof_path from payments where id = $1`, [id]);
        const path = rows[0]?.proof_path;
        if (!path) return new Response("Not found", { status: 404 });
        const { hfFetch } = await import("@/lib/hf.server");
        const upstream = await hfFetch(path);
        if (!upstream.ok) return new Response("Not found", { status: 404 });
        return new Response(upstream.body, { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
      },
    },
  },
});
