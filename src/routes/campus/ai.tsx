import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AudioLines, BookOpen, Camera, Check, CheckCheck, Crown, Download, FileText, FolderOpen, GraduationCap, Lightbulb, Lock, Mic, MessageCircle, Paperclip, Pause, Send, Settings as SettingsIcon, Trash2, Volume2, X } from "lucide-react";
import { AI_COSTS, aiChat, aiManage, aiSpeak, aiStatus, type AiFile, type AiMessage } from "@/lib/campus/ai";
import { myPayments, payConfig } from "@/lib/campus/pay";
import type { Feature } from "@/lib/campus/plans";
import { PaymentBox } from "@/components/payment-box";
import { ago } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { pcmToWavUrl, speakOnDevice, stopDeviceSpeech } from "@/lib/audio";
import { AiMarkdown } from "@/components/ai-markdown";
import { ZapaRobot } from "@/components/zapa-robot";
import { LoadError, shrinkImage, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { input } from "@/components/ui";

export const Route = createFileRoute("/campus/ai")({
  head: () => ({ meta: [{ title: "Zapa AI — Zapa MUBAS" }] }),
  component: ZapaAi,
});

type Credits = { used: number; limit: number; left: number; renewsInMinutes: number };
type Tab = "chat" | "files" | "voice" | "plus" | "settings";
type Plan = { name: string; price: number; features: Feature[]; voiceCost: number; maxPdfMb: number; expiresAt: string | null };
type Mode = "chat" | "quiz" | "study-plan" | "essay" | "exam";
type Prefs = { voice: "device" | "hd"; rate: number; lang: string; autoRead: boolean };

const DEFAULT_PREFS: Prefs = { voice: "device", rate: 1, lang: "en-GB", autoRead: false };
const SUGGESTIONS = ["What is opportunity cost? Explain it simply.", "Help me understand double-entry bookkeeping.", "How do I write a good lab report?", "Give me a study plan for exams in two weeks."];

function usePrefs(): [Prefs, (next: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("zapa-ai-prefs");
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) });
    } catch {
      // keep defaults
    }
  }, []);
  return [
    prefs,
    (next) =>
      setPrefs((cur) => {
        const merged = { ...cur, ...next };
        try {
          localStorage.setItem("zapa-ai-prefs", JSON.stringify(merged));
        } catch {
          // ignore
        }
        return merged;
      }),
  ];
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
const clock = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const renewsIn = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

