import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Users } from "lucide-react";
import { getFeed, listCommunities } from "@/lib/campus/server";
import { Composer, PostCard } from "@/components/posts";
import { LoadError, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { Empty } from "@/components/ui";
import { JoinButton } from "@/components/join-button";

export const Route = createFileRoute("/campus/communities/$slug")({
  head: () => ({ meta: [{ title: "Room — Zapa MUBAS" }] }),
  component: Room,
});

function Room() {
  const { slug } = Route.useParams();
  const rooms = useLoad(() => unwrap(listCommunities()), [slug]);
  const feed = useLoad(() => unwrap(getFeed({ data: { communitySlug: slug } })), [slug]);
  const room = rooms.data?.communities.find((item) => item.slug === slug);
  const member = room?.membership === "member" || room?.membership === "rep";

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/campus/communities" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-denim-deep"><ArrowLeft className="size-4" />All rooms</Link>
      {rooms.loading && !rooms.data ? (
        <Skeleton rows={1} />
      ) : room ? (
        <header className="hero-glow rise mb-4 rounded-card px-5 py-6 text-on-navy">
          <span className="grid size-12 place-items-center rounded-xl bg-on-navy/10"><Users className="size-6 text-sand" /></span>
          <h1 className="mt-3 font-display text-3xl text-balance">{room.name}</h1>
          <p className="mt-1 text-pretty text-on-navy/85">{room.summary}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <JoinButton room={room} onChange={rooms.reload} />
            <span className="text-sm text-on-navy/80">{room.memberCount} {room.memberCount === 1 ? "member" : "members"}</span>
          </div>
        </header>
      ) : (
        <Empty title="Room not found" body="It may have been removed." />
      )}
      {room && member ? <div className="mb-4"><Composer audience="community" communitySlug={slug} onDone={feed.reload} /></div> : room ? <p className="panel mb-4 p-4 text-sm text-muted">Join this room to post in it.</p> : null}
      {feed.loading && !feed.data ? (
        <Skeleton rows={3} />
      ) : feed.error ? (
        <LoadError message={feed.error} onRetry={feed.reload} />
      ) : feed.data && feed.data.posts.length ? (
        <div className="grid gap-4">{feed.data.posts.map((post) => <PostCard key={post.id} post={post} onChange={feed.reload} />)}</div>
      ) : (
        <Empty title="Quiet in here" body="Start the first discussion." />
      )}
    </div>
  );
}
