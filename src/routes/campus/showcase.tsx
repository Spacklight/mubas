import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Flag, Heart, ImagePlus, MessageCircle, Plus, Trash2 } from "lucide-react";
import { checkStorage, createShowcase, listShowcase, showcaseAction, SHOWCASE_CATEGORIES, type ShowcaseItem } from "@/lib/campus/showcase";
import { ago, REPORT_REASONS, youtubeId, hostOf } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { useCampus } from "@/components/campus-state";
import { Avatar, LoadError, shrinkImage, Skeleton, Tabs, unwrap, useLoad } from "@/components/page-kit";
import { area, btn, btnGhost, btnQuiet, Chip, Empty, ErrorNote, Field, input, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/showcase")({
  head: () => ({ meta: [{ title: "Showcase — Zapa MUBAS" }] }),
  component: Showcase,
});

const TABS = ["All", "Photos", "Videos", "Posts"] as const;
const KIND: Record<(typeof TABS)[number], "image" | "video" | "post" | undefined> = { All: undefined, Photos: "image", Videos: "video", Posts: "post" };

function Showcase() {
  const { profile } = useCampus();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [sharing, setSharing] = useState(false);
  const [more, setMore] = useState<ShowcaseItem[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const filter = { ...(KIND[tab] ? { kind: KIND[tab] } : {}), ...(category ? { category } : {}), ...(term ? { q: term } : {}) };
  const { data, error, loading, reload } = useLoad(() => unwrap(listShowcase({ data: filter })), [tab, category, term]);
  const items = data ? [...data.items, ...more] : [];

  function reset() {
    setMore([]);
    setDone(false);
    reload();
  }

  async function loadMore() {
    setBusy(true);
    try {
      const result = await unwrap(listShowcase({ data: { ...filter, offset: items.length } }));
      setMore((cur) => [...cur, ...result.items]);
      if (!result.more) setDone(true);
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle title="Showcase" lede="Share your talent, projects and what you know. Photos, videos and posts from MUBAS students." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => setSharing((v) => !v)}><Plus className="size-4" />Share something</button>
        <form onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); setMore([]); setDone(false); }} className="min-w-0 flex-1 sm:max-w-xs"><input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Showcase" aria-label="Search Showcase" /></form>
        <select className={`${input} max-w-44`} value={category} onChange={(e) => { setCategory(e.target.value); setMore([]); setDone(false); }} aria-label="Category"><option value="">All categories</option>{SHOWCASE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      {sharing ? <Share onDone={() => { setSharing(false); reset(); }} /> : null}
      <Tabs items={TABS} value={tab} onChange={(next) => { setTab(next); setMore([]); setDone(false); }} />
      <div className="mt-4">
        {loading && !data ? <Skeleton rows={3} /> : error ? <LoadError message={error} onRetry={reload} /> : items.length === 0 ? (
          <Empty title="Nothing shared yet" body="Be the first. Post a photo of your work, a video link or something you have learned." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">{items.map((item) => <Card key={item.id} item={item} meId={profile?.userId ?? ""} admin={profile?.role === "admin"} onChange={reset} />)}</div>
            {!done && data?.more ? <button type="button" className={`${btnGhost} mt-4 w-full`} onClick={() => void loadMore()} disabled={busy}>{busy ? "Loading…" : "Load more"}</button> : null}
          </>
        )}
      </div>
      {profile?.role === "admin" ? <Storage /> : null}
    </div>
  );
}

function Storage() {
  const [steps, setSteps] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const result = await unwrap(checkStorage());
      setSteps(result.steps);
    } catch (reason) {
      setSteps([failureMessage(reason)]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel mt-8 p-4">
      <h2 className="font-display text-xl">Steward: photo storage</h2>
      <p className="mt-1 text-sm text-muted">Checks that Zapa can save to and read from the Hugging Face dataset.</p>
      <button type="button" className={`${btnGhost} mt-3`} disabled={busy} onClick={() => void run()}>{busy ? "Testing…" : "Run storage check"}</button>
      {steps ? <ul className="mt-3 grid gap-1 text-sm">{steps.map((s) => <li key={s}>{s}</li>)}</ul> : null}
    </section>
  );
}

