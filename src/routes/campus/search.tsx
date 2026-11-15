import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { searchCampus } from "@/lib/campus/server";
import { Card, LoadError, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { Empty, input, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/search")({
  validateSearch: (search: Record<string, unknown>) => ({ q: typeof search.q === "string" ? search.q : "" }),
  head: () => ({ meta: [{ title: "Search — Zapa MUBAS" }] }),
  component: Search,
});

function Search() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [text, setText] = useState(q);
  const ready = q.trim().length >= 2;
  const { data, error, loading, reload } = useLoad(async () => (ready ? await unwrap(searchCampus({ data: { q } })) : null), [q]);
  const total = data ? data.people.length + data.posts.length + data.communities.length + data.videos.length + data.resources.length + data.announcements.length : 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    void navigate({ to: "/campus/search", search: { q: text.trim() } });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Search" lede="People, rooms, posts, videos, library items and announcements." />
      <form onSubmit={submit} className="mb-4"><input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Search Zapa" aria-label="Search Zapa" autoFocus /></form>
      {!ready ? <Empty title="Type at least 2 letters" body="Try a name, a programme or a topic." /> : loading && !data ? <Skeleton rows={3} /> : error ? <LoadError message={error} onRetry={reload} /> : data && total === 0 ? <Empty title="No results" body={`Nothing matched “${q}”.`} /> : data ? (
        <div className="grid gap-4">
          {data.people.length ? <Card title="People"><ul className="grid gap-2">{data.people.map((p) => <li key={p.userId}><Link to="/campus/people/$userId" params={{ userId: p.userId }} className="block min-h-11 rounded-xl px-2 py-1 hover:bg-sand-soft"><span className="font-semibold">{p.fullName}</span><span className="block text-xs text-muted">{[p.programmeName, p.schoolShort].filter(Boolean).join(" · ")}</span></Link></li>)}</ul></Card> : null}
          {data.communities.length ? <Card title="Rooms"><ul className="grid gap-1">{data.communities.map((c) => <li key={c.slug}><Link to="/campus/communities/$slug" params={{ slug: c.slug }} className="block min-h-11 rounded-xl px-2 py-2 font-semibold hover:bg-sand-soft">{c.name}</Link></li>)}</ul></Card> : null}
          {data.posts.length ? <Card title="Posts"><ul className="grid gap-3">{data.posts.map((p) => <li key={p.id} className="text-sm"><span className="font-semibold">{p.author}</span><p className="line-clamp-2 text-pretty text-muted">{p.body}</p></li>)}</ul></Card> : null}
          {data.videos.length ? <Card title="Videos"><ul className="grid gap-1">{data.videos.map((v) => <li key={v.id}><Link to="/campus/watch" className="block min-h-11 rounded-xl px-2 py-2 hover:bg-sand-soft">{v.title}</Link></li>)}</ul></Card> : null}
          {data.resources.length ? <Card title="Library"><ul className="grid gap-1">{data.resources.map((r) => <li key={r.id}><Link to="/campus/library" className="block min-h-11 rounded-xl px-2 py-2 hover:bg-sand-soft">{r.title}</Link></li>)}</ul></Card> : null}
          {data.announcements.length ? <Card title="Updates"><ul className="grid gap-1">{data.announcements.map((a) => <li key={a.id}><Link to="/campus/updates" className="block min-h-11 rounded-xl px-2 py-2 hover:bg-sand-soft">{a.title}</Link></li>)}</ul></Card> : null}
        </div>
      ) : null}
    </div>
  );
}
