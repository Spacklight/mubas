import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight, Library, Megaphone, Play, Users } from "lucide-react";
import { getFeed, getHome } from "@/lib/campus/server";
import type { Post } from "@/lib/campus/types";
import { ago } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { useCampus } from "@/components/campus-state";
import { Composer, PostCard } from "@/components/posts";
import { PersonRow } from "@/components/people";
import { Card, LoadError, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { btnGhost, Empty } from "@/components/ui";

export const Route = createFileRoute("/campus/")({
  head: () => ({ meta: [{ title: "Home — Zapa MUBAS" }] }),
  component: Home,
});

function Home() {
  const { profile } = useCampus();
  const { data, error, loading, reload } = useLoad(() => unwrap(getHome()), []);
  const [more, setMore] = useState<Post[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const posts = data ? [...data.posts, ...more] : [];
  const first = profile?.fullName.split(" ")[0] ?? "there";

  function refreshAll() {
    setMore([]);
    setDone(false);
    reload();
  }

  async function loadMore() {
    setBusy(true);
    try {
      const result = await unwrap(getFeed({ data: { offset: posts.length } }));
      setMore((current) => [...current, ...result.posts]);
      if (result.posts.length === 0) setDone(true);
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="hero-glow rise overflow-hidden rounded-card px-5 py-6 text-on-navy md:px-8 md:py-8">
        <p className="text-xs font-semibold tracking-widest text-sand">WELCOME BACK</p>
        <h1 className="mt-1 font-display text-3xl text-balance md:text-4xl">Hello, {first}.</h1>
        <p className="mt-1 max-w-xl text-pretty text-on-navy/85">
          {profile?.programmeName ? `${profile.programmeName}${profile.academicYear ? ` · ${profile.academicYear}` : ""}. ` : ""}
          See what your campus is talking about.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
          <Link to="/campus/discover" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-sand px-4 text-navy">Find classmates <ArrowRight className="size-4" /></Link>
          <Link to="/campus/communities" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-on-navy/40 px-4">Programme rooms</Link>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="grid min-w-0 content-start gap-4">
          <Composer onDone={refreshAll} />
          {loading && !data ? (
            <Skeleton rows={3} />
          ) : error ? (
            <LoadError message={error} onRetry={reload} />
          ) : posts.length === 0 ? (
            <Empty title="No posts yet" body="Be the first to post. Ask a question, share a note or say hello to your programme." />
          ) : (
            <>
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onChange={refreshAll} />
              ))}
              {done ? (
                <p className="text-center text-sm text-muted">You are all caught up.</p>
              ) : (
                <button type="button" className={btnGhost} onClick={() => void loadMore()} disabled={busy}>
                  {busy ? "Loading…" : "Load more"}
                </button>
              )}
            </>
          )}
        </div>

        <aside className="grid content-start gap-4">
          {data ? (
            <>
              <Card title="People you may know" action={<Link to="/campus/discover" className="text-sm font-semibold text-denim-deep">See all</Link>}>
                {data.people.length === 0 ? (
                  <p className="text-sm text-muted">Finish your profile to get suggestions.</p>
                ) : (
                  <div className="grid gap-2">
                    {data.people.slice(0, 4).map((person) => (
                      <PersonRow key={person.userId} person={person} onChange={refreshAll} />
                    ))}
                  </div>
                )}
              </Card>
              <Card title="MUBAS Updates" action={<Link to="/campus/updates" className="text-sm font-semibold text-denim-deep">All</Link>}>
                <ul className="grid gap-3">
                  {data.announcements.slice(0, 3).map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <Megaphone className="mt-0.5 size-4 shrink-0 text-denim-deep" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-pretty">{item.title}</p>
                        <p className="text-xs text-muted">{item.sourceLabel} · {ago(item.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
              {data.rooms.length ? (
                <Card title="Your rooms">
                  <div className="flex flex-wrap gap-2">
                    {data.rooms.map((room) => (
                      <Link key={room.slug} to="/campus/communities/$slug" params={{ slug: room.slug }} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-denim-soft px-3 text-xs font-semibold">
                        <Users className="size-3.5" />{room.name}
                      </Link>
                    ))}
                  </div>
                </Card>
              ) : null}
              {data.videos.length ? (
                <Card title="On Zapa Watch" action={<Link to="/campus/watch" className="text-sm font-semibold text-denim-deep">More</Link>}>
                  <ul className="grid gap-2">
                    {data.videos.slice(0, 3).map((video) => (
                      <li key={video.id} className="flex items-center gap-3 text-sm">
                        <Play className="size-4 shrink-0 text-denim-deep" />
                        <span className="min-w-0"><span className="block truncate font-semibold">{video.title}</span><span className="text-xs text-muted">{video.author} · {video.category}</span></span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              {data.resources.length ? (
                <Card title="New in the Library" action={<Link to="/campus/library" className="text-sm font-semibold text-denim-deep">Browse</Link>}>
                  <ul className="grid gap-2">
                    {data.resources.slice(0, 3).map((item) => (
                      <li key={item.id} className="flex items-center gap-3 text-sm">
                        <Library className="size-4 shrink-0 text-denim-deep" />
                        <span className="min-w-0"><span className="block truncate font-semibold">{item.title}</span><span className="text-xs text-muted">{item.libraryName} · {item.category}</span></span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
