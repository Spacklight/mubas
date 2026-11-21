import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  Compass,
  LifeBuoy,
  Library,
  Megaphone,
  MessageCircle,
  Play,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { CampusScene } from "@/components/campus-scene";
import { ThemeButton } from "@/components/theme-button";
import { btn, btnGhost } from "@/components/ui";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { PublicFooter } from "@/components/public-layout";
import { organizationJsonLd, seo } from "@/lib/site";

export const Route = createFileRoute("/")({
  head: () => {
    const base = seo({ title: "Zapa MUBAS — Your Campus. Your Community. Your Connection.", path: "/" });
    return { ...base, scripts: [{ type: "application/ld+json", children: organizationJsonLd() }] };
  },
  component: Landing,
});

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Compass, title: "People you may know", body: "Classmates first: same programme and year, then your department, school and study mode." },
  { icon: Users, title: "Programme rooms", body: "A room for every programme and school. Questions, study groups and notices in one place." },
  { icon: MessageCircle, title: "Messages", body: "Chat one to one or in groups, with unread counts and read receipts." },
  { icon: Play, title: "Zapa Watch", body: "Share and find tutorials, lectures and student stories. Subscribe to creators you like." },
  { icon: Library, title: "Zapa Library", body: "Approved providers share notes, past papers and books with clear access rules." },
  { icon: Megaphone, title: "MUBAS Updates", body: "Announcements with the source named and a link to the official page." },
  { icon: LifeBuoy, title: "Help Centre", body: "Schools, e-services, calendar and ICT support, with links to the official systems." },
  { icon: ShieldCheck, title: "Safe by default", body: "Your email is never public. Block, report and a data export are one tap away." },
];

const STEPS = [
  { n: "1", title: "Create an account", body: "Use your email and a password. Takes under a minute." },
  { n: "2", title: "Say what you study", body: "Pick your school, programme and year so classmates can find you." },
  { n: "3", title: "Join in", body: "Add friends, join your programme room, post a question." },
];

function Landing() {
  const { user, isPending } = useCurrentUserState();
  const signedIn = !isPending && Boolean(user);
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
          <Logo />
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
            <a href="#features" className="rounded-full px-3 py-2 text-sm font-semibold text-muted hover:text-ink">Features</a>
            <a href="#how" className="rounded-full px-3 py-2 text-sm font-semibold text-muted hover:text-ink">How it works</a>
            <Link to="/guide" className="rounded-full px-3 py-2 text-sm font-semibold text-muted hover:text-ink">Help Centre</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeButton />
            {signedIn ? (
              <Link to="/campus" className={btn}>Open campus</Link>
            ) : (
              <>
                <Link to="/login" className={`${btnGhost} hidden sm:inline-flex`}>Sign in</Link>
                <Link to="/login" search={{ mode: "join" }} className={btn}>Join Zapa</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="hero-glow text-on-navy">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-[1.05fr_1fr] md:py-16">
          <div>
            <p className="rise text-xs font-semibold tracking-widest text-sand">MALAWI UNIVERSITY OF BUSINESS AND APPLIED SCIENCES</p>
            <h1 className="rise rise-2 mt-3 font-display text-4xl leading-[1.05] text-balance md:text-6xl">
              Your Campus. <span className="text-sand">Your Community.</span> Your Connection.
            </h1>
            <p className="rise rise-3 mt-4 max-w-xl text-pretty text-lg text-on-navy/85">
              Zapa brings MUBAS students, lecturers and staff together: find your classmates, ask questions, share study
              materials, chat and keep up with campus news.
            </p>
            <div className="rise rise-3 mt-6 flex flex-wrap gap-3">
              <Link to={signedIn ? "/campus" : "/login"} search={signedIn ? undefined : { mode: "join" }} className="inline-flex min-h-12 items-center justify-center rounded-full bg-sand px-6 font-semibold text-navy transition hover:opacity-90">
                {signedIn ? "Open campus" : "Join the community"}
              </Link>
              <Link to="/guide" className="inline-flex min-h-12 items-center justify-center rounded-full border border-on-navy/40 px-6 font-semibold text-on-navy transition hover:bg-on-navy/10">
                Explore the Help Centre
              </Link>
            </div>
            <p className="mt-5 text-sm text-on-navy/70">Independent community. Not an official MUBAS system.</p>
          </div>
          <div className="drift">
            <CampusScene className="h-auto w-full drop-shadow-2xl" />
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-sand-soft">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6 text-center md:grid-cols-4">
          {[
            ["5", "schools"],
            ["30+", "programmes"],
            ["1", "place for rooms, chat and library"],
            ["0", "ads or tracking"],
          ].map(([value, label]) => (
            <div key={label}>
              <dt className="font-display text-3xl text-navy dark:text-sand">{value}</dt>
              <dd className="text-sm text-muted">{label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
        <h2 className="font-display text-3xl text-balance md:text-4xl">Everything your campus life needs, in one place.</h2>
        <p className="mt-2 max-w-2xl text-pretty text-muted">Built mobile-first for slow connections, with a data saver that keeps pages light.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((item) => (
            <article key={item.title} className="panel lift p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-denim-soft text-denim-deep">
                <item.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-display text-xl">{item.title}</h3>
              <p className="mt-1 text-sm text-pretty text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="scroll-mt-20 bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display text-3xl text-balance md:text-4xl">Up and running in three steps.</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="rounded-card border border-line bg-paper p-5">
                <span className="grid size-10 place-items-center rounded-full bg-navy font-display text-lg text-sand">{step.n}</span>
                <h3 className="mt-3 font-display text-xl">{step.title}</h3>
                <p className="mt-1 text-sm text-pretty text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="hero-glow rounded-card px-6 py-10 text-center text-on-navy">
          <BookOpen className="mx-auto size-8 text-sand" />
          <h2 className="mt-3 font-display text-3xl text-balance">Ready to find your people?</h2>
          <p className="mx-auto mt-2 max-w-xl text-pretty text-on-navy/85">Join your programme room and say hello.</p>
          <Link to={signedIn ? "/campus" : "/login"} search={signedIn ? undefined : { mode: "join" }} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-sand px-6 font-semibold text-navy">
            {signedIn ? "Open campus" : "Create your account"}
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
