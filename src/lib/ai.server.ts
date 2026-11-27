/**
 * Zapa AI engine (server-only): encrypted Gemini keys, rotation across keys and
 * models, per-key request accounting, and the Gemini calls themselves.
 *
 * Google applies rate limits per *project*, so every key an admin adds should
 * come from a different project to add real capacity.
 */

export const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
export const DEFAULT_TTS_MODEL = "gemini-2.5-flash-preview-tts";
/** Stay a little under Google's 15 requests/minute and 500 requests/day per model. */
export const SAFE_RPM = 13;
export const SAFE_RPD = 470;
export const API = "https://generativelanguage.googleapis.com/v1beta";

type Row = Record<string, unknown>;
export type Q = { query<T = Row>(text: string, params?: unknown[]): Promise<T[]> };

// ------------------------------------------------------------ key vault ----

const enc = new TextEncoder();
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function vaultKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("AI_KEY_SECRET (or BETTER_AUTH_SECRET) is not set.");
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(`zapa-ai-keys:${secret}`));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealKey(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await vaultKey(secret), enc.encode(plain)));
  return `v1.${toB64(iv)}.${toB64(data)}`;
}

export async function openKey(sealed: string, secret: string): Promise<string> {
  const [version, iv, data] = sealed.split(".");
  if (version !== "v1" || !iv || !data) throw new Error("Unreadable key.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await vaultKey(secret), fromB64(data));
  return new TextDecoder().decode(plain);
}

export const secretFromEnv = () => {
  const e: Record<string, string | undefined> = typeof process !== "undefined" && process.env ? process.env : {};
  return (e.AI_KEY_SECRET || e.BETTER_AUTH_SECRET || "").trim();
};

// ------------------------------------------------------------- settings ----

export type AiSettings = { credits: number; models: string[]; ttsModel: string };

export async function readSettings(sql: Q, defaults = { credits: 20 }): Promise<AiSettings> {
  const rows = await sql.query<{ key: string; value: string }>(`select key, value from app_settings where key in ('ai_daily_credits', 'ai_models', 'ai_tts_model')`);
  const map = new Map(rows.map((r) => [String(r.key), String(r.value)]));
  const credits = Math.max(1, Math.min(500, Number(map.get("ai_daily_credits")) || defaults.credits));
  const models = (map.get("ai_models") ?? "").split(",").map((m) => m.trim()).filter((m) => /^[a-z0-9.-]{3,60}$/i.test(m));
  return { credits, models: models.length ? models : DEFAULT_MODELS, ttsModel: map.get("ai_tts_model")?.trim() || DEFAULT_TTS_MODEL };
}

export async function writeSetting(sql: Q, key: string, value: string): Promise<void> {
  await sql.query(
    `insert into app_settings (key, value) values ($1, $2) on conflict (key) do update set value = $2, updated_at = now()`,
    [key, value],
  );
}

// ----------------------------------------------------------- gemini http ----

export class GeminiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string } };
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

async function callGemini(apiKey: string, model: string, body: unknown): Promise<Row> {
  const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(50_000),
  });
  const text = await res.text();
  let json: Row = {};
  try {
    json = JSON.parse(text) as Row;
  } catch {
    json = {};
  }
  if (!res.ok) {
    const error = (json.error ?? {}) as { message?: string; status?: string };
    throw new GeminiError(res.status, `${error.status ?? res.status}: ${error.message ?? text.slice(0, 160)}`);
  }
  return json;
}

/** Cheap check that a key is real: listing models does not use generation quota. */
export async function validateKey(apiKey: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(`${API}/models?pageSize=1`, { headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, reason: body.error?.message ?? `Google answered ${res.status}` };
  } catch {
    return { ok: false, reason: "Could not reach Google to check the key." };
  }
}

// ------------------------------------------------------------ rotation -----

type Candidate = { keyId: number; model: string; used: number };

