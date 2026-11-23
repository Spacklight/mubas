import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  Compass,
  House,
  Library,
  LifeBuoy,
  MessageCircle,
  Megaphone,
  Newspaper,
  Play,
  Plus,
  Search,
  Sparkles,
  Settings,
  Shield,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { Logo } from "@/components/logo";
import { ThemeButton } from "@/components/theme-button";
import { useCampus } from "@/components/campus-state";
import { SetupForm } from "@/components/setup-form";
import { CreateSheet } from "@/components/create-content";
import { Dock } from "@/components/dock";
import { AvatarImg } from "@/components/page-kit";
import { input } from "@/components/ui";

type NavDef = { to: string; label: string; icon: typeof House; exact: boolean };

// Desktop sidebar
const SIDE: NavDef[] = [
  { to: "/campus", label: "Home", icon: House, exact: true },
  { to: "/campus/reels", label: "Zapa Content", icon: Play, exact: false },
  { to: "/campus/discover", label: "Discover", icon: Compass, exact: false },
  { to: "/campus/communities", label: "Communities", icon: Users, exact: false },
  { to: "/campus/ai", label: "Zapa AI", icon: Sparkles, exact: false },
  { to: "/campus/watch", label: "Zapa Watch", icon: Play, exact: false },
  { to: "/campus/library", label: "Zapa Library", icon: Library, exact: false },
  { to: "/campus/messages", label: "Messages", icon: MessageCircle, exact: false },
  { to: "/campus/alerts", label: "Notifications", icon: Bell, exact: false },
];

const MORE: NavDef[] = [
  { to: "/campus/ai", label: "Zapa AI", icon: Sparkles, exact: false },
  { to: "/campus/messages", label: "Messages", icon: MessageCircle, exact: false },
  { to: "/campus/communities", label: "Communities", icon: Users, exact: false },
  { to: "/campus/watch", label: "Zapa Watch", icon: Play, exact: false },
  { to: "/campus/feed", label: "Campus feed", icon: Newspaper, exact: false },
  { to: "/campus/updates", label: "MUBAS Updates", icon: Megaphone, exact: false },
  { to: "/guide", label: "Help Centre", icon: LifeBuoy, exact: false },
  { to: "/campus/me", label: "My profile", icon: UserRound, exact: false },
  { to: "/campus/settings", label: "Settings", icon: Settings, exact: false },
];

function usePath() {
  return useRouterState({ select: (state) => state.location.pathname });
}

