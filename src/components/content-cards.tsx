import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eye, Flag, MessageCircle, MoreVertical, Play, Share2, ThumbsUp, Trash2 } from "lucide-react";
import { showcaseAction, type ShowcaseItem } from "@/lib/campus/showcase";
import { toggleFollow } from "@/lib/campus/server";
import { REPORT_REASONS, youtubeId } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { useCampus } from "@/components/campus-state";
import { Avatar, unwrap } from "@/components/page-kit";

export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

/** Renders text with #hashtags highlighted. */
export function Hashtagged({ text, className = "", tone = "dark" }: { text: string; className?: string; tone?: "dark" | "light" }) {
  const parts = text.split(/(#[\p{L}\p{N}_]+)/gu);
  return (
    <span className={className}>
      {parts.map((part, i) => (part.startsWith("#") ? <span key={i} className={`font-semibold ${tone === "light" ? "text-denim-deep" : "text-sand"}`}>{part}</span> : <span key={i}>{part}</span>))}
    </span>
  );
}

export function useContentActions(item: ShowcaseItem, onChange?: () => void) {
  const [liked, setLiked] = useState(item.liked);
  const [likes, setLikes] = useState(item.likeCount);
  const [shares, setShares] = useState(item.shares);
  const [following, setFollowing] = useState(item.following);
  const [saved, setSaved] = useState(item.saved);

  // Fresh numbers from other devices arrive through the item itself.
  useEffect(() => {
    setLikes(item.likeCount);
    setLiked(item.liked);
    setShares(item.shares);
  }, [item.likeCount, item.liked, item.shares]);

  async function run<T>(job: () => Promise<T>): Promise<T | null> {
    try {
      return await job();
    } catch (reason) {
      toast.error(failureMessage(reason));
      return null;
    }
  }

  return {
    liked,
    likes,
    shares,
    following,
    saved,
    async save() {
      const r = await run(() => unwrap(showcaseAction({ data: { action: "save", id: item.id } })));
      if (r && "on" in r) {
        setSaved(Boolean(r.on));
        toast.success(r.on ? "Saved" : "Removed from saved");
      }
    },
    async like() {
      const r = await run(() => unwrap(showcaseAction({ data: { action: "like", id: item.id } })));
      if (r && "on" in r) {
        setLiked(Boolean(r.on));
        setLikes((n) => n + (r.on ? 1 : -1));
      }
    },
    async follow() {
      const r = await run(() => unwrap(toggleFollow({ data: { userId: item.userId } })));
      if (r && "on" in r) setFollowing(Boolean(r.on));
    },
    async share() {
      const url = `${window.location.origin}/campus/reels?id=${item.id}`;
      try {
        if (navigator.share) await navigator.share({ title: item.title, text: item.title, url });
        else {
          await navigator.clipboard.writeText(url);
          toast.success("Link copied");
        }
      } catch {
        return; // cancelled
      }
      const r = await run(() => unwrap(showcaseAction({ data: { action: "share", id: item.id } })));
      if (r) setShares((n) => n + 1);
    },
    async report(reason: string) {
      if (!reason) return;
      const r = await run(() => unwrap(showcaseAction({ data: { action: "report", id: item.id, reason: reason as (typeof REPORT_REASONS)[number] } })));
      if (r) toast.success("Reported. A steward will look at it.");
    },
    async remove() {
      if (!window.confirm("Remove this post?")) return;
      const r = await run(() => unwrap(showcaseAction({ data: { action: "delete", id: item.id } })));
      if (r) onChange?.();
    },
  };
}

function Cover({ item, saver }: { item: ShowcaseItem; saver: boolean }) {
  const yt = item.linkUrl ? youtubeId(item.linkUrl) : null;
  let src: string | null = null;
  if (!saver) {
    if (item.hasMedia && item.kind === "image") src = `/api/media/${item.id}`;
    else if (item.hasMedia && item.hasThumb) src = `/api/media/${item.id}?thumb=1`;
    else if (yt) src = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
  }
  if (src) return <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />;
  return (
    <div className="hero-glow absolute inset-0 grid place-items-center p-5 text-center">
      {item.kind === "post" ? <p className="font-display text-2xl leading-tight text-balance">{item.title}</p> : <Play className="size-14 text-on-navy/70" />}
    </div>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid min-h-11 min-w-11 place-items-center gap-0.5 text-xs font-bold drop-shadow">
      {children}
    </button>
  );
}

/** One tile of the Zapa Content grid: cover, views, action rail, title, author and Follow. */
export function ContentCard({ item, meId, admin, tab, onChange }: { item: ShowcaseItem; meId: string; admin: boolean; tab?: string; onChange: () => void }) {
  const { dataSaver } = useCampus();
  const a = useContentActions(item, onChange);
  const [menu, setMenu] = useState(false);
  const isVideo = item.kind === "video";
  const own = item.userId === meId;

  return (
    <article className="relative isolate aspect-[3/4.25] overflow-hidden rounded-2xl bg-navy text-white shadow-lg">
      <Cover item={item} saver={dataSaver} />
      <Link to="/campus/reels" search={{ id: item.id, tab }} aria-label={`Open ${item.title}`} className="absolute inset-0 z-0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/25" />

      <span className="pointer-events-none absolute left-2.5 top-2.5 z-10 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-bold backdrop-blur">
        {isVideo ? <Play className="size-3.5 fill-white" /> : <Eye className="size-3.5" />}
        {compact(item.views)}
      </span>

      <div className="absolute bottom-24 right-1.5 z-10 grid gap-1 text-center">
        <RailButton label="Like" onClick={() => void a.like()}>
          <ThumbsUp className={`size-7 ${a.liked ? "fill-denim text-denim" : ""}`} />
          {compact(a.likes)}
        </RailButton>
        <Link to="/campus/reels" search={{ id: item.id, tab, comments: true }} aria-label="Comments" className="grid min-h-11 min-w-11 place-items-center gap-0.5 text-xs font-bold drop-shadow">
          <MessageCircle className="size-7" />
          {compact(item.commentCount)}
        </Link>
        <RailButton label="Share" onClick={() => void a.share()}>
          <Share2 className="size-7" />
          {compact(a.shares)}
        </RailButton>
        <RailButton label="More" onClick={() => setMenu((v) => !v)}>
          <MoreVertical className="size-6" />
        </RailButton>
      </div>

      {menu ? (
        <div className="absolute bottom-24 right-14 z-20 grid min-w-36 gap-0.5 rounded-xl bg-card p-1 text-sm text-ink shadow-2xl">
          {own || admin ? (
            <button type="button" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left font-semibold" onClick={() => { setMenu(false); void a.remove(); }}><Trash2 className="size-4" />Remove</button>
          ) : (
            <label className="relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 font-semibold"><Flag className="size-4" />Report
              <select aria-label="Report reason" className="absolute inset-0 cursor-pointer opacity-0" value="" onChange={(e) => { setMenu(false); void a.report(e.target.value); }}>
                <option value="">Reason…</option>
                {REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="min-h-11 rounded-lg px-3 text-left font-semibold" onClick={() => setMenu(false)}>Close</button>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 grid gap-1 p-3 pr-14">
        {item.kind !== "post" ? <h3 className="line-clamp-2 font-display text-lg leading-tight text-balance drop-shadow">{item.title}</h3> : null}
        {item.body ? <p className="line-clamp-2 text-xs text-pretty text-white/90"><Hashtagged text={item.body} /></p> : null}
        <div className="pointer-events-auto mt-1.5 flex items-center gap-2">
          <Link to="/campus/people/$userId" params={{ userId: item.userId }} className="flex min-w-0 items-center gap-2">
            <Avatar name={item.author} size="size-8" />
            <span className="truncate text-sm font-semibold">{item.author}</span>
          </Link>
          {!own ? (
            <button type="button" onClick={() => void a.follow()} className={`ml-auto shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${a.following ? "border-white/40 bg-white/20" : "border-white"}`}>
              {a.following ? "Following" : "Follow"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