function ZapaAi() {
  const { data, error, loading, reload } = useLoad(() => unwrap(aiStatus()), []);
  const [tab, setTab] = useState<Tab>("chat");
  const [prefs, setPrefs] = usePrefs();
  const [credits, setCredits] = useState<Credits | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [files, setFiles] = useState<AiFile[]>([]);
  const [active, setActive] = useState<{ id: number; name: string } | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!data) return;
    setCredits(data.credits);
    if (seeded) return;
    setSeeded(true);
    setMessages(data.messages);
    setFiles(data.files);
  }, [data, seeded]);
  const plan: Plan | null = data?.plan ?? null;

  const tabs: { id: Tab; label: string; icon: typeof MessageCircle }[] = [
    { id: "chat", label: "Chat", icon: MessageCircle },
    { id: "files", label: "My Files", icon: FolderOpen },
    { id: "voice", label: "Voice", icon: AudioLines },
    { id: "plus", label: "Plus", icon: Crown },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <section className="hero-glow relative overflow-hidden rounded-card text-on-navy">
        <div className="grid grid-cols-[8.5rem_1fr] items-center gap-2 p-4 sm:grid-cols-[11rem_1fr]">
          <ZapaRobot className="drift h-auto w-full" />
          <div>
            <h1 className="font-display text-4xl leading-none sm:text-5xl">Zapa AI</h1>
            {plan && plan.price > 0 ? <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-sand px-3 py-0.5 text-xs font-extrabold text-navy"><Crown className="size-3.5" />{plan.name}</p> : null}
            <p className="mt-1 text-lg font-semibold leading-snug text-balance text-on-navy/95">Your Smart Study Assistant at MUBAS!</p>
            <ul className="mt-3 grid gap-1 text-sm font-semibold">
              {["Ask Questions", "Upload PDFs", "Get Audio Response", "Learn Smarter"].map((item) => (
                <li key={item} className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-good text-white"><Check className="size-3.5" /></span>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full px-5 text-base font-bold transition ${tab === id ? "bg-denim text-on-denim shadow-md" : "bg-sand-soft text-ink hover:bg-denim-soft"}`}>
            <Icon className="size-5" />{label}
          </button>
        ))}
      </div>

      {credits ? <CreditsBar credits={credits} /> : null}

      <div className="mt-3">
        {loading && !data ? <Skeleton rows={3} /> : error ? <LoadError message={error} onRetry={reload} /> : data ? (
          tab === "chat" ? (
            <Chat plan={plan} onUpgrade={() => setTab("plus")} draft={draft} clearDraft={() => setDraft("")} enabled={data.enabled} messages={messages} setMessages={setMessages} credits={credits} setCredits={setCredits} active={active} setActive={setActive} files={files} setFiles={setFiles} prefs={prefs} />
          ) : tab === "files" ? (
            <Files files={files} setFiles={setFiles} onAsk={(f) => { setActive({ id: f.id, name: f.name }); setTab("chat"); }} />
          ) : tab === "plus" ? (
            <PlusTab plan={plan} onChanged={reload} />
          ) : tab === "voice" ? (
            <Voice prefs={prefs} setPrefs={setPrefs} onSend={(heard) => { setDraft(heard); setTab("chat"); }} />
          ) : (
            <SettingsPanel plan={plan} prefs={prefs} setPrefs={setPrefs} credits={credits} onCleared={() => setMessages([])} />
          )
        ) : null}
      </div>
    </div>
  );
}

