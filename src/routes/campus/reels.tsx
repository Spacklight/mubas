import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Bell,
  Bookmark,
  Clapperboard,
  ExternalLink,
  Flame,
  Flag,
  GraduationCap,
  Maximize,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Search,
  Share2,
  Sparkles,
  ThumbsUp,
  Trash2,
  UserRound,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { listShowcase, showcaseAction, CONTENT_TABS, type ContentTabId, type ShowcaseItem } from "@/lib/campus/showcase";
import { ago, hostOf, REPORT_REASONS, youtubeId } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { useCampus } from "@/components/campus-state";
import { compact, useContentActions } from "@/components/content-cards";
import { Dock } from "@/components/dock";
import { Logo } from "@/components/logo";
import { Avatar, AvatarImg, unwrap } from "@/components/page-kit";
import { input } from "@/components/ui";
import { useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/campus/reels")({
  validateSearch: (search: Record<string, unknown>) => {
    const id = Number(search.id);
    const tab = typeof search.tab === "string" && (CONTENT_TABS as readonly string[]).includes(search.tab) ? (search.tab as ContentTabId) : undefined;
    return {
      id: Number.isInteger(id) && id > 0 ? id : undefined,
      tab,
      comments: search.comments === true || search.comments === "true" || search.comments === 1 || search.comments === "1" ? true : undefined,
    };
  },
  head: () => ({ meta: [{ title: "Zapa Content — Zapa MUBAS" }] }),
  component: Reels,
});

const CHIPS: { id: ContentTabId; label: string; icon: typeof Flame }[] = [
  { id: "for-you", label: "For You", icon: Flame },
  { id: "following", label: "Following", icon: Users },
  { id: "trending", label: "Trending", icon: Clapperboard },
  { id: "mubas", label: "MUBAS", icon: GraduationCap },
  { id: "friends", label: "Friends", icon: UserRound },
];

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function useStored<T extends string | number | boolean>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // keep initial
    }
  }, [key]);
  return [
    value,
    (next) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
  ];
}

const TAG = /#[\p{L}\p{N}_]+/gu;

