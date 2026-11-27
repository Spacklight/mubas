/** Zapa AI plans and the payment rules. Pure functions, no server imports. */

export const DEFAULT_PAY_NUMBER = "0987074481";
export const DEFAULT_ADS_PRICE = 500;
export const DEFAULT_ADS_DAYS = 7;
export const DEFAULT_PLAN_DAYS = 30;

export type Feature = "quiz" | "study-plan" | "essay" | "photo" | "exam";

export type Tier = {
  /** Price in kwacha. Also the id of the plan. */
  price: number;
  name: string;
  credits: number;
  models: string[];
  maxPdfMb: number;
  maxTokens: number;
  /** Credits one HD voice answer costs. */
  voiceCost: number;
  features: Feature[];
  blurb: string;
};

export const FREE_TIER: Tier = {
  price: 0,
  name: "Free",
  credits: 20,
  models: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
  maxPdfMb: 8,
  maxTokens: 1400,
  voiceCost: 2,
  features: [],
  blurb: "Ask questions, attach PDFs and listen to answers.",
};

export const DEFAULT_TIERS: Tier[] = [
  { price: 200, name: "Plus", credits: 60, models: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"], maxPdfMb: 12, maxTokens: 1800, voiceCost: 1, features: ["quiz", "study-plan"], blurb: "3x the daily credits, quiz mode and study plans." },
  { price: 500, name: "Plus Smart", credits: 120, models: ["gemini-3.5-flash", "gemini-3.5-flash-lite"], maxPdfMb: 15, maxTokens: 2400, voiceCost: 1, features: ["quiz", "study-plan", "essay"], blurb: "A smarter model, longer answers and essay feedback." },
  { price: 750, name: "Plus Pro", credits: 200, models: ["gemini-3.6-flash", "gemini-3.5-flash"], maxPdfMb: 18, maxTokens: 3200, voiceCost: 0, features: ["quiz", "study-plan", "essay", "photo", "exam"], blurb: "Photo questions, exam mode and free HD voice." },
  { price: 1000, name: "Plus Max", credits: 300, models: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"], maxPdfMb: 20, maxTokens: 4000, voiceCost: 0, features: ["quiz", "study-plan", "essay", "photo", "exam"], blurb: "The most powerful model, the longest answers and the highest limits." },
];

export const FEATURE_LABEL: Record<Feature, string> = {
  quiz: "Quiz mode",
  "study-plan": "Study plans",
  essay: "Essay feedback",
  photo: "Photo and handwriting questions",
  exam: "Exam mode (step-by-step solutions)",
};

export function parseTiers(json: string | undefined | null): Tier[] {
  if (!json) return DEFAULT_TIERS;
  try {
    const raw = JSON.parse(json) as Partial<Tier>[];
    const ok = raw
      .filter((t) => Number.isInteger(t.price) && (t.price as number) > 0 && typeof t.name === "string" && Number.isInteger(t.credits))
      .map((t): Tier => ({
        price: t.price as number,
        name: String(t.name).slice(0, 30),
        credits: Math.max(1, Math.min(2000, t.credits as number)),
        models: (Array.isArray(t.models) ? t.models : []).map(String).filter((m) => /^[a-z0-9.-]{3,60}$/i.test(m)).slice(0, 6),
        maxPdfMb: Math.max(1, Math.min(20, Number(t.maxPdfMb) || 8)),
        maxTokens: Math.max(500, Math.min(8000, Number(t.maxTokens) || 1400)),
        voiceCost: Math.max(0, Math.min(5, Number.isInteger(t.voiceCost) ? (t.voiceCost as number) : 2)),
        features: (Array.isArray(t.features) ? t.features : []).filter((f): f is Feature => f in FEATURE_LABEL),
        blurb: String(t.blurb ?? "").slice(0, 140),
      }))
      .filter((t) => t.models.length > 0)
      .sort((a, b) => a.price - b.price);
    return ok.length ? ok : DEFAULT_TIERS;
  } catch {
    return DEFAULT_TIERS;
  }
}

type Q = { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> };

/** The best plan the member currently has (paid plans last for `plan_days`). */
export async function effectiveTier(sql: Q, userId: string, tiers: Tier[], freeCredits: number, freeModels: string[], now: Date = new Date()): Promise<{ tier: Tier; expiresAt: string | null }> {
  const rows = await sql.query<{ tier: number; expires_at: string }>(
    `select tier, expires_at from ai_plans where user_id = $1 and expires_at > $2 order by tier desc, expires_at desc limit 1`,
    [userId, now],
  );
  const hit = rows[0] && tiers.find((t) => t.price === Number(rows[0].tier));
  if (hit) return { tier: hit, expiresAt: String(rows[0].expires_at) };
  return { tier: { ...FREE_TIER, credits: freeCredits, models: freeModels }, expiresAt: null };
}

// ----------------------------------------------------- payment screenshots --

export type ProofFields = {
  isPaymentScreenshot?: boolean;
  status?: string | null;
  amountMWK?: number | null;
  recipientNumber?: string | null;
  recipientName?: string | null;
  senderNumber?: string | null;
  transactionId?: string | null;
  dateTime?: string | null;
  provider?: string | null;
  confidence?: number | null;
  looksEdited?: boolean | null;
};

export type Verdict = { verdict: "approved" | "review" | "rejected"; reason: string };

/** Last nine digits of a phone number: 0987074481, +265 987 074 481 and 265987074481 all match. */
export const msisdn = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "").slice(-9);

export const cleanTxn = (value: string | null | undefined) => {
  const v = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return v.length >= 6 && v.length <= 40 ? v : null;
};

export const MAX_PROOF_AGE_HOURS = 72;

/**
 * Decides what to do with a payment screenshot. Anything clearly wrong is
 * rejected, anything unclear goes to a steward, and only a clean, complete
 * match is approved automatically.
 */
export function judge(f: ProofFields, expected: number, payNumber: string, now: Date = new Date()): Verdict {
  if (!f.isPaymentScreenshot) return { verdict: "rejected", reason: "That does not look like a mobile money or bank payment confirmation." };
  const status = (f.status ?? "unknown").toLowerCase();
  if (status === "failed") return { verdict: "rejected", reason: "The screenshot shows a failed payment." };
  if (typeof f.amountMWK !== "number") return { verdict: "review", reason: "The amount could not be read clearly." };
  if (Math.round(f.amountMWK) !== expected) return { verdict: "rejected", reason: `The amount shown is K${Math.round(f.amountMWK)} but K${expected} is needed.` };
  const to = msisdn(f.recipientNumber);
  if (!to) return { verdict: "review", reason: "The receiving number could not be read." };
  if (to !== msisdn(payNumber)) return { verdict: "rejected", reason: `The payment went to a different number. It must be sent to ${payNumber}.` };
  if (status !== "success") return { verdict: "review", reason: "The payment status is not clearly successful." };
  if (!cleanTxn(f.transactionId)) return { verdict: "review", reason: "The transaction ID could not be read." };
  const when = f.dateTime ? new Date(f.dateTime) : null;
  if (!when || Number.isNaN(when.getTime())) return { verdict: "review", reason: "The payment date could not be read." };
  const ageHours = (now.getTime() - when.getTime()) / 3_600_000;
  if (ageHours > MAX_PROOF_AGE_HOURS) return { verdict: "rejected", reason: "That payment is more than 3 days old. Please pay again and send a new screenshot." };
  if (ageHours < -2) return { verdict: "review", reason: "The payment date is in the future." };
  if (f.looksEdited) return { verdict: "review", reason: "The screenshot may have been edited." };
  if ((f.confidence ?? 0) < 0.8) return { verdict: "review", reason: "The screenshot was not clear enough to confirm automatically." };
  return { verdict: "approved", reason: "Payment confirmed." };
}
