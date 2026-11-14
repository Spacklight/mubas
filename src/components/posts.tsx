import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  addComment,
  createPost,
  deleteComment,
  deletePost,
  getComments,
  reportContent,
  toggleLike,
  toggleSave,
} from "@/lib/campus/server";
import type { Comment, Post, PostKind } from "@/lib/campus/types";
import { ago, hostOf, initials, kindLabel, roleLabel, youtubeId } from "@/lib/campus/logic";
import { REPORT_REASONS } from "@/lib/campus/logic";
import { useCampus } from "@/components/campus-state";
import { btn, btnGhost, btnQuiet, Chip, ErrorNote, input } from "@/components/ui";
import { failureMessage } from "@/lib/campus/email-auth";

export function Composer({
  audience = "campus",
  communitySlug,
  onDone,
}: {
  audience?: "campus" | "friends" | "community";
  communitySlug?: string;
  onDone: () => void;
}) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<PostKind>("note");
  const [linkUrl, setLinkUrl] = useState("");
  const [who, setWho] = useState(audience);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await createPost({
        data: {
          body,
          kind,
          audience: communitySlug ? "community" : who,
          linkUrl,
          communitySlug,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      setLinkUrl("");
      onDone();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="panel p-4">
      <div className="flex flex-wrap gap-2">
        {(["note", "question", "material"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setKind(item)}
            className={item === kind ? btn : btnGhost}
          >
            {kindLabel(item)}
          </button>
        ))}
      </div>
      <textarea
        className="mt-3 min-h-24 w-full resize-y rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-denim"
        placeholder={kind === "question" ? "Ask the campus…" : "Share a note, a find, or a question…"}
        value={body}
        maxLength={4000}
        onChange={(event) => setBody(event.target.value)}
      />
      <input
        className={`${input} mt-2`}
        placeholder="Optional link"
        value={linkUrl}
        onChange={(event) => setLinkUrl(event.target.value)}
      />
      {!communitySlug ? (
        <label className="mt-2 flex items-center gap-2 text-sm text-muted">
          Who can see it
          <select className={input} value={who} onChange={(event) => setWho(event.target.value as "campus" | "friends")}>
            <option value="campus">Anyone on Zapa</option>
            <option value="friends">Friends</option>
          </select>
        </label>
      ) : (
        <p className="mt-2 text-xs text-muted">This posts into the room.</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <ErrorNote>{error}</ErrorNote>
        <button className={btn} disabled={pending || !body.trim()} type="submit">
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  );
}

export function PostCard({ post, onChange }: { post: Post; onChange: () => void }) {
  const { profile, dataSaver } = useCampus();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.saved);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState("");
  const [play, setPlay] = useState(false);
  const video = post.linkUrl ? youtubeId(post.linkUrl) : null;
  const badge = roleLabel(post.role, post.roleConfirmed);

  useEffect(() => {
    setLiked(post.liked);
    setLikes(post.likeCount);
    setSaved(post.saved);
  }, [post.id, post.liked, post.likeCount, post.saved]);

  async function loadComments() {
    setOpen(true);
    const result = await getComments({ data: { postId: post.id } });
    if (result.ok) setComments(result.comments);
  }

  async function like() {
    const result = await toggleLike({ data: { postId: post.id } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setLiked(result.on);
    setLikes((count) => count + (result.on ? 1 : -1));
  }

  async function save() {
    const result = await toggleSave({ data: { postId: post.id } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSaved(result.on);
  }

  async function sendComment(event: FormEvent) {
    event.preventDefault();
    const result = await addComment({ data: { postId: post.id, body: comment } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setComment("");
    await loadComments();
    onChange();
  }

  async function remove() {
    const result = await deletePost({ data: { postId: post.id } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onChange();
  }

  async function report(reason: string) {
    const result = await reportContent({
      data: { targetType: "post", targetId: String(post.id), reason: reason as (typeof REPORT_REASONS)[number] },
    });
    if (!result.ok) toast.error(result.error);
    else toast.success("Report sent to stewards.");
  }

  return (
    <article className="panel p-4">
      <div className="flex items-start gap-3">
        <Link
          to="/campus/people/$userId"
          params={{ userId: post.userId }}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-denim-soft text-sm font-semibold text-ink"
        >
          {initials(post.author)}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link to="/campus/people/$userId" params={{ userId: post.userId }} className="font-semibold text-ink">
              {post.author}
            </Link>
            <span className="text-xs text-muted">{ago(post.createdAt)}</span>
          </div>
          <p className="text-sm text-muted">
            {[post.programmeName, post.schoolShort].filter(Boolean).join(" · ") || "MUBAS"}
          </p>
        </div>
        <Chip>{kindLabel(post.kind)}</Chip>
      </div>
      {badge ? <p className="mt-3 text-xs font-medium text-navy dark:text-sand">{badge}</p> : null}
      <p className="mt-3 whitespace-pre-wrap text-pretty text-ink">{post.body}</p>
      {post.shared ? (
        <blockquote className="mt-3 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-muted">
          <span className="font-semibold text-ink">{post.shared.author}</span>
          <span className="mt-1 block whitespace-pre-wrap">{post.shared.body}</span>
        </blockquote>
      ) : null}
      {post.linkUrl ? (
        <div className="mt-3">
          {video && !dataSaver ? (
            play ? (
              <iframe
                className="aspect-video w-full rounded-xl"
                src={`https://www.youtube-nocookie.com/embed/${video}`}
                title="Video"
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <button type="button" className={btnGhost} onClick={() => setPlay(true)}>
                Play video
              </button>
            )
          ) : (
            <a className="text-sm font-semibold text-denim-deep underline-offset-2 hover:underline" href={post.linkUrl} target="_blank" rel="noreferrer">
              {hostOf(post.linkUrl)}
            </a>
          )}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted">
        {post.audience === "friends" ? "Friends" : post.audience === "community" ? post.communityName : "Campus"}
        {" · "}
        {likes} likes · {post.commentCount} comments
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className={btnQuiet} onClick={() => void like()}>
          {liked ? "Liked" : "Like"}
        </button>
        <button type="button" className={btnQuiet} onClick={() => void loadComments()}>
          Comment
        </button>
        <button type="button" className={btnQuiet} onClick={() => void save()}>
          {saved ? "Saved" : "Save"}
        </button>
        <button
          type="button"
          className={btnQuiet}
          onClick={() =>
            void createPost({
              data: { body: "Sharing this with the campus.", audience: "campus", kind: "note", sharedPostId: post.id },
            }).then((result) => {
              if (!result.ok) toast.error(result.error);
              else {
                toast.success("Shared to the campus feed.");
                onChange();
              }
            })
          }
        >
          Share
        </button>
        {profile?.userId === post.userId ? (
          <button type="button" className={btnQuiet} onClick={() => void remove()}>
            Delete
          </button>
        ) : null}
        <details className="relative">
          <summary className={btnQuiet}>Report</summary>
          <div className="panel absolute right-0 z-10 mt-1 w-48 p-2">
            {REPORT_REASONS.map((reason) => (
              <button key={reason} type="button" className={`${btnQuiet} w-full justify-start`} onClick={() => void report(reason)}>
                {reason}
              </button>
            ))}
          </div>
        </details>
      </div>
      {open ? (
        <div className="mt-3 grid gap-2 border-t border-line pt-3">
          {comments.map((item) => (
            <div key={item.id} className="text-sm">
              <span className="font-semibold">{item.author}</span>{" "}
              <span className="text-xs text-muted">{ago(item.createdAt)}</span>
              <p className="whitespace-pre-wrap text-ink">{item.body}</p>
              {profile?.userId === item.userId ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-muted"
                  onClick={() =>
                    void deleteComment({ data: { commentId: item.id } }).then(() => {
                      void loadComments();
                      onChange();
                    })
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <form onSubmit={(event) => void sendComment(event)} className="flex gap-2">
            <input className={input} value={comment} placeholder="Write a comment" onChange={(event) => setComment(event.target.value)} />
            <button className={btn} type="submit" disabled={!comment.trim()}>
              Send
            </button>
          </form>
        </div>
      ) : null}
    </article>
  );
}
