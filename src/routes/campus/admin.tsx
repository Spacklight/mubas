import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { adminAct, adminOverview } from "@/lib/campus/server";
import { checkStorage } from "@/lib/campus/showcase";
import { aiAdminAct, aiAdminOverview } from "@/lib/campus/ai";
import { ago } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { useCampus } from "@/components/campus-state";
import { Card, LoadError, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { btn, btnGhost, btnQuiet, Chip, Empty, Field, input, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/admin")({
  head: () => ({ meta: [{ title: "Steward — Zapa MUBAS" }] }),
  component: Admin,
});

type Action = Parameters<typeof adminAct>[0]["data"];

function Admin() {
  const { profile } = useCampus();
  if (profile?.role !== "admin") {
    return <div className="mx-auto max-w-lg"><Empty title="Stewards only" body="This area is for Zapa stewards." /></div>;
  }
  return <Dashboard />;
}

function Dashboard() {
  const { data, error, loading, reload } = useLoad(() => unwrap(adminOverview()), []);

  async function act(data: Action, done = "Done") {
    try {
      await unwrap(adminAct({ data }));
      toast.success(done);
      reload();
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  if (loading && !data) return <div className="mx-auto max-w-5xl"><Skeleton rows={4} /></div>;
  if (error || !data) return <div className="mx-auto max-w-5xl"><LoadError message={error ?? "Could not load."} onRetry={reload} /></div>;
  const s = data.stats;
  const stats: [string, number][] = [
    ["Profiles", s.profiles], ["On MUBAS domain", s.domainOk], ["Email confirmed", s.confirmed], ["Active today", s.activeDay],
    ["Rooms", s.communities], ["Posts", s.posts], ["Videos", s.videos], ["Library items", s.resources],
  ];

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <PageTitle title="Steward tools" lede="Review applications and reports, and look after accounts. Every action is logged." />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([label, value]) => <div key={label} className="panel p-4"><p className="font-display text-3xl text-navy dark:text-sand">{value}</p><p className="text-sm text-muted">{label}</p></div>)}
        <div className="panel p-4"><p className="font-display text-3xl text-navy dark:text-sand">{(s.imageBytes / 1024 / 1024).toFixed(1)} MB</p><p className="text-sm text-muted">Profile images</p></div>
      </section>

      <Card title={`Library applications (${data.applications.length})`}>
        {data.applications.length === 0 ? <p className="text-sm text-muted">No applications waiting.</p> : <ul className="grid gap-3">{data.applications.map((a) => (
          <li key={a.id} className="rounded-xl bg-sand-soft p-3">
            <p className="font-semibold">{a.providerName} <span className="text-sm font-normal text-muted">({a.kind}) · {a.email}</span></p>
            <p className="mt-1 text-sm text-pretty text-muted">{a.description}</p>
            <p className="mt-1 text-xs text-muted">Materials: {a.materials} · Audience: {a.audience}</p>
            <p className="mt-1 text-xs text-muted">Why: {a.reason}</p>
            <div className="mt-2 flex gap-2"><button className={btn} onClick={() => void act({ action: "approve-library", id: a.id }, "Approved")}>Approve</button><button className={btnGhost} onClick={() => void act({ action: "reject-library", id: a.id }, "Rejected")}>Reject</button></div>
          </li>))}</ul>}
      </Card>

      <Card title={`Reports (${data.reports.length})`}>
        {data.reports.length === 0 ? <p className="text-sm text-muted">No open reports.</p> : <ul className="grid gap-3">{data.reports.map((r) => (
          <li key={r.id} className="rounded-xl bg-sand-soft p-3">
            <p className="text-sm"><Chip>{r.reason}</Chip> <span className="ml-1 font-semibold">{r.targetType} #{r.targetId}</span> <span className="text-xs text-muted">· {ago(r.createdAt)}</span></p>
            {r.details ? <p className="mt-1 text-sm text-pretty text-muted">{r.details}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2"><button className={btn} onClick={() => void act({ action: "hide-target", id: r.id }, "Hidden")}>Hide content</button><button className={btnGhost} onClick={() => void act({ action: "review-report", id: r.id }, "Marked reviewed")}>Reviewed</button><button className={btnQuiet} onClick={() => void act({ action: "dismiss-report", id: r.id }, "Dismissed")}>Dismiss</button></div>
          </li>))}</ul>}
      </Card>

      <Card title="People">
        <ul className="divide-y divide-line">{data.people.map((p) => (
          <li key={p.userId} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.fullName}</span><span className="block truncate text-xs text-muted">{p.email} · {p.role}{p.roleConfirmed ? " ✓" : ""} · {p.accountStatus}</span></span>
            {p.role !== "student" && p.role !== "admin" && !p.roleConfirmed ? <button className={btnGhost} onClick={() => void act({ action: "confirm-role", userId: p.userId }, "Role confirmed")}>Confirm role</button> : null}
            {p.accountStatus === "suspended" ? <button className={btnGhost} onClick={() => void act({ action: "restore", userId: p.userId }, "Restored")}>Restore</button> : p.role !== "admin" ? <button className={btnQuiet} onClick={() => void act({ action: "suspend", userId: p.userId }, "Suspended")}>Suspend</button> : null}
          </li>))}</ul>
      </Card>

      <AiKeysCard />

      <StorageCard />

      <Card title="Audit log">
        {data.logs.length === 0 ? <p className="text-sm text-muted">Nothing logged yet.</p> : <ul className="grid gap-1 text-sm">{data.logs.map((l) => <li key={l.id}><span className="font-semibold">{l.action}</span> <span className="text-muted">{l.detail} · {ago(l.createdAt)}</span></li>)}</ul>}
      </Card>
    </div>
  );
}

