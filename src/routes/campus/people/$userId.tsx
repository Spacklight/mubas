import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Flag, MessageCircle, UserCheck, UserPlus } from "lucide-react";
import { friendRequest, getPerson, openDirect, reportContent, toggleBlock, toggleFollow } from "@/lib/campus/server";
import { activeLabel, roleLabel } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { PostCard } from "@/components/posts";
import { AvatarImg, LoadError, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { btn, btnGhost, btnQuiet, Chip, Empty } from "@/components/ui";

export const Route = createFileRoute("/campus/people/$userId")({
  head: () => ({ meta: [{ title: "Profile — Zapa MUBAS" }] }),
  component: Person,
});

const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

function Person() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useLoad(() => unwrap(getPerson({ data: { userId } })), [userId]);
  const [busy, setBusy] = useState(false);

  async function act(run: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await run();
      if (done) toast.success(done);
      reload();
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function message() {
    setBusy(true);
    try {
      const result = await unwrap(openDirect({ data: { userId } }));
      void navigate({ to: "/campus/messages", search: { thread: result.conversationId } });
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <div className="mx-auto max-w-3xl"><Skeleton rows={3} /></div>;
  if (error || !data) return <div className="mx-auto max-w-3xl"><LoadError message={error ?? "Profile not found."} onRetry={reload} /></div>;
  const p = data.person;
  const badge = roleLabel(p.role, p.roleConfirmed);
  const self = p.relation === "self";

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/campus/discover" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-denim-deep"><ArrowLeft className="size-4" />Back</Link>
      <article className="panel overflow-hidden">
        <div className="h-28 bg-navy md:h-36" style={p.coverData ? { backgroundImage: `url(${p.coverData})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
          {!p.coverData ? <div className="hero-glow h-full w-full" /> : null}
        </div>
        <div className="px-4 pb-4">
          <div className="-mt-10 flex items-end justify-between gap-3">
            <span className="rounded-full border-4 border-card bg-card"><AvatarImg name={p.fullName} src={p.avatarData} size="size-20" /></span>
            {self ? <Link to="/campus/me" className={btnGhost}>Edit profile</Link> : null}
          </div>
          <h1 className="mt-2 font-display text-3xl text-balance">{p.fullName}</h1>
          {badge ? <p className="text-sm font-semibold text-denim-deep">{badge}</p> : null}
          <p className="text-sm text-pretty text-muted">{[p.programmeName, p.schoolShort, p.studyLevel, p.academicYear, p.studyMode].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 text-xs text-muted">{activeLabel(p.lastSeen)} · {p.friendCount} friends · {p.followerCount} followers</p>

          {!self ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {p.relation === "friends" ? <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-good-soft px-4 text-sm font-semibold text-good"><UserCheck className="size-4" />Friends</span>
                : p.relation === "outgoing" ? <span className="inline-flex min-h-11 items-center rounded-full bg-sand-soft px-4 text-sm font-semibold">Request sent</span>
                : p.relation === "incoming" ? <Link to="/campus/discover" className={btn}>Respond to request</Link>
                : <button type="button" className={btn} disabled={busy} onClick={() => void act(() => unwrap(friendRequest({ data: { userId } })), "Friend request sent")}><UserPlus className="size-4" />Add friend</button>}
              <button type="button" className={btnGhost} disabled={busy} onClick={() => void message()}><MessageCircle className="size-4" />Message</button>
              <button type="button" className={btnGhost} disabled={busy} onClick={() => void act(() => unwrap(toggleFollow({ data: { userId } })))}>{p.following ? "Following" : "Follow"}</button>
              <button type="button" className={btnQuiet} disabled={busy} onClick={() => void act(() => unwrap(toggleBlock({ data: { userId, block: !p.blockedByMe } })), p.blockedByMe ? "Unblocked" : "Blocked")}>{p.blockedByMe ? "Unblock" : "Block"}</button>
              <button type="button" className={btnQuiet} disabled={busy} onClick={() => void act(() => unwrap(reportContent({ data: { targetType: "profile", targetId: userId, reason: "Other" } })), "Reported. A steward will look.")}><Flag className="size-4" />Report</button>
            </div>
          ) : null}

          {p.restricted ? <p className="mt-4 rounded-xl bg-sand-soft px-3 py-2 text-sm text-muted">This profile is visible to friends only.</p> : (
            <div className="mt-4 grid gap-3">
              {p.bio ? <p className="text-pretty">{p.bio}</p> : null}
              {p.interests ? <div><p className="mb-1 text-xs font-semibold tracking-wide text-muted">INTERESTS</p><div className="flex flex-wrap gap-1.5">{split(p.interests).map((i) => <Chip key={i}>{i}</Chip>)}</div></div> : null}
              {p.skills ? <div><p className="mb-1 text-xs font-semibold tracking-wide text-muted">SKILLS</p><div className="flex flex-wrap gap-1.5">{split(p.skills).map((i) => <Chip key={i}>{i}</Chip>)}</div></div> : null}
            </div>
          )}
        </div>
      </article>
      <h2 className="mb-3 mt-6 font-display text-2xl">Posts</h2>
      {data.posts.length ? <div className="grid gap-4">{data.posts.map((post) => <PostCard key={post.id} post={post} onChange={reload} />)}</div> : <Empty title="No posts to show" body={p.restricted ? "Posts are visible to friends." : "Nothing posted yet."} />}
    </div>
  );
}