/** Every (key, model) pair that is enabled, not blocked and under its limits, least used first. */
export async function candidates(sql: Q, models: string[], now: Date = new Date()): Promise<Candidate[]> {
  const keys = await sql.query<{ id: number }>(`select id from ai_keys where enabled = true order by id`);
  if (!keys.length) return [];
  const minuteAgo = new Date(now.getTime() - 60_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const usage = await sql.query<{ key_id: number; model: string; rpd: number; rpm: number }>(
    `select key_id, model, count(*) as rpd, sum(case when created_at > $1 then 1 else 0 end) as rpm
     from ai_requests where created_at > $2 group by key_id, model`,
    [minuteAgo, dayAgo],
  );
  const blocks = await sql.query<{ key_id: number; model: string }>(`select key_id, model from ai_blocks where blocked_until > $1`, [now]);
  const blocked = new Set(blocks.map((b) => `${b.key_id}:${b.model}`));
  const used = new Map(usage.map((u) => [`${u.key_id}:${u.model}`, { rpd: Number(u.rpd) || 0, rpm: Number(u.rpm) || 0 }]));
  const out: Candidate[] = [];
  for (const model of models) {
    for (const key of keys) {
      const k = `${key.id}:${model}`;
      const u = used.get(k) ?? { rpd: 0, rpm: 0 };
      if (blocked.has(k) || u.rpm >= SAFE_RPM || u.rpd >= SAFE_RPD) continue;
      out.push({ keyId: Number(key.id), model, used: u.rpd });
    }
  }
  // Prefer the first model in the list, but within it spread load across keys.
  const order = new Map(models.map((m, i) => [m, i]));
  return out.sort((a, b) => (order.get(a.model)! - order.get(b.model)!) || a.used - b.used);
}

async function block(sql: Q, keyId: number, model: string, seconds: number, reason: string, now: Date) {
  await sql.query(
    `insert into ai_blocks (key_id, model, blocked_until, reason) values ($1, $2, $3, $4)
     on conflict (key_id, model) do update set blocked_until = $3, reason = $4`,
    [keyId, model, new Date(now.getTime() + seconds * 1000), reason.slice(0, 200)],
  );
}

export class NoCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoCapacityError";
  }
}

/**
 * Runs `body` against the best available key and model, moving on to the next
 * pair when Google reports a rate limit, an overload or a bad key.
 */
export async function runWithRotation(
  sql: Q,
  models: string[],
  body: unknown,
  opts: { secret: string; now?: Date; maxTries?: number } = { secret: secretFromEnv() },
): Promise<{ json: Row; keyId: number; model: string }> {
  const now = opts.now ?? new Date();
  const list = await candidates(sql, models, now);
  if (!list.length) throw new NoCapacityError("Zapa AI is busy right now. Please try again in a minute.");
  let lastError: unknown = null;
  for (const c of list.slice(0, opts.maxTries ?? 4)) {
    const keyRows = await sql.query<{ key_cipher: string }>(`select key_cipher from ai_keys where id = $1 and enabled = true`, [c.keyId]);
    if (!keyRows[0]) continue;
    let apiKey: string;
    try {
      apiKey = await openKey(String(keyRows[0].key_cipher), opts.secret);
    } catch {
      await sql.query(`update ai_keys set enabled = false, note = $2 where id = $1`, [c.keyId, "Could not decrypt (secret changed?)"]);
      continue;
    }
    await sql.query(`insert into ai_requests (key_id, model, created_at) values ($1, $2, $3)`, [c.keyId, c.model, now]);
    try {
      const json = await callGemini(apiKey, c.model, body);
      return { json, keyId: c.keyId, model: c.model };
    } catch (error) {
      lastError = error;
      if (!(error instanceof GeminiError)) {
        await block(sql, c.keyId, c.model, 30, "network error", now);
        continue;
      }
      if (error.status === 429) {
        const daily = /per day|daily|PerDay/i.test(error.message);
        await block(sql, c.keyId, c.model, daily ? 3600 : 65, daily ? "daily limit" : "rate limit", now);
      } else if (error.status >= 500) {
        await block(sql, c.keyId, c.model, 20, "Google overloaded", now);
      } else if (error.status === 400 && /API key not valid|API_KEY_INVALID/i.test(error.message)) {
        await sql.query(`update ai_keys set enabled = false, note = $2 where id = $1`, [c.keyId, "Google rejected this key"]);
      } else if (error.status === 404 || (error.status === 400 && /not found|is not supported|not available/i.test(error.message))) {
        await block(sql, c.keyId, c.model, 3600, "model unavailable", now);
      } else if (error.status === 403) {
        await sql.query(`update ai_keys set enabled = false, note = $2 where id = $1`, [c.keyId, "Key not allowed (403)"]);
      } else {
        throw error; // a real problem with the request itself
      }
    }
  }
  if (lastError instanceof GeminiError && lastError.status === 429) {
    throw new NoCapacityError("Zapa AI has reached its limit for the moment. Please try again soon.");
  }
  throw new NoCapacityError("Zapa AI could not answer right now. Please try again.");
}

// ------------------------------------------------------------- chatting ----

const DIGEST_MARK = "[[DIGEST]]";

export const SYSTEM_PROMPT = `You are Zapa AI, a friendly study assistant for students at the Malawi University of Business and Applied Sciences (MUBAS) in Malawi.
- Explain clearly in simple English with short paragraphs, numbered key points and concrete examples. Use examples from Malawi and Southern Africa when helpful (kwacha, local businesses, local geography).
- Be accurate. If you are not sure, say so. Do not invent facts, citations or quotes.
- When a reference document is provided, base your answer on it and say if it does not contain the answer.
- You are not an official MUBAS service and you cannot give official decisions about fees, results or admissions. Point students to the official MUBAS channels for those.
- Help students learn: guide them to understand instead of only giving final answers to assignments.
- Keep answers under about 300 words unless the student asks for more. Use **bold** for key terms. Do not use tables or HTML.
- Decline anything harmful, hateful or sexual.`;