function Reels() {
  const search = Route.useSearch();
  const { profile, unreadNotes } = useCampus();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [tab, setTab] = useState<ContentTabId>(search.tab ?? "for-you");
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useStored("zapa-reels-muted", true);
  const [speed, setSpeed] = useStored("zapa-reels-speed", 1);
  const [commentsFor, setCommentsFor] = useState<number | null>(null);
  const [moreFor, setMoreFor] = useState<ShowcaseItem | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const viewed = useRef(new Set<number>());
  const startId = useRef(search.id);
  const loadingMore = useRef(false);

  const load = useCallback(async (nextTab: ContentTabId) => {
    setLoading(true);
    setError(null);
    try {
      const list = await unwrap(listShowcase({ data: { tab: nextTab } }));
      let merged = list.items;
      if (startId.current) {
        const target = await unwrap(listShowcase({ data: { id: startId.current } })).catch(() => null);
        const first = target?.items[0];
        if (first) merged = [first, ...list.items.filter((i) => i.id !== first.id)];
        if (search.comments && first) setCommentsFor(first.id);
        startId.current = undefined;
      }
      setItems(merged);
      setMore(list.more);
      setActive(0);
      scroller.current?.scrollTo({ top: 0 });
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  useEffect(() => {
    const reload = () => void load(tab);
    window.addEventListener("zapa:content-created", reload);
    return () => window.removeEventListener("zapa:content-created", reload);
  }, [tab, load]);

  // Track which slide is on screen.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.7) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: [0.7] },
    );
    root.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items.length]);

  // Count a view once, and load more near the end.
  useEffect(() => {
    const item = items[active];
    if (item && !viewed.current.has(item.id)) {
      viewed.current.add(item.id);
      void showcaseAction({ data: { action: "view", id: item.id } }).catch(() => undefined);
    }
    if (more && !loadingMore.current && items.length > 0 && active >= items.length - 3) {
      loadingMore.current = true;
      void unwrap(listShowcase({ data: { tab, offset: items.length } }))
        .then((r) => {
          setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id))]);
          setMore(r.more);
        })
        .catch(() => undefined)
        .finally(() => {
          loadingMore.current = false;
        });
    }
  }, [active, items, more, tab]);

  return (
    <div className="fixed inset-0 z-40 bg-black text-white md:left-60">
      <header className="absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/75 via-black/30 to-transparent pb-6">
        <div className="flex items-center gap-1 px-3 pt-2">
          <div className="md:hidden"><Logo to="/campus" compact /></div>
          <div className="ml-auto flex items-center gap-1">
            <Link to="/campus/search" aria-label="Search" className="grid size-11 place-items-center rounded-full"><Search className="size-6" /></Link>
            <Link to="/campus/ai" aria-label="Zapa AI" className="grid size-11 place-items-center rounded-full md:hidden"><Sparkles className="size-6" /></Link>
            <Link to="/campus/alerts" aria-label="Notifications" className="relative grid size-11 place-items-center rounded-full">
              <Bell className="size-6" />
              {unreadNotes > 0 ? <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unreadNotes > 9 ? "9+" : unreadNotes}</span> : null}
            </Link>
            <Link to="/campus/me" aria-label="My profile" className="rounded-full"><AvatarImg name={profile?.fullName ?? "?"} src={profile?.avatarData ?? null} size="size-10" /></Link>
          </div>
        </div>
        <div className="hide-scrollbar flex gap-2 overflow-x-auto px-3 pt-1" role="tablist" aria-label="Content feeds">
          {CHIPS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold backdrop-blur ${tab === id ? "bg-denim text-on-denim" : "bg-black/35 text-white"}`}>
              <Icon className="size-4" />{label}
            </button>
          ))}
        </div>
      </header>

      <div ref={scroller} className="hide-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain">
        {loading && items.length === 0 ? (
          <div className="grid h-full place-items-center"><p className="animate-pulse text-sm">Loading…</p></div>
        ) : error ? (
          <div className="grid h-full place-items-center p-6 text-center"><div><p className="text-danger">{error}</p><button type="button" className="mt-3 font-semibold underline" onClick={() => void load(tab)}>Try again</button></div></div>
        ) : items.length === 0 ? (
          <div className="grid h-full place-items-center p-8 text-center"><div><Clapperboard className="mx-auto size-12 text-white/60" /><p className="mt-3 font-display text-2xl">Nothing here yet</p><p className="mt-1 text-sm text-white/70">Switch tabs or tap Create to share the first one.</p></div></div>
        ) : items.map((item, index) => (
          <Slide
            key={item.id}
            item={item}
            index={index}
            active={index === active}
            near={Math.abs(index - active) <= 1}
            muted={muted}
            speed={speed}
            meId={profile?.userId ?? ""}
            onToggleMute={() => setMuted(!muted)}
            onSpeed={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1)}
            onComments={() => setCommentsFor(item.id)}
            onMore={() => setMoreFor(item)}
          />
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 md:hidden"><Dock path={path} unreadNotes={unreadNotes} dark /></div>

      {commentsFor !== null ? <CommentsSheet id={commentsFor} onClose={() => setCommentsFor(null)} onPosted={() => setItems((cur) => cur.map((i) => (i.id === commentsFor ? { ...i, commentCount: i.commentCount + 1 } : i)))} /> : null}
      {moreFor ? <MoreSheet item={moreFor} meId={profile?.userId ?? ""} admin={profile?.role === "admin"} speed={speed} setSpeed={setSpeed} onClose={() => setMoreFor(null)} onRemoved={() => { setItems((cur) => cur.filter((i) => i.id !== moreFor.id)); setMoreFor(null); }} /> : null}
    </div>
  );
}

// ----------------------------------------------------------------- slide ----

type SlideProps = {
  item: ShowcaseItem;
  index: number;
  active: boolean;
  near: boolean;
  muted: boolean;
  speed: number;
  meId: string;
  onToggleMute: () => void;
  onSpeed: () => void;
  onComments: () => void;
  onMore: () => void;
};

function Slide({ item, index, active, near, muted, speed, meId, onToggleMute, onSpeed, onComments, onMore }: SlideProps) {
  const { dataSaver } = useCampus();
  const a = useContentActions(item);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [ytPlay, setYtPlay] = useState(false);
  const own = item.userId === meId;
  const yt = item.linkUrl ? youtubeId(item.linkUrl) : null;
  const isFile = item.kind === "video" && item.hasMedia;
  const tags = item.body.match(TAG) ?? [];
  const caption = item.body.replace(TAG, "").replace(/\s+/g, " ").trim();
  const shownTags = expanded ? tags : tags.slice(0, 3);

  // Play the slide that is on screen, pause the rest.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = muted;
    v.playbackRate = speed;
    if (active && !dataSaver) void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    else {
      v.pause();
      setPlaying(false);
    }
  }, [active, muted, dataSaver, speed]);

  function toggle() {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().then(() => setPlaying(true)).catch(() => undefined);
    else {
      v.pause();
      setPlaying(false);
    }
  }

  function fullscreen() {
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) void v.requestFullscreen().catch(() => undefined);
    else v.webkitEnterFullscreen?.();
  }

  const poster = item.hasThumb && !dataSaver ? `/api/media/${item.id}?thumb=1` : undefined;

  return (
    <section data-index={index} className="relative h-full w-full snap-start snap-always overflow-hidden bg-black" aria-label={item.title}>
      {isFile ? (
        <video
          ref={video}
          src={near ? `/api/media/${item.id}` : undefined}
          poster={poster}
          loop
          playsInline
          muted={muted}
          preload={near && !dataSaver ? "auto" : "none"}
          onClick={toggle}
          onTimeUpdate={(e) => { if (bar.current && e.currentTarget.duration) bar.current.style.width = `${(e.currentTarget.currentTime / e.currentTarget.duration) * 100}%`; }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : item.kind === "image" && item.hasMedia ? (
        near ? <img src={`/api/media/${item.id}`} alt={item.title} className="absolute inset-0 size-full object-cover" /> : null
      ) : item.kind === "video" && item.linkUrl ? (
        yt && ytPlay ? <iframe className="absolute inset-0 size-full" src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&playsinline=1`} title={item.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /> : (
          <button type="button" onClick={() => (yt ? setYtPlay(true) : window.open(item.linkUrl!, "_blank", "noopener"))} className="hero-glow absolute inset-0 grid place-items-center" aria-label="Play video">
            {yt && !dataSaver ? <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" className="absolute inset-0 size-full object-cover opacity-80" /> : null}
            <span className="relative inline-flex items-center gap-2 rounded-full bg-sand px-5 py-3 font-semibold text-navy">{yt ? <Play className="size-5" /> : <ExternalLink className="size-5" />}{yt ? "Play video" : `Watch on ${hostOf(item.linkUrl!)}`}</span>
          </button>
        )
      ) : (
        <div className="hero-glow absolute inset-0 grid place-items-center p-8 text-center"><p className="font-display text-4xl leading-tight text-balance">{item.title}</p></div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30" />
      {isFile && !playing && active ? <button type="button" onClick={toggle} aria-label="Play" className="absolute inset-0 z-10 grid place-items-center"><span className="grid size-20 place-items-center rounded-full bg-black/45 backdrop-blur"><Play className="size-9 fill-white" /></span></button> : null}

      <div className="absolute inset-x-3 top-[7.25rem] z-10 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold backdrop-blur"><Play className="size-4 fill-white" />{compact(item.views)} views</span>
        <span className="ml-auto flex items-center gap-1.5">
          {isFile ? (
            <>
              <button type="button" onClick={onSpeed} aria-label={`Playback speed ${speed}x. Tap to change`} className="grid h-10 min-w-10 place-items-center rounded-full bg-black/45 px-2 text-sm font-extrabold backdrop-blur">{speed}x</button>
              <button type="button" onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"} className="grid size-10 place-items-center rounded-full bg-black/45 backdrop-blur">{muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}</button>
              <button type="button" onClick={fullscreen} aria-label="Full screen" className="grid size-10 place-items-center rounded-full bg-black/45 backdrop-blur"><Maximize className="size-5" /></button>
            </>
          ) : null}
        </span>
      </div>

      <div className="absolute bottom-52 right-2 z-10 grid gap-2 text-center">
        <Rail label="Like" onClick={() => void a.like()} text={compact(a.likes)}><ThumbsUp className={`size-8 ${a.liked ? "fill-denim text-denim" : ""}`} /></Rail>
        <Rail label="Comments" onClick={onComments} text={compact(item.commentCount)}><MessageCircle className="size-8" /></Rail>
        <Rail label="Share" onClick={() => void a.share()} text={compact(a.shares)}><Share2 className="size-8" /></Rail>
        <Rail label={a.saved ? "Unsave" : "Save"} onClick={() => void a.save()} text="Save"><Bookmark className={`size-8 ${a.saved ? "fill-white" : ""}`} /></Rail>
        <Rail label="More" onClick={onMore}><MoreHorizontal className="size-8" /></Rail>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 grid gap-2 px-3 pb-[5.25rem] pr-20 md:pb-6">
        <div className="flex items-center gap-2.5">
          <Link to="/campus/people/$userId" params={{ userId: item.userId }} className="flex min-w-0 items-center gap-2.5"><Avatar name={item.author} size="size-12" /><span className="truncate text-lg font-bold">{item.author}</span></Link>
          {!own ? <button type="button" onClick={() => void a.follow()} className={`shrink-0 rounded-full border px-5 py-1.5 text-base font-bold ${a.following ? "border-white/40 bg-white/20" : "border-white"}`}>{a.following ? "Following" : "Follow"}</button> : null}
        </div>
        <p className={`text-pretty text-lg font-semibold leading-snug drop-shadow ${expanded ? "" : "line-clamp-2"}`}>{item.kind === "post" ? "" : item.title}{caption ? <><br />{caption}</> : null}</p>
        {tags.length ? (
          <div className="flex flex-wrap gap-2">
            {shownTags.map((t) => <span key={t} className="rounded-full bg-black/40 px-3 py-1 text-sm font-bold text-sand backdrop-blur">{t}</span>)}
            {!expanded && (tags.length > 3 || caption.length > 80) ? <button type="button" onClick={() => setExpanded(true)} className="rounded-full bg-black/40 px-3 py-1 text-sm font-bold backdrop-blur">…more</button> : null}
          </div>
        ) : null}
        {item.kind === "video" ? <p className="inline-flex w-fit max-w-full items-center gap-2 rounded-full bg-black/40 px-3 py-2 text-sm font-semibold backdrop-blur"><Music2 className="size-4 shrink-0" /><span className="truncate">Original Audio – {item.author}</span></p> : null}
      </div>

      {isFile ? (
        <>
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className={`absolute bottom-[5.25rem] right-3 z-10 grid size-14 place-items-center rounded-full border-2 border-white bg-black/50 backdrop-blur md:bottom-6 ${playing ? "disc-spin" : ""}`}>{playing ? <Pause className="size-6 fill-white" /> : <Play className="size-6 fill-white" />}</button>
          <div className="absolute inset-x-0 bottom-[4.4rem] z-10 h-0.5 bg-white/25 md:bottom-0"><div ref={bar} className="h-full w-0 bg-white" /></div>
        </>
      ) : null}
    </section>
  );
}

