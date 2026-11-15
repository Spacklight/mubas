import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { BadgeCheck, ExternalLink, Plus } from "lucide-react";
import { createAnnouncement, listAnnouncements } from "@/lib/campus/server";
import { ago, ANNOUNCEMENT_CATEGORIES, hostOf } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { LoadError, Skeleton, Tabs, unwrap, useLoad } from "@/components/page-kit";
import { area, btn, Chip, Empty, ErrorNote, Field, input, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/updates")({
  head: () => ({ meta: [{ title: "MUBAS Updates — Zapa MUBAS" }] }),
  component: Updates,
});

const ALL = "All";

function Updates() {
  const { data, error, loading, reload } = useLoad(() => unwrap(listAnnouncements()), []);
  const [category, setCategory] = useState<string>(ALL);
  const [posting, setPosting] = useState(false);
  const items = (data?.announcements ?? []).filter((item) => category === ALL || item.category === category);

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="MUBAS Updates" lede="Every notice names its source. Only items marked official link to the university’s own announcement." />
      {data?.canPost ? <div className="mb-3"><button type="button" className={btn} onClick={() => setPosting((v) => !v)}><Plus className="size-4" />Post an update</button></div> : null}
      {posting ? <NewUpdate onDone={() => { setPosting(false); reload(); }} /> : null}
      <Tabs items={[ALL, ...ANNOUNCEMENT_CATEGORIES] as const} value={category as typeof ALL} onChange={(next) => setCategory(next)} />
      <div className="mt-4 grid gap-3">
        {loading && !data ? <Skeleton rows={3} /> : error ? <LoadError message={error} onRetry={reload} /> : items.length === 0 ? <Empty title="Nothing here" body="No updates in this category yet." /> : items.map((item) => (
          <article key={item.id} className="panel p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>{item.category}</Chip>
              {item.official ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-good"><BadgeCheck className="size-4" />Official source</span> : <span className="text-xs font-semibold text-muted">Community post · not official</span>}
              <span className="ml-auto text-xs text-muted">{ago(item.createdAt)}</span>
            </div>
            <h2 className="mt-2 font-display text-xl text-balance">{item.title}</h2>
            <p className="mt-1 whitespace-pre-wrap text-pretty text-muted">{item.body}</p>
            <p className="mt-3 text-sm"><span className="font-semibold">Source:</span> {item.sourceLabel}</p>
            {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-denim-deep">Read the original on {hostOf(item.sourceUrl)} <ExternalLink className="size-4" /></a> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function NewUpdate({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<(typeof ANNOUNCEMENT_CATEGORIES)[number]>(ANNOUNCEMENT_CATEGORIES[0]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [official, setOfficial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await unwrap(createAnnouncement({ data: { title, body, category, ...(sourceUrl ? { sourceUrl } : {}), official } }));
      toast.success("Update posted");
      onDone();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="panel mb-4 grid gap-3 p-4">
      <Field label="Title"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={4} maxLength={140} /></Field>
      <Field label="Category"><select className={input} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>{ANNOUNCEMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Details"><textarea className={area} value={body} onChange={(e) => setBody(e.target.value)} required minLength={10} maxLength={2000} /></Field>
      <Field label="Link to the original (optional)"><input className={input} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://www.mubas.ac.mw/…" /></Field>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={official} onChange={(e) => setOfficial(e.target.checked)} />This repeats an official MUBAS notice (stewards check this)</label>
      <ErrorNote>{error}</ErrorNote>
      <button className={btn} disabled={pending}>{pending ? "Posting…" : "Post update"}</button>
    </form>
  );
}