export type ChatMode = "chat" | "quiz" | "study-plan" | "essay" | "exam";

export type ChatInput = {
  history: { role: "user" | "model"; body: string }[];
  message: string;
  digest?: string;
  fileName?: string;
  pdf?: { data: string };
  /** A JPEG photo of notes or handwriting (paid plans). */
  image?: { data: string };
  mode?: ChatMode;
  maxTokens?: number;
};

const MODE_PROMPTS: Record<ChatMode, string> = {
  chat: "",
  quiz: "\nQuiz mode: ask ONE question at a time about the topic (mix multiple choice and short answer). Wait for the student's answer, say whether it is right, explain briefly, keep a running score, then ask the next question.",
  "study-plan": "\nStudy plan mode: build a realistic day-by-day study plan with times, topics, active-recall tasks and short breaks. If the exam date or the hours per day are missing, ask for them first.",
  essay: "\nEssay feedback mode: give feedback on structure, argument, evidence, clarity and grammar. Quote short parts. Score each area out of 10. Rewrite only the weakest paragraph as an example. Do not write the whole essay for the student.",
  exam: "\nExam mode: solve the problem step by step. Show the formulas, the working and your assumptions, state the final answer clearly, then give a quick check of the answer.",
};

export type ChatResult = { reply: string; digest: string | null; keyId: number; model: string };

export function buildChatBody(input: ChatInput) {
  const contents: GeminiContent[] = input.history.map((m) => ({ role: m.role, parts: [{ text: m.body }] }));
  const parts: GeminiPart[] = [];
  if (input.pdf) parts.push({ inlineData: { mimeType: "application/pdf", data: input.pdf.data } });
  if (input.image) parts.push({ inlineData: { mimeType: "image/jpeg", data: input.image.data } });
  if (!input.pdf && input.digest) {
    parts.push({ text: `Reference document "${input.fileName ?? "file"}" (a digest of its contents):\n${input.digest}\n\n---` });
  }
  parts.push({ text: input.message });
  contents.push({ role: "user", parts });
  const extra = input.pdf
    ? `\nA PDF is attached. Answer the student's request using it. Then, at the very end, add a line containing exactly ${DIGEST_MARK} followed by a compact digest of the document (headings, key facts, definitions, formulas, up to 900 words) that you can use to answer later questions.`
    : "";
  const photo = input.image ? "\nA photo of notes, a textbook page or handwriting is attached. Read it carefully before answering." : "";
  const base = input.maxTokens ?? 1400;
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT + MODE_PROMPTS[input.mode ?? "chat"] + photo + extra }] },
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: input.pdf ? base + 1200 : base },
  };
}

export function readReply(json: Row): { text: string; digest: string | null } {
  const feedback = json.promptFeedback as { blockReason?: string } | undefined;
  if (feedback?.blockReason) throw new GeminiError(400, "Zapa AI cannot help with that request.");
  const candidate = ((json.candidates as Row[] | undefined) ?? [])[0];
  const parts = ((candidate?.content as { parts?: GeminiPart[] } | undefined)?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!parts) throw new GeminiError(502, "Zapa AI returned an empty answer. Try rephrasing.");
  const at = parts.indexOf(DIGEST_MARK);
  if (at < 0) return { text: parts, digest: null };
  return { text: parts.slice(0, at).trim(), digest: parts.slice(at + DIGEST_MARK.length).trim().slice(0, 9000) || null };
}

export async function chat(sql: Q, models: string[], input: ChatInput, secret = secretFromEnv()): Promise<ChatResult> {
  const { json, keyId, model } = await runWithRotation(sql, models, buildChatBody(input), { secret });
  const { text, digest } = readReply(json);
  return { reply: text, digest, keyId, model };
}

// -------------------------------------------------------------- speech -----

export const SPEECH_MAX_CHARS = 1500;

/** Plain text for speech: removes markdown marks. */
export const forSpeech = (text: string) =>
  text.replace(/\*\*|__|`/g, "").replace(/^\s*[-*]\s+/gm, "").replace(/^\s*\d+\.\s+/gm, (m) => m).replace(/\s+/g, " ").trim().slice(0, SPEECH_MAX_CHARS);

/** Returns raw 16-bit mono PCM at 24 kHz as base64; the browser wraps it into a playable file. */
export async function speak(sql: Q, ttsModel: string, text: string, secret = secretFromEnv()): Promise<{ pcm: string; keyId: number }> {
  const body = {
    contents: [{ role: "user", parts: [{ text: `Read this aloud in a warm, clear, friendly teaching voice, at a steady pace:\n${forSpeech(text)}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
  };
  const { json, keyId } = await runWithRotation(sql, [ttsModel], body, { secret });
  const part = (((json.candidates as Row[] | undefined) ?? [])[0]?.content as { parts?: GeminiPart[] } | undefined)?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new GeminiError(502, "No audio came back.");
  return { pcm: part.inlineData.data, keyId };
}
