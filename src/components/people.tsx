import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { friendRequest, openDirect, respondFriend, toggleFollow } from "@/lib/campus/server";
import type { PersonPreview } from "@/lib/campus/types";
import { initials, RANK_LABEL, roleLabel } from "@/lib/campus/logic";
import { btn, btnGhost, btnQuiet } from "@/components/ui";

export function PersonRow({ person, onChange }: { person: PersonPreview; onChange: () => void }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const badge = roleLabel(person.role, person.roleConfirmed);

  async function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    const result = await run();
    setPending(false);
    if (!result.ok) toast.error(result.error ?? "Try again.");
    else onChange();
  }

  return (
    <article className="panel flex gap-3 p-3">
      <Link
        to="/campus/people/$userId"
        params={{ userId: person.userId }}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-sand-soft text-sm font-semibold text-navy"
      >
        {initials(person.fullName)}
      </Link>
      <div className="min-w-0 flex-1">
        <Link to="/campus/people/$userId" params={{ userId: person.userId }} className="font-semibold text-ink">
          {person.fullName}
        </Link>
        <p className="text-sm text-pretty text-muted">
          {[person.programmeName, person.schoolShort, person.academicYear].filter(Boolean).join(" · ")}
        </p>
        {badge ? <p className="text-xs text-navy dark:text-sand">{badge}</p> : null}
        <p className="text-xs text-denim-deep">{RANK_LABEL[person.rank] ?? "MUBAS"}{person.mutuals ? ` · ${person.mutuals} mutual` : ""}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {person.relation === "none" ? (
            <button type="button" className={btn} disabled={pending} onClick={() => void act(() => friendRequest({ data: { userId: person.userId } }))}>
              Add friend
            </button>
          ) : null}
          {person.relation === "outgoing" ? <span className={btnGhost}>Request sent</span> : null}
          {person.relation === "friends" ? <span className={btnGhost}>Friends</span> : null}
          <button
            type="button"
            className={btnGhost}
            disabled={pending}
            onClick={() => void act(() => toggleFollow({ data: { userId: person.userId } }))}
          >
            {person.following ? "Following" : "Follow"}
          </button>
          <button
            type="button"
            className={btnQuiet}
            onClick={() =>
              void openDirect({ data: { userId: person.userId } }).then((result) => {
                if (!result.ok) toast.error(result.error);
                else void navigate({ to: "/campus/messages", search: { thread: result.conversationId } });
              })
            }
          >
            Message
          </button>
        </div>
      </div>
    </article>
  );
}

export function RequestRow({
  id,
  userId,
  fullName,
  programmeName,
  onChange,
}: {
  id: number;
  userId: string;
  fullName: string;
  programmeName: string | null;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sand-soft px-3 py-2">
      <div>
        <Link to="/campus/people/$userId" params={{ userId }} className="font-semibold">
          {fullName}
        </Link>
        <p className="text-xs text-muted">{programmeName ?? "Wants to connect"}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={() => void respondFriend({ data: { requestId: id, accept: true } }).then(onChange)}>
          Accept
        </button>
        <button type="button" className={btnGhost} onClick={() => void respondFriend({ data: { requestId: id, accept: false } }).then(onChange)}>
          Decline
        </button>
      </div>
    </div>
  );
}