function Share({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<"post" | "image" | "video">("image");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<(typeof SHOWCASE_CATEGORIES)[number]>("Talent");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageData, setImageData] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setImageData(await shrinkImage(file, 1280, 800_000));
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await unwrap(createShowcase({ data: { kind, title, body, category, ...(kind === "video" ? { linkUrl } : {}), ...(kind === "image" ? { imageData } : {}) } }));
      toast.success("Shared!");
      onDone();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="panel mb-4 grid gap-3 p-4">
      <div className="flex gap-2" role="tablist">
        {([["image", "Photo"], ["video", "Video link"], ["post", "Post"]] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={kind === value} onClick={() => setKind(value)} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${kind === value ? "bg-navy text-on-navy" : "border border-line"}`}>{label}</button>
        ))}
      </div>
      <Field label="Title"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={120} placeholder="What are you sharing?" /></Field>
      <Field label="Category"><select className={input} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>{SHOWCASE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      {kind === "image" ? (
        <div>
          <label className={`${btnGhost} cursor-pointer`}><ImagePlus className="size-4" />{imageData ? "Change photo" : "Choose a photo"}<input type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} /></label>
          {imageData ? <img src={imageData} alt="Preview" className="mt-3 max-h-64 rounded-xl object-cover" /> : null}
        </div>
      ) : null}
      {kind === "video" ? <Field label="Video link (YouTube or any web link)"><input className={input} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://" required /></Field> : null}
      <Field label="Tell people about it (optional)"><textarea className={area} value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} /></Field>
      <p className="text-xs text-pretty text-muted">Only share your own work or things you have permission to share. Other members of Zapa can see it.</p>
      <ErrorNote>{error}</ErrorNote>
      <button className={btn} disabled={pending || (kind === "image" && !imageData)}>{pending ? "Sharing…" : "Share"}</button>
    </form>
  );
}

function Card({ item, meId, admin, onChange }: { item: ShowcaseItem; meId: string; admin: boolean; onChange: () => void }) {
  const { dataSaver } = useCampus();
  const yt = item.linkUrl ? youtubeId(item.linkUrl) : null;
  const [liked, setLiked] = useState(item.liked);
  const [likes, setLikes] = useState(item.likeCount);
  const [show, setShow] = useState(!dataSaver);
  const [play, setPlay] = useState(false);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<{ id: number; author: string; body: string }[]>([]);
  const [text, setText] = useState("");

  async function run<T>(job: () => Promise<T>) {
    try {
      return await job();
    } catch (reason) {
      toast.error(failureMessage(reason));
      return null;
    }
  }

  async function like() {
    const r = await run(() => unwrap(showcaseAction({ data: { action: "like", id: item.id } })));
    if (r && "on" in r) { setLiked(Boolean(r.on)); setLikes((n) => n + (r.on ? 1 : -1)); }
  }
  async function loadComments() {
    const r = await run(() => unwrap(showcaseAction({ data: { action: "list-comments", id: item.id } })));
    if (r && "comments" in r) setComments(r.comments);
  }
  async function toggleComments() {
    setOpen((v) => !v);
    if (!open) await loadComments();
  }
  async function comment(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    await run(() => unwrap(showcaseAction({ data: { action: "comment", id: item.id, body: text } })));
    setText("");
    await loadComments();
  }
  async function report(reason: string) {
    if (!reason) return;
    await run(() => unwrap(showcaseAction({ data: { action: "report", id: item.id, reason: reason as (typeof REPORT_REASONS)[number] } })));
    toast.success("Reported. A steward will look at it.");
  }
  async function remove() {
    if (!window.confirm("Remove this post?")) return;
    const r = await run(() => unwrap(showcaseAction({ data: { action: "delete", id: item.id } })));
    if (r) onChange();
  }

  return (
    <article className="panel overflow-hidden">
      {item.hasImage ? (
        show ? <img src={`/api/media/${item.id}`} alt={item.title} loading="lazy" className="aspect-[4/3] w-full bg-line object-cover" /> : <button type="button" className="grid aspect-[4/3] w-full place-items-center bg-sand-soft text-sm font-semibold" onClick={() => setShow(true)}>Tap to load photo</button>
      ) : null}
      {item.kind === "video" && item.linkUrl ? (
        yt && play ? <div className="aspect-video"><iframe className="size-full" src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`} title={item.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div>
          : <a href={yt ? undefined : item.linkUrl} target="_blank" rel="noreferrer" onClick={yt ? (e) => { e.preventDefault(); setPlay(true); } : undefined} className="hero-glow grid aspect-video place-items-center text-on-navy"><span className="rounded-full bg-sand px-5 py-2.5 text-sm font-semibold text-navy">{yt ? "Play video" : `Watch on ${hostOf(item.linkUrl)}`}</span></a>
      ) : null}
      <div className="p-4">
        <div className="flex items-center gap-2"><Chip>{item.category}</Chip><span className="text-xs text-muted">{ago(item.createdAt)}</span></div>
        <h3 className="mt-2 font-display text-xl leading-snug text-balance">{item.title}</h3>
        {item.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-pretty text-muted">{item.body}</p> : null}
        <div className="mt-3 flex items-center gap-2"><Avatar name={item.author} size="size-8" /><span className="truncate text-sm font-semibold">{item.author}</span></div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button type="button" className={btnQuiet} onClick={() => void like()} aria-pressed={liked}><Heart className={`size-4 ${liked ? "fill-denim text-denim" : ""}`} />{likes}</button>
          <button type="button" className={btnQuiet} onClick={() => void toggleComments()}><MessageCircle className="size-4" />{item.commentCount}</button>
          {item.userId === meId || admin ? <button type="button" className={btnQuiet} onClick={() => void remove()} aria-label="Remove"><Trash2 className="size-4" /></button> : (
            <label className={`${btnQuiet} relative cursor-pointer`}><Flag className="size-4" />Report
              <select aria-label="Report reason" className="absolute inset-0 cursor-pointer opacity-0" value="" onChange={(e) => void report(e.target.value)}><option value="">Reason…</option>{REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
            </label>
          )}
        </div>
        {open ? (
          <div className="mt-3 grid gap-2 border-t border-line pt-3">
            {comments.map((c) => <p key={c.id} className="text-sm"><span className="font-semibold">{c.author}</span> <span className="text-muted">{c.body}</span></p>)}
            <form onSubmit={(e) => void comment(e)} className="flex gap-2"><input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label="Add a comment" maxLength={1000} /><button className={btn} disabled={!text.trim()}>Post</button></form>
          </div>
        ) : null}
      </div>
    </article>
  );
}
