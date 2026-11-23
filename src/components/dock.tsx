import { Link } from "@tanstack/react-router";
import { Bell, Compass, House, Library, Play, Plus, type LucideIcon } from "lucide-react";

type Item = { to: string; label: string; icon: LucideIcon; exact?: boolean };

const LEFT: Item[] = [
  { to: "/campus", label: "Home", icon: House, exact: true },
  { to: "/campus/discover", label: "Discover", icon: Compass },
];
const RIGHT: Item[] = [
  { to: "/campus/reels", label: "Zapa Content", icon: Play },
  { to: "/campus/library", label: "Zapa Library", icon: Library },
  { to: "/campus/alerts", label: "Alerts", icon: Bell },
];

const isOn = (path: string, item: Item) => (item.exact ? path === "/campus" || path === "/campus/" : path === item.to || path.startsWith(`${item.to}/`));

/** The phone bottom bar: Home, Discover, Create, Zapa Content, Zapa Library, Alerts. */
export function Dock({ path, unreadNotes, dark = false }: { path: string; unreadNotes: number; dark?: boolean }) {
  const idle = dark ? "text-white/80" : "text-muted";
  const item = (it: Item, badge = 0) => {
    const on = isOn(path, it);
    const Icon = it.icon;
    return (
      <Link key={it.to} to={it.to} className={`relative grid min-h-14 place-items-center content-center gap-0.5 text-[10px] font-semibold leading-tight ${on ? (dark ? "text-white" : "text-denim-deep") : idle}`}>
        <span className={`grid size-8 place-items-center rounded-lg ${on && it.to === "/campus/reels" ? "bg-denim text-on-denim" : ""}`}><Icon className="size-5" /></span>
        <span className="max-w-full truncate px-0.5">{it.label}</span>
        {badge > 0 ? <span className="absolute right-2 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{badge > 9 ? "9+" : badge}</span> : null}
        {on ? <span className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full ${dark ? "bg-white" : "bg-denim"}`} /> : null}
      </Link>
    );
  };
  return (
    <nav className={`dock grid grid-cols-6 items-end border-t ${dark ? "border-white/10 bg-black/90 text-white" : "border-line bg-card"}`} aria-label="Main">
      {LEFT.map((it) => item(it))}
      <button type="button" onClick={() => window.dispatchEvent(new Event("zapa:open-create"))} aria-label="Create" className={`relative grid place-items-center pb-1 text-[10px] font-semibold ${dark ? "text-white" : "text-denim-deep"}`}>
        <span className={`-mt-6 grid size-14 place-items-center rounded-full bg-denim text-on-denim shadow-xl ring-4 ${dark ? "ring-black" : "ring-card"}`}><Plus className="size-7" /></span>
        <span>Create</span>
      </button>
      {RIGHT.map((it) => item(it, it.to === "/campus/alerts" ? unreadNotes : 0))}
    </nav>
  );
}
