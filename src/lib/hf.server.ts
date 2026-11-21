/**
 * Hugging Face dataset storage (server-only).
 *
 * Showcase photos are stored as files in a private dataset repo (default name
 * "mubas") and streamed back through /api/media/:id, so the HF token never
 * reaches the browser and only signed-in members can see the files.
 *
 * Env (Cloudflare secrets): HF_TOKEN (write access), HF_DATASET_REPO ("owner/mubas").
 */

const HF = "https://huggingface.co";

function conf() {
  const e: Record<string, string | undefined> = typeof process !== "undefined" && process.env ? process.env : {};
  return { token: e.HF_TOKEN?.trim() || undefined, repo: e.HF_DATASET_REPO?.trim() || undefined };
}

export function hfConfigured(): boolean {
  const c = conf();
  return Boolean(c.token && c.repo);
}

export class HfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HfError";
  }
}

function need() {
  const c = conf();
  if (!c.token || !c.repo) throw new HfError("Hugging Face storage is not configured (HF_TOKEN, HF_DATASET_REPO).");
  return { token: c.token, repo: c.repo };
}

async function explain(res: Response, what: string): Promise<HfError> {
  let body = "";
  try {
    body = (await res.text()).slice(0, 300);
  } catch {
    body = "";
  }
  return new HfError(`${what} failed: HTTP ${res.status} ${body}`.trim());
}

/** Size in bytes of a base64 string. */
export function base64Size(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function commit(lines: unknown[], summary: string): Promise<void> {
  const { token, repo } = need();
  const body = [{ key: "header", value: { summary, description: "" } }, ...lines].map((l) => JSON.stringify(l)).join("\n");
  const res = await fetch(`${HF}/api/datasets/${repo}/commit/main`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-ndjson" },
    body,
  });
  if (!res.ok) throw await explain(res, "Saving to Hugging Face");
}

/** Upload one file (base64) to the dataset. Handles both regular and LFS storage. */
export async function hfUpload(path: string, base64: string, summary = "Add showcase file"): Promise<void> {
  const { token, repo } = need();
  const size = base64Size(base64);

  const pre = await fetch(`${HF}/api/datasets/${repo}/preupload/main`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ path, sample: base64.slice(0, 684), size }] }),
  });
  if (!pre.ok) throw await explain(pre, "Checking the upload");
  const info = (await pre.json()) as { files?: Array<{ uploadMode?: string }> };
  const mode = info.files?.[0]?.uploadMode ?? "regular";

  if (mode !== "lfs") {
    await commit([{ key: "file", value: { content: base64, path, encoding: "base64" } }], summary);
    return;
  }

  const bytes = fromBase64(base64);
  const oid = await sha256Hex(bytes);
  const batch = await fetch(`${HF}/datasets/${repo}.git/info/lfs/objects/batch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.git-lfs+json",
      "Content-Type": "application/vnd.git-lfs+json",
    },
    body: JSON.stringify({ operation: "upload", transfers: ["basic"], objects: [{ oid, size }], hash_algo: "sha256", ref: { name: "main" } }),
  });
  if (!batch.ok) throw await explain(batch, "Preparing the file upload");
  const plan = (await batch.json()) as {
    objects?: Array<{ error?: { message?: string }; actions?: { upload?: { href: string; header?: Record<string, string> }; verify?: { href: string; header?: Record<string, string> } } }>;
  };
  const object = plan.objects?.[0];
  if (object?.error) throw new HfError(`Hugging Face refused the file: ${object.error.message ?? "unknown error"}`);
  const upload = object?.actions?.upload;
  if (upload) {
    const put = await fetch(upload.href, { method: "PUT", headers: upload.header ?? {}, body: bytes as unknown as BodyInit });
    if (!put.ok) throw await explain(put, "Uploading the file");
    const verify = object?.actions?.verify;
    if (verify) {
      const v = await fetch(verify.href, {
        method: "POST",
        headers: { ...(verify.header ?? {}), "Content-Type": "application/vnd.git-lfs+json", Accept: "application/vnd.git-lfs+json" },
        body: JSON.stringify({ oid, size }),
      });
      if (!v.ok) throw await explain(v, "Verifying the upload");
    }
  }
  await commit([{ key: "lfsFile", value: { path, algo: "sha256", size, oid } }], summary);
}

// ---------------------------------------------------------------------------
// Direct video upload (Git LFS). The browser never sees Hugging Face URLs or
// tokens: the server asks Hugging Face for an upload plan, keeps it, and relays
// each part the browser sends (see /api/content-upload).
// ---------------------------------------------------------------------------

export type LfsPlan = {
  mode: "none" | "basic" | "multipart";
  putUrl?: string;
  putHeaders?: Record<string, string>;
  chunkSize?: number;
  partUrls?: string[];
  completionUrl?: string;
  verifyUrl?: string;
  verifyHeaders?: Record<string, string>;
};

const LFS_JSON = { Accept: "application/vnd.git-lfs+json", "Content-Type": "application/vnd.git-lfs+json" };

export async function hfLfsPlan(oid: string, size: number): Promise<LfsPlan> {
  const { token, repo } = need();
  const res = await fetch(`${HF}/datasets/${repo}.git/info/lfs/objects/batch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, ...LFS_JSON },
    body: JSON.stringify({ operation: "upload", transfers: ["basic", "multipart"], objects: [{ oid, size }], hash_algo: "sha256", ref: { name: "main" } }),
  });
  if (!res.ok) throw await explain(res, "Preparing the video upload");
  const body = (await res.json()) as {
    objects?: Array<{
      error?: { message?: string };
      actions?: {
        upload?: { href: string; header?: Record<string, string> };
        verify?: { href: string; header?: Record<string, string> };
      };
    }>;
  };
  const object = body.objects?.[0];
  if (object?.error) throw new HfError(`Hugging Face refused the video: ${object.error.message ?? "unknown error"}`);
  const upload = object?.actions?.upload;
  const verify = object?.actions?.verify;
  const plan: LfsPlan = { mode: "none", verifyUrl: verify?.href, verifyHeaders: verify?.header };
  if (!upload) return plan; // the same file is already stored
  const header = { ...(upload.header ?? {}) };
  const chunk = Number(header.chunk_size);
  delete header.chunk_size;
  if (Number.isFinite(chunk) && chunk > 0) {
    const partUrls = Object.entries(header)
      .filter(([key]) => /^\d+$/.test(key))
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, url]) => url);
    return { ...plan, mode: "multipart", chunkSize: chunk, partUrls, completionUrl: upload.href };
  }
  return { ...plan, mode: "basic", putUrl: upload.href, putHeaders: header };
}

