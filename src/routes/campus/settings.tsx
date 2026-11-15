import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, LogOut, Trash2 } from "lucide-react";
import { exportMine, leaveCampus, openPreviewSteward, updateProfile } from "@/lib/campus/server";
import { failureMessage } from "@/lib/campus/email-auth";
import { signOut } from "@/lib/auth/client";
import { useCampus } from "@/components/campus-state";
import { Card, profileToUpdate, unwrap } from "@/components/page-kit";
import { btn, btnGhost, Field, input, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/settings")({
  head: () => ({ meta: [{ title: "Settings — Zapa MUBAS" }] }),
  component: Settings,
});

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-4">
      <span><span className="block font-semibold">{label}</span><span className="block text-sm text-pretty text-muted">{hint}</span></span>
      <input type="checkbox" role="switch" className="size-6 shrink-0 accent-[var(--color-denim)]" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Settings() {
  const { profile, refresh, dataSaver, setDataSaver, canPreviewSteward } = useCampus();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  async function patch(change: Record<string, unknown>) {
    if (!profile) return;
    try {
      await unwrap(updateProfile({ data: profileToUpdate(profile, change) }));
      refresh();
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  async function download() {
    setBusy(true);
    try {
      const result = await unwrap(exportMine());
      const blob = new Blob([JSON.stringify(result.export, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "zapa-mubas-my-data.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await unwrap(leaveCampus({ data: { confirm: "LEAVE" } }));
      await signOut();
    } catch (reason) {
      toast.error(failureMessage(reason));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <PageTitle title="Settings" />
      <Card title="Notifications">
        <div className="divide-y divide-line">
          <Toggle label="Messages" hint="New messages and group invitations." on={profile.notifyMessages} onChange={(v) => void patch({ notifyMessages: v })} />
          <Toggle label="Social" hint="Friend requests, likes, comments and replies." on={profile.notifySocial} onChange={(v) => void patch({ notifySocial: v })} />
          <Toggle label="Campus" hint="Announcements, new videos and library items." on={profile.notifyCampus} onChange={(v) => void patch({ notifyCampus: v })} />
        </div>
      </Card>
      <Card title="Data saver">
        <Toggle label="Save mobile data" hint="Skips video thumbnails and previews until you tap them." on={dataSaver} onChange={setDataSaver} />
      </Card>
      <Card title="Your data">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} disabled={busy} onClick={() => void download()}><Download className="size-4" />Download my data</button>
          <Link to="/guide" className={btnGhost}>Community guidelines</Link>
          <button type="button" className={btnGhost} onClick={() => void signOut()}><LogOut className="size-4" />Sign out</button>
        </div>
      </Card>
      {canPreviewSteward && profile.role !== "admin" ? (
        <Card title="Preview only">
          <p className="mb-3 text-sm text-muted">Open the steward tools in this preview.</p>
          <button type="button" className={btn} onClick={() => void unwrap(openPreviewSteward()).then(refresh)}>Become a steward</button>
        </Card>
      ) : null}
      <Card title="Leave Zapa">
        <p className="text-sm text-pretty text-muted">This deletes your profile, posts and messages. You can open a new profile later. Type LEAVE to confirm.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Field label="Confirmation"><input className={`${input} max-w-40`} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="LEAVE" /></Field>
          <button type="button" className="mt-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-danger px-4 text-sm font-semibold text-on-navy disabled:opacity-50" disabled={busy || confirm !== "LEAVE"} onClick={() => void leave()}><Trash2 className="size-4" />Delete my account</button>
        </div>
      </Card>
    </div>
  );
}