function active(path: string, to: string, exact: boolean) {
  if (exact) return path === "/campus" || path === "/campus/";
  return path === to || path.startsWith(`${to}/`);
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePath();
  const navigate = useNavigate();
  const campus = useCampus();
  const [more, setMore] = useState(false);
  const [create, setCreate] = useState(false);
  const [query, setQuery] = useState("");
  const ready = campus.profile?.accountStatus === "active";

  useEffect(() => {
    const open = () => setCreate(true);
    window.addEventListener("zapa:open-create", open);
    return () => window.removeEventListener("zapa:open-create", open);
  }, []);

  function search(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    void navigate({ to: "/campus/search", search: { q } });
  }

  const badgeFor = (to: string) => (to === "/campus/messages" ? campus.unreadMessages : to === "/campus/alerts" ? campus.unreadNotes : 0);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-card px-3 py-4 md:flex">
        <Logo to={ready ? "/campus" : "/"} />
        {ready ? (
          <button type="button" onClick={() => setCreate(true)} className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-denim px-4 font-semibold text-on-denim">
            <Plus className="size-5" />Create
          </button>
        ) : null}
        <nav className="mt-4 grid gap-1">
          {SIDE.map((item) => (
            <NavItem key={item.to} {...item} path={path} badge={badgeFor(item.to)} />
          ))}
          {campus.profile?.role === "admin" ? <NavItem to="/campus/admin" label="Steward" icon={Shield} exact={false} path={path} badge={0} /> : null}
        </nav>
        <div className="mt-auto grid gap-3 pt-4">
          <div className="grid gap-1">
            {MORE.filter((item) => !SIDE.some((s) => s.to === item.to)).map((item) => (
              <NavItem key={item.to} {...item} path={path} badge={0} />
            ))}
          </div>
          <p className="px-2 text-xs text-pretty text-muted">Not an official MUBAS system.</p>
          <UserButton />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-navy px-3 py-2 text-on-navy md:bg-paper/95 md:text-ink md:backdrop-blur">
          <div className="md:hidden">
            <Logo to={ready ? "/campus" : "/"} compact />
          </div>
          {ready ? (
            <form onSubmit={search} className="hidden min-w-0 flex-1 md:block">
              <input className={input} placeholder="Search people, rooms, posts, library" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search Zapa" />
            </form>
          ) : (
            <div className="flex-1" />
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {ready ? (
              <>
                <Link to="/campus/search" aria-label="Search" className="grid size-11 place-items-center rounded-full md:hidden">
                  <Search className="size-5" />
                </Link>
                <Link to="/campus/ai" aria-label="Zapa AI" className="grid size-11 place-items-center rounded-full md:hidden">
                  <Sparkles className="size-5" />
                </Link>
                <Link to="/campus/alerts" aria-label="Notifications" className="relative grid size-11 place-items-center rounded-full">
                  <Bell className="size-5" />
                  {campus.unreadNotes > 0 ? <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-on-navy">{campus.unreadNotes > 9 ? "9+" : campus.unreadNotes}</span> : null}
                </Link>
                <button type="button" aria-label="Menu" onClick={() => setMore(true)} className="rounded-full md:hidden">
                  <AvatarImg name={campus.profile?.fullName ?? "?"} src={campus.profile?.avatarData ?? null} size="size-10" />
                </button>
              </>
            ) : null}
            <span className="hidden md:block"><ThemeButton /></span>
          </div>
        </header>

        <main className="px-3 py-4 pb-28 md:px-6 md:pb-10">
          {campus.loading ? (
            <div className="h-48 animate-pulse rounded-card bg-line" />
          ) : campus.error ? (
            <div className="panel p-4">
              <p className="text-danger">{campus.error}</p>
              <button type="button" className="mt-3 text-sm font-semibold text-denim-deep" onClick={campus.refresh}>Try again</button>
            </div>
          ) : campus.profile?.accountStatus === "suspended" ? (
            <div className="panel mx-auto max-w-lg p-6">
              <h1 className="font-display text-3xl">This account is suspended.</h1>
              <p className="mt-2 text-sm text-muted">A steward paused access. You can sign out below.</p>
              <div className="mt-4"><UserButton /></div>
            </div>
          ) : ready ? (
            children
          ) : (
            <SetupForm />
          )}
        </main>
      </div>

      {ready ? (
        <div className="fixed inset-x-0 bottom-0 z-30 md:hidden">
          <Dock path={path} unreadNotes={campus.unreadNotes} />
        </div>
      ) : null}

      {create ? <CreateSheet onClose={() => setCreate(false)} /> : null}

      {more ? (
        <div className="fixed inset-0 z-40 bg-ink/40 md:hidden" onClick={() => setMore(false)}>
          <div className="panel absolute inset-x-3 bottom-3 p-3" onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">Menu</p>
              <div className="flex items-center gap-1">
                <ThemeButton />
                <button type="button" aria-label="Close" className="grid size-11 place-items-center" onClick={() => setMore(false)}><X className="size-5" /></button>
              </div>
            </div>
            <div className="grid gap-1">
              {MORE.map((item) => (
                <Link key={item.to} to={item.to} onClick={() => setMore(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm font-semibold">
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              ))}
              {campus.profile?.role === "admin" ? (
                <Link to="/campus/admin" onClick={() => setMore(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm font-semibold"><Shield className="size-4" />Steward</Link>
              ) : null}
              <Link to="/docs" onClick={() => setMore(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm font-semibold"><BookOpen className="size-4" />Documentation</Link>
            </div>
            <div className="mt-3 border-t border-line pt-3"><UserButton /></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NavItem({ to, label, icon: Icon, exact, path, badge }: NavDef & { path: string; badge: number }) {
  const on = active(path, to, exact);
  return (
    <Link
      to={to}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${on ? "bg-denim-soft text-ink" : "text-muted hover:bg-sand-soft hover:text-ink"}`}
    >
      <Icon className="size-4" />
      <span className="flex-1">{label}</span>
      {badge > 0 ? <span className="rounded-full bg-denim px-1.5 text-xs text-on-denim">{badge > 9 ? "9+" : badge}</span> : null}
    </Link>
  );
}
