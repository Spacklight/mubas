/** Small helpers shared by the Zapa Content and Zapa AI server functions. */
import { z } from "zod";
import type { Fail } from "@/lib/campus/types";

export type Row = Record<string, unknown>;

export const fail = (error: string): Fail => ({ ok: false, error });
export const str = (row: Row, key: string) => (row[key] == null ? "" : String(row[key]));
export const num = (row: Row, key: string) => Number(row[key] ?? 0) || 0;
export const flag = (row: Row, key: string) => row[key] === true || row[key] === 1 || row[key] === "1" || row[key] === "t";

export async function db() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}
export type Sql = Awaited<ReturnType<typeof db>>;

export async function member(sql: Sql, userId: string) {
  const rows = await sql.query<Row>(`select full_name, role, account_status from profiles where user_id = $1`, [userId]);
  const row = rows[0];
  if (!row) return fail("Finish your campus profile first.");
  if (str(row, "account_status") !== "active") return fail("This account cannot do that right now.");
  return { name: str(row, "full_name"), role: str(row, "role") };
}

export async function limited(sql: Sql, userId: string, action: string, limit: number): Promise<Fail | null> {
  const rows = await sql.query<Row>(
    `select count(*)::int as n from rate_hits where user_id = $1 and action = $2 and hit_at > now() - interval '1 hour'`,
    [userId, action],
  );
  if (num(rows[0] ?? {}, "n") >= limit) return fail("You are doing that very quickly. Try again in a little while.");
  await sql.query(`insert into rate_hits (user_id, action) values ($1, $2)`, [userId, action]);
  return null;
}

export function parse<T>(schema: z.ZodType<T>, input: unknown): T | Fail {
  const result = schema.safeParse(input);
  return result.success ? result.data : fail(result.error.issues[0]?.message ?? "Check the form and try again.");
}

export async function audit(sql: Sql, actorId: string, action: string, detail: string) {
  await sql.query(`insert into audit_logs (actor_id, action, detail) values ($1, $2, $3)`, [actorId, action, detail.slice(0, 300)]);
}

export const isAdmin = (role: string) => role === "admin";
