/** Browser-side helpers for uploading a video to Zapa Content (stored on Hugging Face). */
import { finishVideoUpload, MAX_VIDEO_BYTES, startVideoUpload, VIDEO_TYPES, type SHOWCASE_CATEGORIES } from "@/lib/campus/showcase";
import { unwrap } from "@/components/page-kit";

export type UploadStage = "preparing" | "uploading" | "saving";

const BY_EXTENSION: Record<string, (typeof VIDEO_TYPES)[number]> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

export function videoTypeOf(file: File): (typeof VIDEO_TYPES)[number] | null {
  if ((VIDEO_TYPES as readonly string[]).includes(file.type)) return file.type as (typeof VIDEO_TYPES)[number];
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? null;
}

export function checkVideo(file: File): string | null {
  if (!videoTypeOf(file)) return "Choose an MP4, MOV or WebM video.";
  if (file.size > MAX_VIDEO_BYTES) return `That video is ${(file.size / 1048576).toFixed(0)} MB. The limit is ${MAX_VIDEO_BYTES / 1048576} MB, so trim it and try again.`;
  return null;
}

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A small JPEG of the video's first moments, shown on the card before it plays. */
async function makePoster(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("no poster"));
      window.setTimeout(() => reject(new Error("poster timeout")), 8000);
    });
    video.currentTime = Math.min(0.6, (video.duration || 1) / 2);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      window.setTimeout(resolve, 1500);
    });
    const scale = Math.min(1, 540 / (video.videoWidth || 540));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((video.videoWidth || 540) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 960) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const out = canvas.toDataURL("image/jpeg", quality);
      if (out.length <= 240_000) return out;
    }
    return "";
  } catch {
    return "";
  } finally {
    URL.revokeObjectURL(url);
  }
}

function putPart(itemId: number, part: number, blob: Blob, onBytes: (loaded: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/content-upload/${itemId}/${part}`);
    xhr.upload.onprogress = (event) => onBytes(event.loaded);
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as { ok?: boolean; etag?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && body.ok) resolve(body.etag ?? "");
        else reject(new Error(body.error ?? `Upload failed (${xhr.status}).`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("The connection dropped during the upload."));
    xhr.send(blob);
  });
}

export async function uploadVideo(input: {
  file: File;
  title: string;
  body: string;
  category: (typeof SHOWCASE_CATEGORIES)[number];
  onProgress: (stage: UploadStage, percent: number) => void;
}): Promise<number> {
  const { file, onProgress } = input;
  const contentType = videoTypeOf(file);
  const problem = checkVideo(file);
  if (!contentType || problem) throw new Error(problem ?? "Unsupported video.");

  onProgress("preparing", 0);
  const oid = hex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  const poster = await makePoster(file);

  const start = await unwrap(startVideoUpload({ data: { title: input.title, body: input.body, category: input.category, size: file.size, oid, contentType } }));
  const etags: string[] = [];
  let done = 0;
  for (let part = 1; part <= start.parts; part += 1) {
    const from = (part - 1) * start.chunkSize;
    const blob = file.slice(from, Math.min(file.size, from + start.chunkSize));
    let etag = "";
    for (let attempt = 0; ; attempt += 1) {
      try {
        etag = await putPart(start.itemId, part, blob, (loaded) => onProgress("uploading", Math.round(((done + loaded) / file.size) * 100)));
        break;
      } catch (error) {
        if (attempt >= 2) throw error;
      }
    }
    done += blob.size;
    etags.push(etag);
  }
  onProgress("saving", 100);
  await unwrap(finishVideoUpload({ data: { itemId: start.itemId, etags, ...(poster ? { poster } : {}) } }));
  return start.itemId;
}
