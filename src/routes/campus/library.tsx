import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { BookOpenText, ExternalLink, Lock } from "lucide-react";
import { addResource, applyLibrary, libraryHome } from "@/lib/campus/server";
import { ago, hostOf, LIBRARY_CATEGORIES } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { Card, LoadError, Skeleton, Tabs, unwrap, useLoad } from "@/components/page-kit";
import { area, btn, Chip, Empty, ErrorNote, Field, input, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/library")({
  head: () => ({ meta: [{ title: "Zapa Library — Zapa MUBAS" }] }),
  component: LibraryPage,
});

const TABS = ["Browse", "My libraries", "Become a provider"] as const;
const ALL = "All";

function LibraryPage() {
  const { data, error, loading, reload } = useLoad(() => unwrap(libraryHome()), []);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Browse");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>(ALL);

  const resources = (data?.resources ?? []).filter((r) => (category === ALL || r.category === category) && `${r.title} ${r.subject} ${r.authorName} ${r.libraryName}`.toLowerCase().includes(q.trim().toLowerCase()));
  const mine = (data?.libraries ?? []).filter((l) => l.role !== "none");

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="Zapa Library" lede="Learning materials from approved providers. Respect copyright: only share what you have the right to share." />
      <Tabs items={TABS} value={tab} onChange={setTab} />
      <div className="mt-4">
        {loading && !data ? <Skeleton rows={3} /> : error ? <LoadError message={error} onRetry={reload} /> : data ? (
          tab === "Browse" ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <input className={`${input} max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, subject, author" aria-label="Search the library" />
                <select className={`${input} max-w-48`} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"><option>{ALL}</option>{LIBRARY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              {resources.length === 0 ? <Empty title="Nothing found" body={data.resources.length ? "Try a different search." : "No library items yet. Providers can add materials once approved."} /> : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {resources.map((r) => (
                    <li key={r.id} className="panel lift flex flex-col p-4">
                      <div className="flex items-center gap-2"><Chip>{r.category}</Chip>{r.access === "members" ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted"><Lock className="size-3.5" />Members</span> : null}</div>
                      <h3 className="mt-2 font-display text-lg leading-snug text-balance">{r.title}</h3>
                      {r.description ? <p className="mt-1 line-clamp-3 flex-1 text-sm text-pretty text-muted">{r.description}</p> : <span className="flex-1" />}
                      <p className="mt-2 text-xs text-muted">{[r.subject, r.authorName && `by ${r.authorName}`, r.libraryName, ago(r.createdAt)].filter(Boolean).join(" · ")}</p>
                      {r.externalUrl ? <a href={r.externalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-denim-deep">Open on {hostOf(r.externalUrl)} <ExternalLink className="size-4" /></a> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : tab === "My libraries" ? (
            <div className="grid gap-4">
              {mine.length === 0 ? <Empty title="You do not run a library yet" body="Apply to become a provider. A steward reviews each application." /> : mine.map((lib) => (
                <Card key={lib.id} title={lib.name}>
                  <p className="text-sm text-pretty text-muted">{lib.description}</p>
                  <p className="mt-1 text-xs font-semibold text-denim-deep">Your role: {lib.role}</p>
                  {lib.role !== "reader" ? <AddResource libraryId={lib.id} onDone={reload} /> : null}
                </Card>
              ))}
              {data.applications.length ? (
                <Card title="Your applications"><ul className="grid gap-2 text-sm">{data.applications.map((a) => <li key={a.id} className="flex items-center justify-between gap-2"><span>{a.providerName} <span className="text-muted">({a.kind})</span></span><Chip>{a.status}</Chip></li>)}</ul></Card>
              ) : null}
            </div>
          ) : <Apply onDone={() => { setTab("My libraries"); reload(); }} />
        ) : null}
      </div>
    </div>
  );
}

function AddResource({ libraryId, onDone }: { libraryId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", subject: "", authorName: "", externalUrl: "", category: LIBRARY_CATEGORIES[0] as string, access: "campus" as "campus" | "members" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof f, value: string) => setF((cur) => ({ ...cur, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await unwrap(addResource({ data: { libraryId, ...f, category: f.category as (typeof LIBRARY_CATEGORIES)[number] } }));
      toast.success("Added to the library");
      setOpen(false);
      onDone();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setPending(false);
    }
  }

  if (!open) return <button type="button" className={`${btn} mt-3`} onClick={() => setOpen(true)}>Add a resource</button>;
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 grid gap-3 border-t border-line pt-3">
      <Field label="Title"><input className={input} value={f.title} onChange={(e) => set("title", e.target.value)} required minLength={2} maxLength={160} /></Field>
      <Field label="Link to the file or page"><input className={input} value={f.externalUrl} onChange={(e) => set("externalUrl", e.target.value)} placeholder="https://" required /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category"><select className={input} value={f.category} onChange={(e) => set("category", e.target.value)}>{LIBRARY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Who can open it"><select className={input} value={f.access} onChange={(e) => set("access", e.target.value)}><option value="campus">Everyone on Zapa</option><option value="members">Library members</option></select></Field>
        <Field label="Subject"><input className={input} value={f.subject} onChange={(e) => set("subject", e.target.value)} /></Field>
        <Field label="Author"><input className={input} value={f.authorName} onChange={(e) => set("authorName", e.target.value)} /></Field>
      </div>
      <Field label="Description"><textarea className={area} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={800} /></Field>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2"><button className={btn} disabled={pending}>{pending ? "Adding…" : "Add resource"}</button><button type="button" className="min-h-11 px-3 text-sm font-semibold" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

function Apply({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ providerName: "", kind: "individual" as "individual" | "organisation", email: "", phone: "", organisation: "", description: "", materials: "", audience: "", reason: "" });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof f, value: string) => setF((cur) => ({ ...cur, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await unwrap(applyLibrary({ data: { ...f, agreed: true as const } }));
      toast.success("Application sent. A steward will review it.");
      onDone();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="panel grid gap-4 p-4">
      <div className="flex items-start gap-3"><BookOpenText className="mt-1 size-6 shrink-0 text-denim-deep" /><p className="text-sm text-pretty text-muted">Anyone can apply to run a library: individuals, student groups and organisations. A steward reviews each application before you can add materials.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Library or provider name"><input className={input} value={f.providerName} onChange={(e) => set("providerName", e.target.value)} required minLength={2} maxLength={120} /></Field>
        <Field label="You are"><select className={input} value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="individual">An individual</option><option value="organisation">An organisation</option></select></Field>
        <Field label="Email"><input className={input} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} required /></Field>
        <Field label="Phone"><input className={input} value={f.phone} onChange={(e) => set("phone", e.target.value)} required minLength={6} maxLength={30} /></Field>
        {f.kind === "organisation" ? <Field label="Organisation name"><input className={input} value={f.organisation} onChange={(e) => set("organisation", e.target.value)} maxLength={120} /></Field> : null}
        <Field label="Types of material"><input className={input} value={f.materials} onChange={(e) => set("materials", e.target.value)} placeholder="Past papers, lecture notes…" required minLength={2} maxLength={300} /></Field>
        <Field label="Intended audience"><input className={input} value={f.audience} onChange={(e) => set("audience", e.target.value)} placeholder="e.g. Year 2 Engineering" required minLength={2} maxLength={200} /></Field>
      </div>
      <Field label="Describe the library"><textarea className={area} value={f.description} onChange={(e) => set("description", e.target.value)} required minLength={20} maxLength={1000} /></Field>
      <Field label="Why do you want to run it?"><textarea className={area} value={f.reason} onChange={(e) => set("reason", e.target.value)} required minLength={10} maxLength={800} /></Field>
      <ul className="list-disc rounded-xl bg-sand-soft py-3 pl-8 pr-3 text-sm text-pretty text-muted">
        <li>Only share material you own or have permission to share.</li>
        <li>No unreleased exams, private documents or pirated books.</li>
        <li>Copyright complaints lead to removal and may end your library.</li>
      </ul>
      <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 size-5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />I have read and accept the library rules, content policy and copyright requirements.</label>
      <ErrorNote>{error}</ErrorNote>
      <button className={btn} disabled={pending || !agreed}>{pending ? "Sending…" : "Submit application"}</button>
    </form>
  );
}
