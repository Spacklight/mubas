import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { listNotifications, markNotificationsRead } from "@/lib/campus/server";
import { ago } from "@/lib/campus/logic";
import { useCampus } from "@/components/campus-state";
import { LoadError, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { Empty, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/alerts")({
  head: () => ({ meta: [{ title: "Notifications — Zapa MUBAS" }] }),
  component: Alerts,
});

function Alerts() {
  const { refresh } = useCampus();
  const { data, error, loading, reload } = useLoad(() => unwrap(listNotifications()), []);
  useEffect(() => {
    if (!data || !data.notes.some((n) => !n.read)) return;
    void markNotificationsRead().then(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Notifications" lede="Friend requests, messages, replies and campus news." />
      {loading && !data ? <Skeleton rows={4} /> : error ? <LoadError message={error} onRetry={reload} /> : !data || data.notes.length === 0 ? (
        <Empty title="All quiet" body="When something happens, you will see it here." />
      ) : (
        <ul className="grid gap-2">
          {data.notes.map((note) => (
            <li key={note.id}>
              <a href={note.href || "/campus"} className={`panel flex gap-3 p-3 ${note.read ? "" : "border-denim bg-denim-soft"}`}>
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-card text-denim-deep"><BellRing className="size-4" /></span>
                <span className="min-w-0">
                  <span className="block font-semibold">{note.title}</span>
                  {note.body ? <span className="block text-sm text-pretty text-muted">{note.body}</span> : null}
                  <span className="text-xs text-muted">{ago(note.createdAt)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
