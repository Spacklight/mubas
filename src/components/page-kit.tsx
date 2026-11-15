import { useCallback, useEffect, useState, type ReactNode } from "react";
import { failureMessage } from "@/lib/campus/email-auth";
import { initials } from "@/lib/campus/logic";
import type { Profile } from "@/lib/campus/types";

/** Unwraps `{ ok: false, error }` server-function results into thrown errors. */
export async function unwrap<T extends { ok: boolean }>(promise: Promise<T>): Promise<Extract<T, { ok: true }>> {
  const result = await promise;
  if (!result.ok) throw new Error((result as { error?: string }).error ?? "Something went wrong.");
  return result as Extract<T, { ok: true }>;
}

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    load()
      .then((value) => {
        if (!live) return;
        setData(value);
        setError(null);
      })
      .catch((reason) => {
        if (live) setError(failureMessage(reason));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, error, loading, reload };
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-card bg-line" />
      ))}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel p-4">
      <p className="text-danger">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-semibold text-denim-deep">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Avatar({ name, size = "size-11" }: { name: string; size?: string }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-sand-soft text-sm font-semibold text-navy`}>
      {initials(name)}
    </span>
  );
}

export function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-xl text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Tabs<T extends string>({ items, value, onChange }: { items: readonly T[]; value: T; onChange: (next: T) => void }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={item === value}
          onClick={() => onChange(item)}
          className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition ${item === value ? "bg-navy text-on-navy" : "border border-line bg-card text-ink hover:border-denim"}`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function AvatarImg({ name, src, size = "size-11" }: { name: string; src: string | null; size?: string }) {
  if (!src) return <Avatar name={name} size={size} />;
  return <img src={src} alt="" className={`${size} shrink-0 rounded-full object-cover`} />;
}

/** Shrinks a photo in the browser so it fits the profile image limits. */
export function shrinkImage(file: File, maxSide: number, maxChars: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("This browser cannot resize photos."));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.7, 0.58, 0.46, 0.34]) {
        const out = canvas.toDataURL("image/jpeg", quality);
        if (out.length <= maxChars) return resolve(out);
      }
      reject(new Error("That photo is too detailed. Pick a smaller one."));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not a photo."));
    };
    img.src = url;
  });
}


/** Builds the full payload `updateProfile` expects from the current profile. */
export function profileToUpdate(p: Profile, patch: Record<string, unknown> = {}) {
  return {
    fullName: p.fullName,
    campusEmail: p.campusEmail ?? "",
    role: p.role === "admin" ? ("staff" as const) : p.role,
    schoolId: p.schoolId ?? "",
    programmeId: p.programmeId ?? "",
    studyLevel: p.studyLevel ?? "",
    studyMode: p.studyMode ?? "",
    academicYear: p.academicYear ?? "",
    interests: p.interests,
    departmentNote: p.department ?? "",
    bio: p.bio,
    skills: p.skills,
    visibility: p.visibility,
    notifyMessages: p.notifyMessages,
    notifySocial: p.notifySocial,
    notifyCampus: p.notifyCampus,
    ...patch,
  };
}
