import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Plus, Send, Trash2, Users } from "lucide-react";
import { createGroup, deleteMessage, getDiscover, getThread, listConversations, sendMessage } from "@/lib/campus/server";
import type { ChatMessage, ConversationCard } from "@/lib/campus/types";
import { ago } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { useCampus } from "@/components/campus-state";
import { Avatar, LoadError, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { btn, btnGhost, ErrorNote, Field, input } from "@/components/ui";

export const Route = createFileRoute("/campus/messages")({
  validateSearch: (search: Record<string, unknown>) => {
    const raw = search.thread;
    const id = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : undefined;
    return { thread: id };
  },
  head: () => ({ meta: [{ title: "Messages — Zapa MUBAS" }] }),
  component: Messages,
});

function Messages() {
  const { thread } = Route.useSearch();
  const navigate = useNavigate();
  const { refresh } = useCampus();
  const list = useLoad(() => unwrap(listConversations()), []);
  const [creating, setCreating] = useState(false);
  const open = (id: number | undefined) => void navigate({ to: "/campus/messages", search: { thread: id } });

  return (
    <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-[19rem_minmax(0,1fr)]">
      <section className={`${thread ? "hidden md:block" : ""}`}>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="font-display text-3xl">Messages</h1>
          <button type="button" className={btnGhost} onClick={() => setCreating((v) => !v)}><Plus className="size-4" />Group</button>
        </div>
        {creating ? <NewGroup onDone={(id) => { setCreating(false); list.reload(); open(id); }} /> : null}
        {list.loading && !list.data ? (
          <Skeleton rows={4} />
        ) : list.error ? (
          <LoadError message={list.error} onRetry={list.reload} />
        ) : list.data && list.data.conversations.length ? (
          <ul className="grid gap-2">
            {list.data.conversations.map((c: ConversationCard) => (
              <li key={c.id}>
                <button type="button" onClick={() => open(c.id)} className={`panel flex w-full items-center gap-3 p-3 text-left ${thread === c.id ? "border-denim" : ""}`}>
                  {c.kind === "group" ? <span className="grid size-11 shrink-0 place-items-center rounded-full bg-denim-soft text-denim-deep"><Users className="size-5" /></span> : <Avatar name={c.title} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2"><span className="truncate font-semibold">{c.title}</span><span className="shrink-0 text-xs text-muted">{c.lastAt ? ago(c.lastAt) : ""}</span></span>
                    <span className="block truncate text-sm text-muted">{c.lastBody || c.others}</span>
                  </span>
                  {c.unread > 0 ? <span className="rounded-full bg-denim px-2 text-xs font-bold text-on-denim">{c.unread}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel p-4 text-sm text-muted">No chats yet. Open a classmate’s profile and tap Message.</p>
        )}
      </section>
      <section className={thread ? "" : "hidden md:block"}>
        {thread ? (
          <Thread key={thread} id={thread} onBack={() => open(undefined)} onRead={() => { list.reload(); refresh(); }} />
        ) : (
          <div className="panel hidden h-64 place-items-center p-6 text-center text-muted md:grid">Pick a chat to start talking.</div>
        )}
      </section>
    </div>
  );
}

function NewGroup({ onDone }: { onDone: (id: number) => void }) {
  const friends = useLoad(() => unwrap(getDiscover({ data: {} })), []);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pool = (friends.data?.people ?? []).filter((p) => p.relation === "friends");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await unwrap(createGroup({ data: { title, memberIds: picked } }));
      onDone(result.conversationId);
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="panel mb-3 grid gap-3 p-3">
      <Field label="Group name"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required /></Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Add friends</legend>
        {pool.length === 0 ? <p className="text-sm text-muted">Add some friends first, then you can group them here.</p> : (
          <div className="grid max-h-48 gap-1 overflow-y-auto">
            {pool.map((p) => (
              <label key={p.userId} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm hover:bg-sand-soft">
                <input type="checkbox" className="size-4" checked={picked.includes(p.userId)} onChange={(e) => setPicked((cur) => e.target.checked ? [...cur, p.userId] : cur.filter((x) => x !== p.userId))} />
                {p.fullName}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <ErrorNote>{error}</ErrorNote>
      <button className={btn} disabled={pending || !title.trim()}>{pending ? "Creating…" : "Create group"}</button>
    </form>
  );
}

function Thread({ id, onBack, onRead }: { id: number; onBack: () => void; onRead: () => void }) {
  const [title, setTitle] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const seen = useRef(0);
  const lastSig = useRef("");
  const draft = useRef("");
  draft.current = body;

  const load = useCallback(async () => {
    try {
      const result = await unwrap(getThread({ data: { conversationId: id } }));
      setTitle(result.conversation.title);
      setError(null);
      // Only touch the screen when something actually changed.
      const tail = result.messages[result.messages.length - 1];
      const sig = `${result.messages.length}:${tail?.id ?? 0}:${tail?.removed ? 1 : 0}`;
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        setMessages(result.messages);
        onRead();
      }
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      // Never refresh while the person is typing a reply.
      if (document.visibilityState === "visible" && !draft.current.trim()) void load();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (messages.length !== seen.current) {
      seen.current = messages.length;
      bottom.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await unwrap(sendMessage({ data: { conversationId: id, body, ...(replyTo ? { replyTo: replyTo.id } : {}) } }));
      setBody("");
      setReplyTo(null);
      await load();
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setSending(false);
    }
  }

  async function remove(messageId: number) {
    try {
      await unwrap(deleteMessage({ data: { messageId } }));
      await load();
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  return (
    <div className="panel flex h-[calc(100vh-11rem)] min-h-96 flex-col overflow-hidden md:h-[calc(100vh-9rem)]">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button type="button" aria-label="Back" onClick={onBack} className="grid size-11 place-items-center md:hidden"><ArrowLeft className="size-5" /></button>
        <Avatar name={title || "?"} size="size-10" />
        <h2 className="truncate font-semibold">{title || "Chat"}</h2>
      </header>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? <Skeleton rows={3} /> : error ? <LoadError message={error} onRetry={() => void load()} /> : messages.length === 0 ? <p className="py-10 text-center text-sm text-muted">Say hello 👋</p> : (
          <ul className="grid gap-2">
            {messages.map((m) => (
              <li key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                <div className={`group max-w-[82%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "bg-navy text-on-navy" : "bg-sand-soft text-ink"}`}>
                  {!m.mine ? <p className="mb-0.5 text-xs font-semibold text-denim-deep">{m.author}</p> : null}
                  {m.replyTo ? <p className="mb-1 rounded-lg bg-black/10 px-2 py-0.5 text-xs opacity-80">Reply to #{m.replyTo}</p> : null}
                  <p className={`whitespace-pre-wrap break-words ${m.removed ? "italic opacity-70" : ""}`}>{m.removed ? "Message removed" : m.body}</p>
                  <p className="mt-1 flex items-center justify-end gap-2 text-[11px] opacity-70">
                    {ago(m.createdAt)}
                    {!m.removed ? <button type="button" onClick={() => setReplyTo(m)} className="underline">Reply</button> : null}
                    {m.mine && !m.removed ? <button type="button" aria-label="Delete message" onClick={() => void remove(m.id)}><Trash2 className="size-3.5" /></button> : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => void send(e)} className="border-t border-line p-2">
        {replyTo ? <p className="mb-1 flex items-center justify-between rounded-lg bg-denim-soft px-2 py-1 text-xs">Replying to {replyTo.author}<button type="button" onClick={() => setReplyTo(null)} className="font-semibold">Cancel</button></p> : null}
        <div className="flex gap-2">
          <input className={input} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message" aria-label="Message" maxLength={4000} />
          <button className={btn} disabled={sending || !body.trim()} aria-label="Send"><Send className="size-4" /></button>
        </div>
      </form>
    </div>
  );
}
