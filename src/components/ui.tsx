import type { ReactNode } from "react";

export const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-denim px-4 text-sm font-semibold text-on-denim transition hover:bg-denim-deep disabled:cursor-not-allowed disabled:opacity-50";
export const btnNavy =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-navy px-4 text-sm font-semibold text-on-navy transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink transition hover:border-denim disabled:cursor-not-allowed disabled:opacity-50";
export const btnQuiet =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-ink transition hover:bg-sand-soft disabled:opacity-50";
export const input =
  "min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-denim";
export const area =
  "min-h-28 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-denim";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export function PageTitle({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className="mb-5">
      <h1 className="font-display text-3xl leading-tight text-balance text-ink md:text-4xl">{title}</h1>
      {lede ? <p className="mt-2 max-w-2xl text-pretty text-muted">{lede}</p> : null}
    </header>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel px-4 py-8 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-pretty text-muted">{body}</p>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-full bg-denim-soft px-2.5 text-xs font-semibold text-ink">
      {children}
    </span>
  );
}
