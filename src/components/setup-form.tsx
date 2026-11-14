import { useEffect, useState, type FormEvent } from "react";
import { listDirectory, saveProfile } from "@/lib/campus/server";
import type { Directory } from "@/lib/campus/types";
import { AcademicFields, emptyDraft, type Draft } from "@/components/academic-fields";
import { btn, ErrorNote } from "@/components/ui";
import { useCampus } from "@/components/campus-state";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { failureMessage } from "@/lib/campus/email-auth";

export function SetupForm() {
  const user = useCurrentUser();
  const { refresh, profile } = useCampus();
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    listDirectory()
      .then((result) => {
        if (live) setDirectory(result);
      })
      .catch((reason) => {
        if (live) setError(failureMessage(reason));
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!user && !profile) return;
    setDraft((current) => ({
      ...current,
      fullName: current.fullName || profile?.fullName || user?.displayName || "",
      campusEmail: current.campusEmail || profile?.campusEmail || "",
    }));
  }, [user, profile]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await saveProfile({ data: draft });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      refresh();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="panel mx-auto max-w-xl p-4 md:p-6">
      <p className="text-xs font-semibold tracking-wide text-denim-deep">Campus profile</p>
      <h1 className="mt-1 font-display text-3xl text-balance text-ink">Tell Zapa who you are on campus.</h1>
      <p className="mt-2 text-sm text-pretty text-muted">
        Classmates are suggested from your programme and year. Your email is never shown on your public profile.
        {profile?.accountStatus === "withdrawn" ? " You can open a new profile. Earlier posts stay deleted." : ""}
      </p>
      <div className="mt-5">
        {directory ? (
          <AcademicFields directory={directory} value={draft} onChange={setDraft} />
        ) : (
          <div className="h-40 animate-pulse rounded-xl bg-line" />
        )}
      </div>
      <div className="mt-4 grid gap-3">
        <ErrorNote>{error}</ErrorNote>
        <button className={btn} type="submit" disabled={pending || !directory}>
          {pending ? "Saving…" : "Enter the campus"}
        </button>
      </div>
    </form>
  );
}
