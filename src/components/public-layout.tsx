import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { ThemeButton } from "@/components/theme-button";
import { SITE } from "@/lib/site";

export function PublicFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted">
        <Logo />
        <Link to="/docs" className="hover:text-ink">Documentation</Link>
        <Link to="/guide" className="hover:text-ink">Help Centre</Link>
        <Link to="/privacy" className="hover:text-ink">Privacy Policy</Link>
        <Link to="/terms" className="hover:text-ink">Terms and Conditions</Link>
        <Link to="/download" className="hover:text-ink">Android app</Link>
        <a href="https://www.mubas.ac.mw/" target="_blank" rel="noreferrer" className="hover:text-ink">Official MUBAS site</a>
        <span className="md:ml-auto">{SITE.name} is independent and not endorsed by MUBAS.</span>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
          <Logo />
          <div className="ml-auto flex items-center gap-2">
            <ThemeButton />
            <Link to="/campus" className="inline-flex min-h-11 items-center rounded-full bg-denim px-4 text-sm font-semibold text-on-denim">Open campus</Link>
          </div>
        </div>
      </header>
      {children}
      <PublicFooter />
    </div>
  );
}

/** Readable long-form text with a heading rhythm. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 [&_a]:font-semibold [&_a]:text-denim-deep [&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:text-pretty [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      {children}
    </main>
  );
}

export function Contact() {
  return SITE.contactEmail ? (
    <p>Email us at <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>
  ) : (
    <p>Use the Report button inside Zapa, or message a steward through the Help Centre, and we will respond.</p>
  );
}
