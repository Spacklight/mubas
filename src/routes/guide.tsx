import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeButton } from "@/components/theme-button";
import { ABOUT, FAQS, SCHOOLS, SERVICES } from "@/lib/campus/guide";

export const Route = createFileRoute("/guide")({
  head: () => ({ meta: [{ title: "Help Centre — Zapa MUBAS" }] }),
  component: Guide,
});

const RULES = [
  "Be kind. No harassment, bullying or hate.",
  "Do not pretend to be a lecturer, office or another student.",
  "Share only what you have the right to share. No unreleased exams or private documents.",
  "No spam, scams or adult content.",
  "Report problems with More → Report. Stewards review every report.",
];

function Guide() {
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
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-xs font-semibold tracking-widest text-denim-deep">MUBAS HELP CENTRE</p>
        <h1 className="mt-1 font-display text-4xl text-balance md:text-5xl">Find your way around MUBAS.</h1>
        <p className="mt-2 max-w-2xl text-pretty text-muted">Links to the official university systems, plus the rules of this community. Always check the official site for decisions that matter.</p>

        <section className="panel mt-6 p-5">
          <h2 className="font-display text-2xl">{ABOUT.title}</h2>
          <p className="mt-2 text-pretty text-muted">{ABOUT.body}</p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <li className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-denim-deep" />{ABOUT.address}</li>
            <li className="flex items-start gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-denim-deep" />{ABOUT.phone}</li>
            <li className="flex items-start gap-2"><Mail className="mt-0.5 size-4 shrink-0 text-denim-deep" />{ABOUT.email}</li>
          </ul>
          <a href={ABOUT.site} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-denim-deep">Visit mubas.ac.mw <ExternalLink className="size-4" /></a>
        </section>

        <h2 className="mt-10 font-display text-2xl">Schools</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCHOOLS.map((school) => (
            <a key={school.short} href={school.href} target="_blank" rel="noreferrer" className="panel lift block p-4">
              <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs font-bold text-navy">{school.short}</span>
              <p className="mt-2 font-semibold">{school.name}</p>
              <p className="mt-1 text-sm text-pretty text-muted">{school.detail}</p>
            </a>
          ))}
        </div>

        <h2 className="mt-10 font-display text-2xl">University services</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <a key={service.name} href={service.href} target="_blank" rel="noreferrer" className="panel lift flex items-start justify-between gap-2 p-4">
              <span>
                <span className="block font-semibold">{service.name}</span>
                <span className="mt-1 block text-sm text-pretty text-muted">{service.detail}</span>
              </span>
              <ExternalLink className="mt-1 size-4 shrink-0 text-muted" />
            </a>
          ))}
        </div>

        <h2 className="mt-10 font-display text-2xl">Community guidelines</h2>
        <ul className="panel mt-3 grid gap-2 p-5 text-sm">
          {RULES.map((rule) => (
            <li key={rule} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-denim" />{rule}</li>
          ))}
        </ul>

        <h2 className="mt-10 font-display text-2xl">Questions</h2>
        <div className="mt-3 grid gap-2">
          {FAQS.map((item) => (
            <details key={item.q} className="panel group p-4">
              <summary className="flex min-h-8 items-center justify-between gap-2 font-semibold">{item.q}<span className="text-denim-deep transition group-open:rotate-45">+</span></summary>
              <p className="mt-2 text-sm text-pretty text-muted">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted">Zapa is independent. It is not endorsed by or connected to MUBAS administration.</p>
      </main>
    </div>
  );
}
