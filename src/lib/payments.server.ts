/**
 * Reads a payment screenshot with Gemini and decides whether to approve it
 * (server-only). A screenshot is only evidence: anything unclear goes to a
 * steward, and approvals are listed in the steward area to cross-check with the
 * mobile money statement.
 */
import { runWithRotation, NoCapacityError, secretFromEnv, type Q } from "./ai.server";
import { judge, type ProofFields, type Verdict } from "./campus/plans";

const PROMPT = `This image should be a screenshot of a payment confirmation in Malawi (Airtel Money, TNM Mpamba, a bank app, or an SMS).
Read only what is printed. Never guess. Reply with ONLY a JSON object with these keys:
isPaymentScreenshot (boolean),
status ("success", "failed", "pending" or "unknown"),
amountMWK (number, the amount in kwacha),
recipientNumber (string, the number or account that RECEIVED the money, exactly as shown),
recipientName (string or null),
senderNumber (string or null),
transactionId (string or null),
dateTime (ISO 8601 including the +02:00 offset when both date and time are visible, otherwise null),
provider (string or null),
confidence (number 0 to 1: how sure you are about the amount, the receiving number and the transaction ID),
looksEdited (boolean: true if text looks pasted, misaligned, or the fonts are inconsistent).
Use null for anything you cannot see.`;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && v.trim() ? n : null;
  }
  return null;
};
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null);

export function parseProof(raw: string): ProofFields {
  const cleaned = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const o = JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned) as Record<string, unknown>;
  const conf = num(o.confidence);
  return {
    isPaymentScreenshot: o.isPaymentScreenshot === true,
    status: text(o.status)?.toLowerCase() ?? "unknown",
    amountMWK: num(o.amountMWK),
    recipientNumber: text(o.recipientNumber),
    recipientName: text(o.recipientName),
    senderNumber: text(o.senderNumber),
    transactionId: text(o.transactionId),
    dateTime: text(o.dateTime),
    provider: text(o.provider),
    confidence: conf === null ? null : Math.max(0, Math.min(1, conf)),
    looksEdited: o.looksEdited === true,
  };
}

export async function verifyProof(
  sql: Q,
  opts: { imageBase64: string; expected: number; payNumber: string; models: string[]; secret?: string; now?: Date },
): Promise<{ fields: ProofFields; result: Verdict }> {
  const body = {
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: opts.imageBase64 } }, { text: PROMPT }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 700, responseMimeType: "application/json" },
  };
  try {
    const { json } = await runWithRotation(sql, opts.models, body, { secret: opts.secret ?? secretFromEnv(), now: opts.now });
    const candidate = ((json.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined) ?? [])[0];
    const raw = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const fields = parseProof(raw);
    return { fields, result: judge(fields, opts.expected, opts.payNumber, opts.now) };
  } catch (error) {
    if (error instanceof NoCapacityError) return { fields: {}, result: { verdict: "review", reason: "Automatic checking is busy. A steward will review your payment." } };
    if (error instanceof SyntaxError) return { fields: {}, result: { verdict: "review", reason: "The screenshot could not be read automatically. A steward will review it." } };
    throw error;
  }
}
