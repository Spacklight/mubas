import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ExternalLink, Heart, MessageCircle, Play, Plus } from "lucide-react";
import { createVideo, getVideoComments, listVideos, videoAction } from "@/lib/campus/server";
import type { VideoItem } from "@/lib/campus/types";
import { ago, hostOf, VIDEO_CATEGORIES, youtubeId } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { useCampus } from "@/components/campus-state";
import { Avatar, LoadError, Skeleton, Tabs, unwrap, useLoad } from "@/components/page-kit";
import { area, btn, btnGhost, btnQuiet, Empty, ErrorNote, Field, input, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/watch")({
  head: () => ({ meta: [{ title: "Zapa Watch — Zapa MUBAS" }] }),
  component: Watch,
});

const ALL = "All";

function Watch() {
  const [category, setCategory] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [sharing, setSharing] = useState(false);
  const { data, error, loading, reload } = useLoad(
    () => unwrap(listVideos({ data: { ...(category !== ALL ? { category } : {}), ...(term ? { q: term } : {}) } })),
    [category, term],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle title="Zapa Watch" lede="Tutorials, lectures and student stories. Videos are links to where they are hosted, so nothing heavy loads until you tap." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }} className="min-w-0 flex-1 sm:max-w-sm"><input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search videos" aria-label="Search videos" /></form>
        <button type="button" className={btn} onClick={() => setSharing((v) => !v)}><Plus className="size-4" />Share a video</button>
      </div>
      {sharing ? <ShareVideo onDone={() => { setSharing(false); reload(); }} /> : null}
      <Tabs items={[ALL, ...VIDEO_CATEGORIES] as const} value={category as typeof ALL} onChange={(next) => setCategory(next)} />
      <div className="mt-4">
        {loading && !data ? <Skeleton rows={3} /> : error ? <LoadError message={error} onRetry={reload} /> : !data || data.videos.length === 0 ? (
          <Empty title="No videos yet" body="Share a tutorial or a lecture recording link to get things started." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.videos.map((video) => <VideoCard key={video.id} video={video} playlists={data.playlists} onChange={reload} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ShareVideo({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof VIDEO_CATEGORIES)[number]>(VIDEO_CATEGORIES[0]);
  const [externalUrl, setExternalUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await unwrap(createVideo({ data: { title, description, category, externalUrl } }));
      toast.success("Video shared");
      onDone();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="panel mb-4 grid gap-3 p-4">
      <Field label="Title"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={140} /></Field>
      <Field label="Video link (YouTube or any web link)"><input className={input} value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://" required /></Field>
      <Field label="Category"><select className={input} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>{VIDEO_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Description"><textarea className={area} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></Field>
      <ErrorNote>{error}</ErrorNote>
      <button className={btn} disabled={pending}>{pending ? "Sharing…" : "Share video"}</button>
    </form>
  );
}

function VideoCard({ video, playlists, onChange }: { video: VideoItem; playlists: { id: number; title: string }[]; onChange: () => void }) {
  const { profile, dataSaver } = useCampus();
  const yt = youtubeId(video.externalUrl);
  const [play, setPlay] = useState(false);
  const [liked, setLiked] = useState(video.liked);
  const [likes, setLikes] = useState(video.likeCount);
  const [subscribed, setSubscribed] = useState(video.subscribed);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<{ id: number; author: string; body: string; createdAt: string }[]>([]);
  const [text, setText] = useState("");
  const own = profile?.userId === video.userId;

  async function run<T>(job: () => Promise<T>) {
    try {
      return await job();
    } catch (reason) {
      toast.error(failureMessage(reason));
      return null;
    }
  }

  async function like() {
    const result = await run(() => unwrap(videoAction({ data: { action: "like", videoId: video.id } })));
    if (result && "on" in result) {
      setLiked(Boolean(result.on));
      setLikes((n) => n + (result.on ? 1 : -1));
    }
  }

  async function subscribe() {
    const result = await run(() => unwrap(videoAction({ data: { action: "subscribe", creatorId: video.userId } })));
    if (result && "on" in result) setSubscribed(Boolean(result.on));
  }

  async function toggleComments() {
    setOpen((v) => !v);
    if (!open) {
      const result = await run(() => unwrap(getVideoComments({ data: { videoId: video.id } })));
      if (result) setComments(result.comments);
    }
  }

  async function comment(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    await run(() => unwrap(videoAction({ data: { action: "comment", videoId: video.id, body: text } })));
    setText("");
    const result = await run(() => unwrap(getVideoComments({ data: { videoId: video.id } })));
    if (result) setComments(result.comments);
    onChange();
  }

  async function addToPlaylist(playlistId: number) {
    await run(() => unwrap(videoAction({ data: { action: "playlist", videoId: video.id, playlistId } })));
    toast.success("Added to playlist");
  }

  return (
    <article className="panel overflow-hidden">
      <div className="relative aspect-video bg-navy">
        {play && yt ? (
          <iframe className="absolute inset-0 size-full" src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`} title={video.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        ) : (
          <button type="button" onClick={() => (yt ? setPlay(true) : window.open(video.externalUrl, "_blank", "noopener"))} className="group absolute inset-0 grid place-items-center" aria-label={`Play ${video.title}`}>
            {yt && !dataSaver ? <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-90" /> : <span className="hero-glow absolute inset-0" />}
            <span className="relative grid size-14 place-items-center rounded-full bg-sand text-navy shadow-lg transition group-hover:scale-105">{yt ? <Play className="size-6" /> : <ExternalLink className="size-6" />}</span>
          </button>
        )}
      </div>
      <div className="p-4">
        <p className="text-xs font-semibold tracking-wide text-denim-deep">{video.category.toUpperCase()}</p>
        <h3 className="mt-0.5 font-display text-xl leading-snug text-balance">{video.title}</h3>
        {video.description ? <p className="mt-1 line-clamp-2 text-sm text-pretty text-muted">{video.description}</p> : null}
        <div className="mt-3 flex items-center gap-2"><Avatar name={video.author} size="size-8" /><div className="min-w-0 flex-1 text-sm"><p className="truncate font-semibold">{video.author}</p><p className="text-xs text-muted">{ago(video.createdAt)} · {hostOf(video.externalUrl)}</p></div>
          {!own ? <button type="button" className={subscribed ? btnGhost : btn} onClick={() => void subscribe()}>{subscribed ? "Subscribed" : "Subscribe"}</button> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <button type="button" className={btnQuiet} onClick={() => void like()} aria-pressed={liked}><Heart className={`size-4 ${liked ? "fill-denim text-denim" : ""}`} />{likes}</button>
          <button type="button" className={btnQuiet} onClick={() => void toggleComments()}><MessageCircle className="size-4" />{video.commentCount}</button>
          {playlists.length ? (
            <select className="min-h-11 rounded-full border border-line bg-card px-3 text-sm" aria-label="Add to playlist" value="" onChange={(e) => e.target.value && void addToPlaylist(Number(e.target.value))}>
              <option value="">Save to…</option>
              {playlists.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          ) : null}
        </div>
        {open ? (
          <div className="mt-3 grid gap-2 border-t border-line pt-3">
            {comments.map((c) => <p key={c.id} className="text-sm"><span className="font-semibold">{c.author}</span> <span className="text-muted">{c.body}</span></p>)}
            <form onSubmit={(e) => void comment(e)} className="flex gap-2"><input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label="Add a comment" maxLength={1500} /><button className={btn} disabled={!text.trim()}>Post</button></form>
          </div>
        ) : null}
      </div>
    </article>
  );
}