/** Finish a multipart upload and verify the object with Hugging Face. */
export async function hfLfsFinish(plan: LfsPlan, oid: string, size: number, etags: string[]): Promise<void> {
  const { token } = need();
  if (plan.mode === "multipart") {
    if (!plan.completionUrl) throw new HfError("Upload plan is incomplete.");
    const res = await fetch(plan.completionUrl, {
      method: "POST",
      headers: LFS_JSON,
      body: JSON.stringify({ oid, parts: etags.map((etag, i) => ({ partNumber: i + 1, etag })) }),
    });
    if (!res.ok) throw await explain(res, "Finishing the video upload");
  }
  if (plan.verifyUrl) {
    const res = await fetch(plan.verifyUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...(plan.verifyHeaders ?? {}), ...LFS_JSON },
      body: JSON.stringify({ oid, size }),
    });
    if (!res.ok) throw await explain(res, "Verifying the video");
  }
}

export async function hfCommitLfs(path: string, oid: string, size: number, summary = "Add video"): Promise<void> {
  await commit([{ key: "lfsFile", value: { path, algo: "sha256", size, oid } }], summary);
}

export async function hfDelete(paths: string[], summary = "Remove showcase file"): Promise<void> {
  if (!paths.length) return;
  await commit(paths.map((path) => ({ key: "deletedFile", value: { path } })), summary);
}

/** Stream a file back from the dataset (supports Range for video/audio). */
export async function hfFetch(path: string, range?: string | null): Promise<Response> {
  const { token, repo } = need();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (range) headers.Range = range;
  return fetch(`${HF}/datasets/${repo}/resolve/main/${path.split("/").map(encodeURIComponent).join("/")}`, { headers, redirect: "follow" });
}

/** Writes and reads back a tiny file so an admin can see exactly what fails. */
export async function hfSelfTest(): Promise<{ ok: boolean; steps: string[] }> {
  const steps: string[] = [];
  try {
    if (!hfConfigured()) return { ok: false, steps: ["HF_TOKEN or HF_DATASET_REPO is missing."] };
    const path = "diagnostics/selftest.txt";
    await hfUpload(path, btoa(`ok ${new Date().toISOString()}`), "Zapa self-test");
    steps.push("Upload works.");
    const back = await hfFetch(path);
    steps.push(back.ok ? "Read-back works." : `Read-back failed: HTTP ${back.status}`);
    if (!back.ok) return { ok: false, steps };
    await hfDelete([path], "Zapa self-test cleanup");
    steps.push("Delete works.");
    return { ok: true, steps };
  } catch (error) {
    steps.push(error instanceof Error ? error.message : String(error));
    return { ok: false, steps };
  }
}
