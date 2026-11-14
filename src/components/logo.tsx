import { Link } from "@tanstack/react-router";

export function Mark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" className="fill-navy" />
      <polyline
        points="8,9.2 24,9.2 8,22.8 24,22.8"
        fill="none"
        strokeWidth="4.6"
        strokeLinejoin="miter"
        strokeMiterlimit="3"
        className="stroke-sand"
      />
      <circle cx="24" cy="9.2" r="2.15" className="fill-denim" />
    </svg>
  );
}

export function Logo({ to = "/", compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center gap-2.5 rounded-full pr-2">
      <Mark />
      {compact ? (
        <span className="font-display text-lg leading-none text-ink">Zapa</span>
      ) : (
        <span className="leading-tight">
          <span className="block font-display text-lg leading-none text-ink">Zapa</span>
          <span className="block text-xs font-semibold tracking-widest text-muted">MUBAS</span>
        </span>
      )}
    </Link>
  );
}
