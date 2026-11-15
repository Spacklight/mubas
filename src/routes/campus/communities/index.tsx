import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { listCommunities } from "@/lib/campus/server";
import type { CommunityCard } from "@/lib/campus/types";
import { LoadError, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { JoinButton } from "@/components/join-button";
import { Empty, input, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/communities/")({
  head: () => ({ meta: [{ title: "Communities — Zapa MUBAS" }] }),
  component: Communities,
});

function Communities() {
  const { data, error, loading, reload } = useLoad(() => unwrap(listCommunities()), []);
  const [q, setQ] = useState("");
  const rooms = (data?.communities ?? []).filter((room) => `${room.name} ${room.summary}`.toLowerCase().includes(q.trim().toLowerCase()));
  const mine = rooms.filter((room) => room.membership === "member" || room.membership === "rep");
  const others = rooms.filter((room) => !mine.includes(room));

  const card = (room: CommunityCard) => (
    <article key={room.id} className="panel lift flex flex-col p-4">
      <Link to="/campus/communities/$slug" params={{ slug: room.slug }} className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-denim-soft text-denim-deep"><Users className="size-5" /></span>
        <span className="min-w-0">
          <span className="block font-display text-lg leading-tight">{room.name}</span>
          <span className="text-xs text-muted">{room.schoolShort ? `${room.schoolShort} · ` : ""}{room.memberCount} {room.memberCount === 1 ? "member" : "members"}</span>
        </span>
      </Link>
      <p className="mt-2 flex-1 text-sm text-pretty text-muted">{room.summary}</p>
      <div className="mt-3 flex items-center gap-2">
        <JoinButton room={room} onChange={reload} />
        <Link to="/campus/communities/$slug" params={{ slug: room.slug }} className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-denim-deep">Open</Link>
      </div>
    </article>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle title="Communities" lede="A room for every programme and school. Ask questions, form study groups and share resources." />
      <input className={`${input} mb-4 max-w-md`} placeholder="Search rooms" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rooms" />
      {loading && !data ? (
        <Skeleton rows={4} />
      ) : error ? (
        <LoadError message={error} onRetry={reload} />
      ) : rooms.length === 0 ? (
        <Empty title="No rooms found" body="Try a different search." />
      ) : (
        <div className="grid gap-6">
          {mine.length ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold tracking-wide text-denim-deep">YOUR ROOMS</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{mine.map(card)}</div>
            </section>
          ) : null}
          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-denim-deep">ALL ROOMS</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{others.map(card)}</div>
          </section>
        </div>
      )}
    </div>
  );
}
