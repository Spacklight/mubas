import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Flag, MessageCircle, Play, Share2, ThumbsUp, Trash2 } from "lucide-react";
import { listShowcase, showcaseAction, type ShowcaseItem } from "@/lib/campus/showcase";
import { ago, hostOf, REPORT_REASONS, youtubeId } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { useCampus } from "@/components/campus-state";
import { compact, Hashtagged, useContentActions } from "@/components/content-cards";
import { Avatar, LoadError, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { btn, btnGhost, Empty, input } from "@/components/ui";

export const Route = createFileRoute("/campus/content/$id")({
  head: () => ({ meta: [{ title: "Zapa Content — Zapa MUBAS" }] }),
  component: Viewer,
});

function Viewer() {
  const { id } = Route.useParams();
  const numeric = Number(id);
  const { data, error, loading, reload } = useLoad(() => unwrap(listShowcase({ data: { id: numeric } })), [numeric]);
  const item = data?.items[0];

  useEffect(() => {
    if (item) void showcaseAction({ data: { action: "view", id: item.id } }).catch(() => undefined);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/campus" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-denim-deep"><ArrowLeft className="size-4" />Back to Zapa Content</Link>
      {loading && !data ? <Skeleton rows={2} /> : error ? <LoadError message={error} onRetry={reload} /> : !item ? <Empty title="This post is no longer available" body="It may have been removed." /> : <Detail key={item.id} item={item} onChange={reload} />}
    </div>
  );
}

function Media({ item, saver }: { item: ShowcaseItem; saver: boolean }) {
  const yt = item.linkUrl ? youtubeId(item.linkUrl) : null;
  const [play, setPlay] = useState(false);
  if (item.kind === "video" && item.hasMedia) {
    return <video controls playsInline preload={saver ? "none" : "metadata"} poster={item.hasThumb && !saver ? `/api/media/${item.id}?thumb=1` : undefined} src={`/api/media/${item.id}`} className="max-h-[75vh] w-full rounded-2xl bg-black" />;
  }
  if (item.kind === "image" && item.hasMedia) return <img src={`/api/media/${item.id}`} alt={item.title} className="max-h-[75vh] w-full rounded-2xl bg-black object-contain" />;
  if (item.kind === "video" && item.linkUrl) {
    return yt && play ? (
      <div className="aspect-video overflow-hidden rounded-2xl"><iframe className="size-full" src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`} title={item.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div>
    ) : (
      <a href={yt ? undefined : item.linkUrl!} target="_blank" rel="noreferrer" onClick={yt ? (e) => { e.preventDefault(); setPlay(true); } : undefined} className="hero-glow grid aspect-video place-items-center rounded-2xl text-on-navy">
        <span className="inline-flex items-center gap-2 rounded-full bg-sand px-5 py-2.5 font-semibold text-navy"><Play className="size-4" />{yt ? "Play video" : `Watch on ${hostOf(item.linkUrl!)}`}</span>
      </a>
    );
  }
  return <div className="hero-glow grid min-h-48 place-items-center rounded-2xl p-6 text-center text-on-navy"><p className="font-display text-3xl text-balance">{item.title}</p></div>;
}

function Detail({ item, onChange }: { item: ShowcaseItem; onChange: () => void }) {
  const { profile, dataSaver } = useCampus();
  const a = useContentActions(item, onChange);
  const [comments, setComments] = useState<{ id: number; author: string; body: string; createdAt: string }[]>([]);
  const [text, setText] = useState("");
  const own = profile?.userId === item.userId;
  const admin = profile?.role === "admin";

  async function load() {
    try {
      const r = await unwrap(showcaseAction({ data: { action: "list-comments", id: item.id } }));
      if ("comments" in r) setComments(r.comments);
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    try {
      await unwrap(showcaseAction({ data: { action: "comment", id: item.id, body: text } }));
      setText("");
      await load();
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  return (
    <article className="grid gap-4">
      <Media item={item} saver={dataSaver} />
      <div>
        <h1 className="font-display text-3xl text-balance">{item.title}</h1>
        {item.body ? <p className="mt-2 whitespace-pre-wrap text-pretty"><Hashtagged tone="light" text={item.body} /></p> : null}
        <p className="mt-2 text-sm text-muted">{compact(item.views)} views · {item.category} · {ago(item.createdAt)}</p>
      </div>
      <div className="flex items-center gap-3">
        <Link to="/campus/people/$userId" params={{ userId: item.userId }} className="flex min-w-0 items-center gap-3"><Avatar name={item.author} /><span className="truncate font-semibold">{item.author}</span></Link>
        {!own ? <button type="button" onClick={() => void a.follow()} className={a.following ? btnGhost : btn}>{a.following ? "Following" : "Follow"}</button> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-y border-line py-2">
        <button type="button" onClick={() => void a.like()} aria-pressed={a.liked} className={btnGhost}><ThumbsUp className={`size-4 ${a.liked ? "fill-denim text-denim" : ""}`} />{compact(a.likes)}</button>
        <a href="#comments" className={btnGhost}><MessageCircle className="size-4" />{comments.length}</a>
        <button type="button" onClick={() => void a.share()} className={btnGhost}><Share2 className="size-4" />{compact(a.shares)}</button>
        {own || admin ? (
          <button type="button" onClick={() => void a.remove()} className={btnGhost}><Trash2 className="size-4" />Remove</button>
        ) : (
          <label className={`${btnGhost} relative cursor-pointer`}><Flag className="size-4" />Report
            <select aria-label="Report reason" className="absolute inset-0 cursor-pointer opacity-0" value="" onChange={(e) => void a.report(e.target.value)}>
              <option value="">Reason…</option>
              {REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        )}
      </div>
      <section id="comments" className="scroll-mt-20">
        <h2 className="font-display text-2xl">Comments</h2>
        <ul className="mt-3 grid gap-3">
          {comments.length === 0 ? <li className="text-sm text-muted">No comments yet. Say something kind.</li> : comments.map((c) => (
            <li key={c.id} className="flex gap-3"><Avatar name={c.author} size="size-9" /><div><p className="text-sm"><span className="font-semibold">{c.author}</span> <span className="text-xs text-muted">{ago(c.createdAt)}</span></p><p className="text-sm text-pretty">{c.body}</p></div></li>
          ))}
        </ul>
        <form onSubmit={(e) => void send(e)} className="mt-4 flex gap-2"><input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label="Add a comment" maxLength={1000} /><button className={btn} disabled={!text.trim()}>Post</button></form>
      </section>
    </article>
  );
}
