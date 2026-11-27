/** Database effects of payments and ads. No framework imports, so they can be tested on their own. */
import {
  DEFAULT_ADS_DAYS,
  DEFAULT_ADS_PRICE,
  DEFAULT_PAY_NUMBER,
  DEFAULT_PLAN_DAYS,
  msisdn,
  parseTiers,
  type Tier,
} from "./plans";

type Row = Record<string, unknown>;
type Q = { query<T = Row>(text: string, params?: unknown[]): Promise<T[]> };

export type PaySettings = { number: string; adsPrice: number; adsDays: number; planDays: number; tiers: Tier[]; plansJson: string };

export async function readPaySettings(sql: Q): Promise<PaySettings> {
  const rows = await sql.query<{ key: string; value: string }>(
    `select key, value from app_settings where key in ('pay_number', 'ads_price', 'ads_days', 'plan_days', 'plans_json')`,
  );
  const m = new Map(rows.map((r) => [String(r.key), String(r.value)]));
  const int = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(m.get(key));
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  const number = (m.get("pay_number") ?? "").replace(/[^0-9+]/g, "");
  return {
    number: msisdn(number).length === 9 ? number : DEFAULT_PAY_NUMBER,
    adsPrice: int("ads_price", DEFAULT_ADS_PRICE, 50, 100000),
    adsDays: int("ads_days", DEFAULT_ADS_DAYS, 1, 365),
    planDays: int("plan_days", DEFAULT_PLAN_DAYS, 1, 365),
    tiers: parseTiers(m.get("plans_json")),
    plansJson: m.get("plans_json") ?? "",
  };
}

/** Malawi number to +265XXXXXXXXX, or null when it is not a valid 9-digit number. */
export function toE164(value: string): string | null {
  const nine = msisdn(value);
  return nine.length === 9 && /^[189]/.test(nine) ? `+265${nine}` : null;
}

export const whatsappUrl = (e164: string, text: string) => `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000);

/** Gives the member what they paid for. Safe to call once per approved payment. */
export async function applyApproved(
  sql: Q,
  payment: { id: number; user_id: string; purpose: string; ref_id: number | null; tier: number | null },
  settings: PaySettings,
  now: Date = new Date(),
): Promise<void> {
  if (payment.purpose === "ad" && payment.ref_id) {
    await sql.query(
      `update ads set status = 'active', payment_id = $2, starts_at = $3, ends_at = $4 where id = $1 and user_id = $5`,
      [payment.ref_id, payment.id, now, addDays(now, settings.adsDays), payment.user_id],
    );
  } else if (payment.purpose === "plan" && payment.tier) {
    await sql.query(`insert into ai_plans (user_id, tier, expires_at, payment_id) values ($1, $2, $3, $4)`, [
      payment.user_id,
      payment.tier,
      addDays(now, settings.planDays),
      payment.id,
    ]);
  }
}

/** Takes back what a payment granted (used when a steward finds the payment was not real). */
export async function revokeGranted(sql: Q, payment: { id: number; purpose: string; ref_id: number | null }): Promise<void> {
  if (payment.purpose === "ad" && payment.ref_id) await sql.query(`update ads set status = 'revoked' where id = $1`, [payment.ref_id]);
  if (payment.purpose === "plan") await sql.query(`delete from ai_plans where payment_id = $1`, [payment.id]);
}

/** Ads to show right now, least-shown first so every paid ad gets a fair share. */
export const ACTIVE_ADS_SQL = `select a.id, a.item_id, a.business, a.phone, a.cta_url, s.title, s.body, s.kind, s.media_path, s.thumb_path, s.link_url
  from ads a join showcase_items s on s.id = a.item_id
  where a.status = 'active' and a.ends_at > $1 and s.hidden = false and s.pending = false
  order by a.impressions asc, a.id asc
  limit 8`;