function Rail({ label, onClick, text, children }: { label: string; onClick: () => void; text?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid min-h-12 min-w-12 place-items-center gap-0.5 text-sm font-bold drop-shadow-lg">
      {children}
      {text ? <span>{text}</span> : null}
    </button>
  );
}

// ---------------------------------------------------------------- sheets ----

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:left-60" onClick={onClose}>
      <div role="dialog" aria-label={title} className="max-h-[78vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-4 text-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center"><h2 className="flex-1 font-display text-2xl">{title}</h2><button type="button" aria-label="Close" onClick={onClose} className="grid size-11 place-items-center"><X className="size-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

function CommentsSheet({ id, onClose, onPosted }: { id: number; onClose: () => void; onPosted: () => void }) {
  const [comments, setComments] = useState<{ id: number; author: string; body: string; createdAt: string }[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await unwrap(showcaseAction({ data: { action: "list-comments", id } }));
      if ("comments" in r) setComments(r.comments);
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    try {
      await unwrap(showcaseAction({ data: { action: "comment", id, body: text } }));
      setText("");
      onPosted();
      await load();
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  return (
    <Sheet title="Comments" onClose={onClose}>
      <ul className="grid gap-3">
        {loading ? <li className="text-sm text-muted">Loading…</li> : comments.length === 0 ? <li className="text-sm text-muted">No comments yet. Say something kind.</li> : comments.map((c) => (
          <li key={c.id} className="flex gap-3"><Avatar name={c.author} size="size-9" /><div><p className="text-sm"><span className="font-semibold">{c.author}</span> <span className="text-xs text-muted">{ago(c.createdAt)}</span></p><p className="text-sm text-pretty">{c.body}</p></div></li>
        ))}
      </ul>
      <form onSubmit={(e) => void send(e)} className="sticky bottom-0 mt-4 flex gap-2 bg-card pt-2"><input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label="Add a comment" maxLength={1000} /><button className="min-h-11 rounded-full bg-denim px-5 font-semibold text-on-denim disabled:opacity-50" disabled={!text.trim()}>Post</button></form>
    </Sheet>
  );
}

function MoreSheet({ item, meId, admin, speed, setSpeed, onClose, onRemoved }: { item: ShowcaseItem; meId: string; admin: boolean; speed: number; setSpeed: (v: number) => void; onClose: () => void; onRemoved: () => void }) {
  const a = useContentActions(item, onRemoved);
  const own = item.userId === meId;
  const isFile = item.kind === "video" && item.hasMedia;
  return (
    <Sheet title="More" onClose={onClose}>
      {isFile ? (
        <div className="mb-3">
          <p className="mb-2 text-sm font-semibold">Playback speed</p>
          <div className="flex flex-wrap gap-2">
            {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} className={`min-h-11 min-w-14 rounded-full px-4 text-sm font-bold ${speed === s ? "bg-denim text-on-denim" : "border border-line"}`}>{s === 1 ? "Normal" : `${s}x`}</button>)}
          </div>
          <p className="mt-2 text-xs text-muted">Slow it down to follow a tutorial or a dance move. You can also tap the speed button on the video.</p>
        </div>
      ) : null}
      <div className="grid gap-1">
        <button type="button" className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-left font-semibold" onClick={() => { void a.share(); onClose(); }}><Share2 className="size-5" />Share link</button>
        {own || admin ? (
          <button type="button" className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-left font-semibold text-danger" onClick={() => void a.remove()}><Trash2 className="size-5" />Remove this post</button>
        ) : (
          <label className="relative flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 font-semibold"><Flag className="size-5" />Report
            <select aria-label="Report reason" className="absolute inset-0 cursor-pointer opacity-0" value="" onChange={(e) => { void a.report(e.target.value); onClose(); }}><option value="">Reason…</option>{REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          </label>
        )}
      </div>
    </Sheet>
  );
}