function StorageCard() {
  const [steps, setSteps] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const result = await unwrap(checkStorage());
      setSteps(result.steps);
    } catch (reason) {
      setSteps([failureMessage(reason)]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Zapa Content storage">
      <p className="text-sm text-muted">Checks that Zapa can save to, read from and delete from the Hugging Face dataset that holds videos, photos and stories.</p>
      <button type="button" className={`${btnGhost} mt-3`} disabled={busy} onClick={() => void run()}>{busy ? "Testing…" : "Run storage check"}</button>
      {steps ? <ul className="mt-3 grid gap-1 text-sm">{steps.map((s) => <li key={s}>{s}</li>)}</ul> : null}
    </Card>
  );
}

type AiAction = Parameters<typeof aiAdminAct>[0]["data"];

function AiKeysCard() {
  const { data, error, loading, reload } = useLoad(() => unwrap(aiAdminOverview()), []);
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState<string>("");
  const [models, setModels] = useState<string>("");
  const [tts, setTts] = useState<string>("");

  useEffect(() => {
    if (!data) return;
    setCredits(String(data.settings.credits));
    setModels(data.settings.models);
    setTts(data.settings.ttsModel);
  }, [data]);

  async function act(payload: AiAction, done: string) {
    setBusy(true);
    try {
      await unwrap(aiAdminAct({ data: payload }));
      toast.success(done);
      reload();
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await unwrap(aiAdminAct({ data: { action: "add-key", label, apiKey } }));
      toast.success("Key added");
      setLabel("");
      setApiKey("");
      reload();
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Zapa AI keys">
      {loading && !data ? <p className="text-sm text-muted">Loading…</p> : error || !data ? <LoadError message={error ?? "Could not load."} onRetry={reload} /> : (
        <div className="grid gap-4">
          <p className="text-sm text-pretty text-muted">Students chat with Gemini through the keys below. Google sets limits per <strong>project</strong>, not per key, so create each key in a <strong>different Google project</strong> (AI Studio, Get API key, Create API key in new project). Keys are stored encrypted and are never shown again.</p>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-sand-soft p-2"><p className="font-display text-2xl">{data.keys.filter((k) => k.enabled).length}</p><p className="text-xs text-muted">active keys</p></div>
            <div className="rounded-xl bg-sand-soft p-2"><p className="font-display text-2xl">{data.today.users}</p><p className="text-xs text-muted">students today</p></div>
            <div className="rounded-xl bg-sand-soft p-2"><p className="font-display text-2xl">~{data.dailyCapacity}</p><p className="text-xs text-muted">requests/day capacity</p></div>
          </div>
          <ul className="grid gap-2">
            {data.keys.length === 0 ? <li className="rounded-xl bg-sand-soft p-3 text-sm">No keys yet. Zapa AI is switched off until you add one.</li> : data.keys.map((k) => (
              <li key={k.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{k.label}</span>
                  <span className="text-xs text-muted">•••• {k.tail}</span>
                  {k.enabled ? <Chip>Active</Chip> : <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">Off</span>}
                  {k.limited.length ? <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-semibold text-navy">Cooling down</span> : null}
                </div>
                {k.note ? <p className="mt-1 text-xs text-danger">{k.note}</p> : null}
                <p className="mt-1 text-xs text-muted">Last 24 hours: {k.usage.length ? k.usage.map((u) => `${u.model} ${u.requests}`).join(" · ") : "no requests"}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={btnGhost} disabled={busy} onClick={() => void act({ action: "test-key", id: k.id }, "Google accepts this key")}>Test</button>
                  <button className={btnGhost} disabled={busy} onClick={() => void act({ action: "toggle-key", id: k.id, enabled: !k.enabled }, k.enabled ? "Key turned off" : "Key turned on")}>{k.enabled ? "Turn off" : "Turn on"}</button>
                  <button className={btnQuiet} disabled={busy} onClick={() => { if (window.confirm(`Delete the key ending ${k.tail}?`)) void act({ action: "delete-key", id: k.id }, "Key deleted"); }}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => void add(e)} className="grid gap-3 rounded-xl bg-sand-soft p-3">
            <p className="font-semibold">Add a Gemini API key</p>
            <Field label="Name (for you)"><input className={input} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="e.g. Project 2" /></Field>
            <Field label="API key"><input className={input} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste the key here" required /></Field>
            <button className={btn} disabled={busy || apiKey.length < 20}>{busy ? "Checking with Google…" : "Add key"}</button>
          </form>
          <div className="grid gap-3 rounded-xl border border-line p-3">
            <p className="font-semibold">Settings</p>
            <Field label="Free credits per student per day"><input className={input} type="number" min={1} max={500} value={credits} onChange={(e) => setCredits(e.target.value)} /></Field>
            <Field label="Chat models, in order of preference"><input className={input} value={models} onChange={(e) => setModels(e.target.value)} /></Field>
            <Field label="Voice model"><input className={input} value={tts} onChange={(e) => setTts(e.target.value)} /></Field>
            <button className={btnGhost} disabled={busy} onClick={() => void act({ action: "settings", credits: Number(credits), models, ttsModel: tts }, "Settings saved")}>Save settings</button>
            <p className="text-xs text-muted">Zapa keeps each key and model under 13 requests a minute and 470 a day, and moves to the next key when Google says a limit is reached.</p>
          </div>
        </div>
      )}
    </Card>
  );
}
