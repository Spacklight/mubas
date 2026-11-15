import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { requestEmailConfirm, confirmEmailCode, listDirectory, updateProfile } from "@/lib/campus/server";
import type { Directory } from "@/lib/campus/types";
import { failureMessage } from "@/lib/campus/email-auth";
import { AcademicFields, type Draft } from "@/components/academic-fields";
import { useCampus } from "@/components/campus-state";
import { AvatarImg, Card, profileToUpdate, shrinkImage, unwrap } from "@/components/page-kit";
import { area, btn, btnGhost, ErrorNote, Field, input, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/me")({
  head: () => ({ meta: [{ title: "My profile — Zapa MUBAS" }] }),
  component: Me,
});

function Me() {
  const { profile, refresh } = useCampus();
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [visibility, setVisibility] = useState<"campus" | "friends">("campus");
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [cover, setCover] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);

  useEffect(() => {
    void listDirectory().then(setDirectory).catch((reason) => setError(failureMessage(reason)));
  }, []);

  useEffect(() => {
    if (!profile) return;
    setDraft({
      fullName: profile.fullName,
      campusEmail: profile.campusEmail ?? "",
      role: profile.role === "admin" ? "staff" : profile.role,
      schoolId: profile.schoolId ?? "",
      programmeId: profile.programmeId ?? "",
      studyLevel: profile.studyLevel ?? "Undergraduate",
      studyMode: profile.studyMode ?? "Full-time",
      academicYear: profile.academicYear ?? "Year 1",
      interests: profile.interests,
      departmentNote: profile.department ?? "",
    });
    setBio(profile.bio);
    setSkills(profile.skills);
    setVisibility(profile.visibility);
  }, [profile]);

  if (!profile || !draft) return null;
  const shownAvatar = avatar === undefined ? profile.avatarData : avatar;
  const shownCover = cover === undefined ? profile.coverData : cover;

  async function pick(file: File | undefined, kind: "avatar" | "cover") {
    if (!file) return;
    try {
      if (kind === "avatar") setAvatar(await shrinkImage(file, 360, 135000));
      else setCover(await shrinkImage(file, 1100, 175000));
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile || !draft) return;
    setPending(true);
    setError(null);
    try {
      await unwrap(updateProfile({
        data: profileToUpdate(profile, {
          ...draft,
          bio,
          skills,
          visibility,
          ...(typeof avatar === "string" ? { avatarData: avatar } : {}),
          ...(typeof cover === "string" ? { coverData: cover } : {}),
          ...(avatar === null ? { clearAvatar: true } : {}),
          ...(cover === null ? { clearCover: true } : {}),
        }),
      }));
      toast.success("Profile saved");
      setAvatar(undefined);
      setCover(undefined);
      refresh();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setPending(false);
    }
  }

  async function sendCode() {
    setCodeBusy(true);
    try {
      await unwrap(requestEmailConfirm());
      toast.success("Code sent. Check your MUBAS inbox.");
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setCodeBusy(false);
    }
  }

  async function confirm() {
    setCodeBusy(true);
    try {
      await unwrap(confirmEmailCode({ data: { code } }));
      toast.success("Email confirmed");
      setCode("");
      refresh();
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setCodeBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="My profile" lede="This is what classmates see. Your email stays private." />
      <form onSubmit={(event) => void save(event)} className="grid gap-4">
        <section className="panel overflow-hidden">
          <div className="h-28 bg-navy" style={shownCover ? { backgroundImage: `url(${shownCover})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{!shownCover ? <div className="hero-glow h-full" /> : null}</div>
          <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
            <span className="-mt-8 rounded-full border-4 border-card bg-card"><AvatarImg name={profile.fullName} src={shownAvatar ?? null} size="size-20" /></span>
            <div className="flex flex-wrap gap-2">
              <label className={`${btnGhost} cursor-pointer`}>Change photo<input type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0], "avatar")} /></label>
              <label className={`${btnGhost} cursor-pointer`}>Change cover<input type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0], "cover")} /></label>
              {shownAvatar ? <button type="button" className={btnGhost} onClick={() => setAvatar(null)}>Remove photo</button> : null}
            </div>
          </div>
        </section>

        <section className="panel p-4">
          {directory ? <AcademicFields directory={directory} value={draft} onChange={setDraft} /> : <div className="h-32 animate-pulse rounded-xl bg-line" />}
        </section>

        <section className="panel grid gap-4 p-4">
          <Field label="About you"><textarea className={area} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={600} placeholder="A line or two about you" /></Field>
          <Field label="Skills (comma separated)"><input className={input} value={skills} onChange={(e) => setSkills(e.target.value)} maxLength={300} /></Field>
          <Field label="Who can see your profile">
            <select className={input} value={visibility} onChange={(e) => setVisibility(e.target.value as "campus" | "friends")}>
              <option value="campus">Everyone on Zapa</option>
              <option value="friends">Friends only</option>
            </select>
          </Field>
        </section>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
          <Link to="/campus/people/$userId" params={{ userId: profile.userId }} className={btnGhost}>View public profile</Link>
        </div>
      </form>

      <div className="mt-6">
        <Card title="Confirm your MUBAS email">
          {profile.emailConfirmed ? <p className="text-sm text-good">Confirmed. Your campus email is verified.</p> : !profile.campusEmail || !profile.emailDomainOk ? <p className="text-sm text-muted">Add an @mubas.ac.mw address above and save, then confirm it here. This shows you control the mailbox. It does not prove enrolment.</p> : (
            <div className="grid gap-3">
              <p className="text-sm text-muted">We will send a code to {profile.campusEmail}.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnGhost} disabled={codeBusy} onClick={() => void sendCode()}>Send code</button>
                <input className={`${input} max-w-40`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" inputMode="numeric" aria-label="Confirmation code" />
                <button type="button" className={btn} disabled={codeBusy || code.trim().length < 4} onClick={() => void confirm()}>Confirm</button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