function CreditsBar({ credits }: { credits: Credits }) {
  const pct = Math.round((credits.left / credits.limit) * 100);
  return (
    <div className="panel mt-3 p-3" aria-label="Daily credits">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{credits.left} of {credits.limit} credits left today</span>
        <span className="text-xs text-muted">Renews at midnight, in {renewsIn(credits.renewsInMinutes)}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full transition-all ${pct > 25 ? "bg-denim" : "bg-danger"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// ------------------------------------------------------------------ chat ----

type ChatProps = {
  plan: Plan | null;
  onUpgrade: () => void;
  draft: string;
  clearDraft: () => void;
  enabled: boolean;
  messages: AiMessage[];
  setMessages: (fn: (cur: AiMessage[]) => AiMessage[]) => void;
  credits: Credits | null;
  setCredits: (c: Credits) => void;
  active: { id: number; name: string } | null;
  setActive: (f: { id: number; name: string } | null) => void;
  files: AiFile[];
  setFiles: (fn: (cur: AiFile[]) => AiFile[]) => void;
  prefs: Prefs;
};

function Chat({ plan, onUpgrade, draft, clearDraft, enabled, messages, setMessages, credits, setCredits, active, setActive, setFiles, prefs }: ChatProps) {
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<{ name: string; size: number; data: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");
  const [photo, setPhoto] = useState<{ name: string; data: string; preview: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const has = (f: Feature) => Boolean(plan?.features.includes(f));
  const maxPdf = plan?.maxPdfMb ?? 8;

  function chooseMode(next: Mode, feature?: Feature) {
    if (feature && !has(feature)) {
      toast.message("That mode is part of Zapa AI Plus.");
      return onUpgrade();
    }
    setMode(next);
  }

  async function attachPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const url = await shrinkImage(file, 1600, 900_000);
      setPhoto({ name: file.name, data: url.split(",")[1] ?? "", preview: url });
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!draft) return;
    setText(draft);
    clearDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  async function attach(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return void toast.error("Please choose a PDF file.");
    if (file.size > maxPdf * 1048576) return void toast.error(`That PDF is ${mb(file.size)}. Your plan allows up to ${maxPdf} MB.${plan && plan.price === 0 ? " Upgrade to Plus for bigger files." : ""}`);
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsDataURL(file);
    }).catch((reason) => {
      toast.error(failureMessage(reason));
      return "";
    });
    if (data) setAttached({ name: file.name, size: file.size, data });
  }

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
    const cost = attached || photo ? AI_COSTS.pdf : AI_COSTS.message;
    if (credits && credits.left < cost) return void toast.error("You do not have enough credits left today. They renew at midnight.");
    setBusy(true);
    const mine: AiMessage = { id: -Date.now(), role: "user", body: message, fileName: attached?.name ?? active?.name ?? null, createdAt: new Date().toISOString() };
    setMessages((cur) => [...cur, mine]);
    const pdf = attached;
    const pic = photo;
    setText("");
    setAttached(null);
    setPhoto(null);
    try {
      const result = await unwrap(aiChat({ data: { message, mode, ...(pic ? { image: { data: pic.data } } : {}), ...(pdf ? { pdf } : active ? { fileId: active.id } : {}) } }));
      setMessages((cur) => [...cur, { id: -Date.now() - 1, role: "model", body: result.reply, fileName: null, createdAt: new Date().toISOString() }]);
      setCredits(result.credits);
      if (pdf && result.fileId) {
        setActive({ id: result.fileId, name: pdf.name });
        setFiles((cur) => [{ id: result.fileId!, name: pdf.name, size: pdf.size, createdAt: new Date().toISOString() }, ...cur]);
      }
      if (prefs.autoRead) speakOnDevice(result.reply, { rate: prefs.rate, lang: prefs.lang });
    } catch (reason) {
      setMessages((cur) => cur.filter((m) => m.id !== mine.id));
      setText(message);
      setAttached(pdf);
      setPhoto(pic);
      toast.error(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const lastIsAi = messages.length > 0 && messages[messages.length - 1].role === "model";

  return (
    <div className="grid gap-3">
      {!enabled ? <p className="panel p-4 text-sm text-pretty">Zapa AI is not switched on yet. A steward needs to add a Gemini key first.</p> : null}
      <div className="panel grid gap-3 p-3 sm:p-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="grid gap-3 py-4 text-center">
            <p className="font-display text-2xl">Hi! I can help you study.</p>
            <p className="text-sm text-pretty text-muted">Ask a question, or attach a PDF and ask me to summarise it. Try one of these:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => void send(s)} disabled={!enabled || busy} className="min-h-11 rounded-full bg-denim-soft px-4 text-sm font-semibold text-pretty">{s}</button>)}
            </div>
          </div>
        ) : messages.map((m, index) => <Bubble key={m.id} m={m} prefs={prefs} onCredits={setCredits} voiceCost={plan?.voiceCost ?? AI_COSTS.hdVoice} last={index === messages.length - 1} />)}
        {busy ? <div className="flex items-center gap-2 text-sm text-muted" role="status"><ZapaRobot className="size-9" /><span className="animate-pulse">Zapa AI is thinking…</span></div> : null}
        <div ref={bottom} />
      </div>

      {lastIsAi && !busy ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-denim-soft px-4 font-bold text-denim-deep" onClick={() => void send("Explain that in more detail, step by step.")}><Lightbulb className="size-5" />Explain More</button>
          <button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-denim-soft px-4 font-bold text-denim-deep" onClick={() => void send("Give me examples that fit life in Malawi.")}><BookOpen className="size-5" />Give Examples</button>
          <button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-good-soft px-4 font-bold text-good" onClick={() => void send("Give me 5 practice questions on this, then wait for my answers.")}><GraduationCap className="size-5" />Practice Questions</button>
        </div>
      ) : null}

      <div className="-mx-3 flex gap-2 overflow-x-auto px-3" role="radiogroup" aria-label="Study mode">
        {([["chat", "Chat", undefined], ["quiz", "Quiz me", "quiz"], ["study-plan", "Study plan", "study-plan"], ["essay", "Essay feedback", "essay"], ["exam", "Exam mode", "exam"]] as [Mode, string, Feature | undefined][]).map(([id, label, feature]) => (
          <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => chooseMode(id, feature)} className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold ${mode === id ? "bg-navy text-on-navy" : "border border-line bg-card"}`}>
            {feature && !has(feature) ? <Lock className="size-3.5" /> : null}{label}
          </button>
        ))}
      </div>

      <div className="sticky bottom-24 z-10 grid gap-2 md:bottom-4">
        {photo ? (
          <div className="panel flex items-center gap-3 p-3"><img src={photo.preview} alt="Attached photo" className="size-14 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{photo.name}</p><p className="flex items-center gap-1 text-xs font-semibold text-good"><Check className="size-3.5" />Photo ready</p></div><button type="button" aria-label="Remove photo" onClick={() => setPhoto(null)} className="grid size-11 place-items-center"><X className="size-5" /></button></div>
        ) : null}
        {attached ? (
          <div className="panel flex items-center gap-3 p-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-danger text-sm font-bold text-white">PDF</span>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{attached.name}</p><p className="text-xs text-muted">{mb(attached.size)}</p><p className="flex items-center gap-1 text-xs font-semibold text-good"><Check className="size-3.5" />File uploaded successfully!</p></div>
            <button type="button" aria-label="Remove file" onClick={() => setAttached(null)} className="grid size-11 place-items-center"><X className="size-5" /></button>
          </div>
        ) : active ? (
          <div className="panel flex items-center gap-2 px-3 py-2 text-sm"><FileText className="size-4 text-denim-deep" /><span className="min-w-0 flex-1 truncate">Chatting about <strong>{active.name}</strong></span><button type="button" aria-label="Stop using this file" onClick={() => setActive(null)} className="grid size-9 place-items-center"><X className="size-4" /></button></div>
        ) : null}
        <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="panel flex items-center gap-2 rounded-full p-2 pl-3">
          <input ref={picker} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={camera} type="file" accept="image/*" className="sr-only" onChange={(e) => { void attachPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" aria-label="Attach a PDF" onClick={() => picker.current?.click()} disabled={busy} className="grid size-11 shrink-0 place-items-center rounded-full text-denim-deep"><Paperclip className="size-6" /></button>
          <button type="button" aria-label={has("photo") ? "Attach a photo of notes" : "Photo questions need Plus"} onClick={() => (has("photo") ? camera.current?.click() : (toast.message("Photo questions are part of Zapa AI Plus Pro."), onUpgrade()))} disabled={busy} className="relative grid size-11 shrink-0 place-items-center rounded-full text-denim-deep"><Camera className="size-6" />{!has("photo") ? <Lock className="absolute right-1 top-1 size-3.5" /> : null}</button>
          <input className={`${input} border-0 bg-transparent shadow-none`} value={text} onChange={(e) => setText(e.target.value)} placeholder={attached ? "What should I do with this PDF?" : photo ? "What should I do with this photo?" : mode === "quiz" ? "Which topic should I quiz you on?" : mode === "essay" ? "Paste your essay here…" : "Ask anything…"} aria-label="Ask Zapa AI" maxLength={2000} disabled={!enabled} />
          <button type="submit" aria-label="Send" disabled={busy || !text.trim() || !enabled} className="grid size-12 shrink-0 place-items-center rounded-full bg-denim text-on-denim disabled:opacity-50"><Send className="size-5" /></button>
        </form>
      </div>
    </div>
  );
}

function Bubble({ m, prefs, onCredits, voiceCost, last }: { m: AiMessage; prefs: Prefs; onCredits: (c: Credits) => void; voiceCost: number; last: boolean }) {
  if (m.role === "user") {
    return (
      <div className="grid justify-items-end gap-2">
        <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-denim-soft px-4 py-3">
          <p className="whitespace-pre-wrap text-pretty">{m.body}</p>
          <p className="mt-1 flex items-center justify-end gap-1 text-xs text-muted">{clock(m.createdAt)}<CheckCheck className="size-3.5 text-denim" /></p>
        </div>
        {m.fileName ? <p className="flex max-w-[88%] items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm"><span className="grid size-8 place-items-center rounded-lg bg-danger text-[10px] font-bold text-white">PDF</span><span className="truncate font-semibold">{m.fileName}</span></p> : null}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <ZapaRobot className="size-10 shrink-0" />
      <div className="min-w-0 max-w-[92%] rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3 shadow-sm">
        <AiMarkdown text={m.body} />
        <Listen text={m.body} prefs={prefs} onCredits={onCredits} voiceCost={voiceCost} autoFocus={last} />
        <p className="mt-1 text-right text-xs text-muted">{clock(m.createdAt) || ago(m.createdAt)}</p>
      </div>
    </div>
  );
}

function Listen({ text, prefs, onCredits, voiceCost }: { text: string; prefs: Prefs; onCredits: (c: Credits) => void; voiceCost: number; autoFocus?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  function device() {
    if (speaking) {
      stopDeviceSpeech();
      setSpeaking(false);
      return;
    }
    if (speakOnDevice(text, { rate: prefs.rate, lang: prefs.lang, onEnd: () => setSpeaking(false) })) setSpeaking(true);
    else toast.error("This device cannot read text aloud. Try HD voice.");
  }

  async function hd() {
    setBusy(true);
    try {
      const r = await unwrap(aiSpeak({ data: { text } }));
      setUrl(pcmToWavUrl(r.pcm, r.sampleRate));
      onCredits(r.credits);
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-2 border-t border-line pt-3">
      {url ? (
        <div className="flex items-center gap-2 rounded-full border border-line bg-sand-soft p-1.5">
          <audio controls src={url} className="h-10 min-w-0 flex-1" aria-label="Zapa AI voice" />
          <a href={url} download="zapa-ai-answer.wav" aria-label="Download audio" className="grid size-10 shrink-0 place-items-center rounded-full"><Download className="size-5" /></a>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {supported ? (
            <button type="button" onClick={device} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-denim px-4 text-sm font-bold text-on-denim">{speaking ? <Pause className="size-4" /> : <Volume2 className="size-4" />}{speaking ? "Stop" : "Listen"}</button>
          ) : null}
          <button type="button" onClick={() => void hd()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-bold disabled:opacity-60"><AudioLines className="size-4" />{busy ? "Making audio…" : voiceCost === 0 ? "HD voice · free" : `HD voice · ${voiceCost} credit${voiceCost === 1 ? "" : "s"}`}</button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- files ----

function Files({ files, setFiles, onAsk }: { files: AiFile[]; setFiles: (fn: (cur: AiFile[]) => AiFile[]) => void; onAsk: (f: AiFile) => void }) {
  async function remove(f: AiFile) {
    try {
      await unwrap(aiManage({ data: { action: "delete-file", id: f.id } }));
      setFiles((cur) => cur.filter((x) => x.id !== f.id));
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }
  return (
    <div className="grid gap-3">
      <p className="panel p-3 text-sm text-pretty text-muted">When you attach a PDF in Chat, Zapa AI reads it and keeps a short text summary so you can keep asking about it later. The PDF itself is not stored.</p>
      {files.length === 0 ? <p className="panel p-6 text-center text-muted">No files yet. Attach a PDF in Chat to see it here.</p> : files.map((f) => (
        <div key={f.id} className="panel flex items-center gap-3 p-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-danger text-sm font-bold text-white">PDF</span>
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{f.name}</p><p className="text-xs text-muted">{mb(f.size)} · {ago(f.createdAt)}</p></div>
          <button type="button" onClick={() => onAsk(f)} className="min-h-11 rounded-full bg-denim px-4 text-sm font-bold text-on-denim">Ask</button>
          <button type="button" aria-label={`Delete ${f.name}`} onClick={() => void remove(f)} className="grid size-11 place-items-center"><Trash2 className="size-5" /></button>
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------- voice ----

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

function Voice({ prefs, setPrefs, onSend }: { prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; onSend: (heard: string) => void }) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const rec = useRef<Recognition | null>(null);
  const supported = useMemo(() => typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window), []);

  function toggle() {
    if (listening) return void rec.current?.stop();
    const Ctor = ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => Recognition) | undefined;
    if (!Ctor) return void toast.error("Voice input is not supported in this browser. Try Chrome.");
    const r = new Ctor();
    r.lang = prefs.lang;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (event) => setHeard([...Array.from(event.results)].map((x) => x[0]?.transcript ?? "").join(" "));
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); toast.error("Could not hear you. Check the microphone permission."); };
    rec.current = r;
    setHeard("");
    setListening(true);
    r.start();
  }

  return (
    <div className="panel grid gap-4 p-4 text-center">
      <p className="text-pretty text-muted">Tap the microphone and ask your question out loud. Then send it to Zapa AI and listen to the answer.</p>
      <button type="button" onClick={toggle} disabled={!supported} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Start listening"} className={`mx-auto grid size-24 place-items-center rounded-full text-white shadow-xl ${listening ? "animate-pulse bg-danger" : "bg-denim"} disabled:opacity-50`}><Mic className="size-10" /></button>
      {!supported ? <p className="text-sm text-danger">Voice input needs Chrome on Android or desktop.</p> : <p className="text-sm font-semibold">{listening ? "Listening…" : "Tap to speak"}</p>}
      {heard ? (
        <div className="rounded-xl bg-sand-soft p-3 text-left">
          <p className="text-sm text-muted">You said</p>
          <p className="text-pretty font-semibold">{heard}</p>
          <button type="button" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-denim px-4 text-sm font-bold text-on-denim" onClick={() => onSend(heard)}><Send className="size-4" />Send to Zapa AI</button>
        </div>
      ) : null}
      <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line p-3 text-left"><span><span className="block font-semibold">Read answers aloud</span><span className="text-xs text-muted">Uses your device voice. Free.</span></span><input type="checkbox" role="switch" className="size-6 accent-[var(--color-denim)]" checked={prefs.autoRead} onChange={(e) => setPrefs({ autoRead: e.target.checked })} /></label>
    </div>
  );
}

// -------------------------------------------------------------- settings ----

function SettingsPanel({ plan, prefs, setPrefs, credits, onCleared }: { plan: Plan | null; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; credits: Credits | null; onCleared: () => void }) {
  async function clear() {
    if (!window.confirm("Delete your whole conversation with Zapa AI?")) return;
    try {
      await unwrap(aiManage({ data: { action: "clear-chat" } }));
      onCleared();
      toast.success("Conversation cleared");
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }
  return (
    <div className="grid gap-3">
      <section className="panel grid gap-3 p-4">
        <h2 className="font-display text-xl">Voice</h2>
        <label className="grid gap-1.5 text-sm font-semibold">Listen button uses
          <select className={input} value={prefs.voice} onChange={(e) => setPrefs({ voice: e.target.value as Prefs["voice"] })}>
            <option value="device">Device voice (free)</option>
            <option value="hd">HD voice ({plan?.voiceCost === 0 ? "free on your plan" : `uses ${plan?.voiceCost ?? AI_COSTS.hdVoice} credits`})</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">Language
          <select className={input} value={prefs.lang} onChange={(e) => setPrefs({ lang: e.target.value })}>
            <option value="en-GB">English (UK)</option><option value="en-US">English (US)</option><option value="en-ZA">English (South Africa)</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">Speed: {prefs.rate.toFixed(1)}x
          <input type="range" min={0.7} max={1.5} step={0.1} value={prefs.rate} onChange={(e) => setPrefs({ rate: Number(e.target.value) })} className="accent-[var(--color-denim)]" />
        </label>
      </section>
      <section className="panel p-4 text-sm text-pretty">
        <h2 className="font-display text-xl">Credits</h2>
        <p className="mt-1 text-muted">Your plan includes {credits?.limit ?? 20} credits a day. They renew at midnight (Malawi time).</p>
        <ul className="mt-2 grid gap-1"><li>A question costs <strong>{AI_COSTS.message}</strong> credit.</li><li>A question with a PDF costs <strong>{AI_COSTS.pdf}</strong> credits.</li><li>HD voice costs <strong>{plan?.voiceCost ?? AI_COSTS.hdVoice}</strong> credits on your plan. Device voice is free.</li></ul>
      </section>
      <section className="panel p-4">
        <h2 className="font-display text-xl">Privacy</h2>
        <p className="mt-1 text-sm text-pretty text-muted">Your questions and attached PDFs are sent to Google&apos;s Gemini service to produce answers. Do not share passwords or private information. Zapa keeps your last conversation so you can continue it.</p>
        <button type="button" onClick={() => void clear()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-bold"><Trash2 className="size-4" />Clear my conversation</button>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ plus ----

function PlusTab({ plan, onChanged }: { plan: Plan | null; onChanged: () => void }) {
  const config = useLoad(() => unwrap(payConfig()), []);
  const history = useLoad(() => unwrap(myPayments()), []);
  const [choosing, setChoosing] = useState<number | null>(null);

  if (config.loading && !config.data) return <Skeleton rows={3} />;
  if (config.error || !config.data) return <LoadError message={config.error ?? "Could not load the plans."} onRetry={config.reload} />;
  const labels = config.data.featureLabels;
  const planDays = config.data.planDays;

  return (
    <div className="grid gap-3">
      <section className="panel p-4">
        <p className="flex items-center gap-2 font-display text-2xl"><Crown className="size-6 text-denim-deep" />Zapa AI Plus</p>
        <p className="mt-1 text-sm text-pretty text-muted">Pay once and get a stronger model, more daily credits and extra study tools for {planDays} days. You are on <strong className="text-ink">{plan?.name ?? "Free"}</strong>{plan?.expiresAt ? `, active until ${new Date(plan.expiresAt).toLocaleDateString()}` : ""}.</p>
      </section>
      {config.data.tiers.map((t) => (
        <section key={t.price} className={`panel p-4 ${plan?.price === t.price ? "ring-2 ring-denim" : ""}`}>
          <div className="flex items-baseline justify-between gap-2"><h2 className="font-display text-2xl">{t.name}</h2><p className="font-display text-2xl text-denim-deep">K{t.price}</p></div>
          <p className="text-sm text-pretty text-muted">{t.blurb}</p>
          <ul className="mt-2 grid gap-1 text-sm">
            <li className="flex items-center gap-2"><Check className="size-4 text-good" /><strong>{t.credits}</strong> credits every day</li>
            <li className="flex items-center gap-2"><Check className="size-4 text-good" />PDFs up to {t.maxPdfMb} MB, longer answers</li>
            <li className="flex items-center gap-2"><Check className="size-4 text-good" />{t.voiceCost === 0 ? "HD voice is free" : `HD voice for ${t.voiceCost} credit${t.voiceCost === 1 ? "" : "s"}`}</li>
            {t.features.map((f) => <li key={f} className="flex items-center gap-2"><Check className="size-4 text-good" />{labels[f]}</li>)}
          </ul>
          <button type="button" onClick={() => setChoosing(choosing === t.price ? null : t.price)} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-denim px-5 font-bold text-on-denim">{choosing === t.price ? "Hide payment" : plan?.price === t.price ? `Extend for K${t.price}` : `Get ${t.name} for K${t.price}`}</button>
          {choosing === t.price ? <div className="mt-3"><PaymentBox purpose="plan" tier={t.price} amount={t.price} onDone={() => { onChanged(); history.reload(); }} /></div> : null}
        </section>
      ))}
      {history.data && history.data.payments.length ? (
        <section className="panel p-4">
          <h2 className="font-display text-xl">My payments</h2>
          <ul className="mt-2 grid gap-2 text-sm">
            {history.data.payments.map((p) => <li key={p.id} className="flex items-start justify-between gap-3"><span>K{p.amount} · {p.purpose === "ad" ? "Zapa Ads" : "Zapa AI Plus"}<span className="block text-xs text-muted">{p.reason}</span></span><span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${p.status === "approved" ? "bg-good-soft text-good" : p.status === "pending_review" ? "bg-sand text-navy" : "bg-danger-soft text-danger"}`}>{p.status === "approved" ? "Confirmed" : p.status === "pending_review" ? "Being checked" : p.status === "revoked" ? "Cancelled" : "Rejected"}</span></li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
