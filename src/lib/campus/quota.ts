/** Daily limits. Days run on Malawi time (UTC+2, no daylight saving) and renew at midnight. */

export const LIMITS = { video: 5, story: 10 } as const;
export const DEFAULT_AI_CREDITS = 20;
export type UsageKind = "video" | "story" | "ai";

type Q = { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> };

export const dayKey = (now: Date = new Date()) => new Date(now.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);

/** Whole minutes until the next Malawi midnight. */
export const minutesUntilRenewal = (now: Date = new Date()) => {
  const local = new Date(now.getTime() + 2 * 3_600_000);
  const next = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - local.getTime()) / 60_000));
};

export async function usedToday(sql: Q, userId: string, kind: UsageKind, now?: Date): Promise<number> {
  const rows = await sql.query<{ used: number }>(`select used from daily_usage where user_id = $1 and day = $2 and kind = $3`, [userId, dayKey(now), kind]);
  return Number(rows[0]?.used ?? 0) || 0;
}

/** Adds `amount` to today's usage. Callers check the limit first with usedToday. */
export async function spend(sql: Q, userId: string, kind: UsageKind, amount = 1, now?: Date): Promise<number> {
  const rows = await sql.query<{ used: number }>(
    `insert into daily_usage (user_id, day, kind, used) values ($1, $2, $3, $4)
     on conflict (user_id, day, kind) do update set used = daily_usage.used + $4
     returning used`,
    [userId, dayKey(now), kind, amount],
  );
  return Number(rows[0]?.used ?? amount);
}

export async function refund(sql: Q, userId: string, kind: UsageKind, amount = 1, now?: Date): Promise<void> {
  await sql.query(
    `update daily_usage set used = case when used >= $4 then used - $4 else 0 end where user_id = $1 and day = $2 and kind = $3`,
    [userId, dayKey(now), kind, amount],
  );
}
