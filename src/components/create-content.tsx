import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, Film, ImagePlus, PenLine, CirclePlus, X } from "lucide-react";
import { createShowcase, createStory, SHOWCASE_CATEGORIES } from "@/lib/campus/showcase";
import { failureMessage } from "@/lib/campus/email-auth";
import { checkVideo, uploadVideo, type UploadStage } from "@/lib/video-upload";
import { shrinkImage, unwrap } from "@/components/page-kit";
import { area, btn, ErrorNote, Field, input } from "@/components/ui";

type Mode = "menu" | "video" | "photo" | "post" | "story";
type Category = (typeof SHOWCASE_CATEGORIES)[number];

const TAGS = "#ZapaContent #MUBAS ";

const TITLES: Record<Mode, string> = { menu: "Create", video: "Upload a video", photo: "Share a photo", post: "Write a post", story: "Add to your story" };

/** Bottom sheet opened by the Create button. */
export function CreateSheet({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("menu");
  const [locked, setLocked] = useState(false);

  function done(message: string) {
    toast.success(message);
    window.dispatchEvent(new Event("zapa:content-created"));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 md:items-center" onClick={() => !locked && onClose()}>
      <div role="dialog" aria-label={TITLES[mode]} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-4 shadow-2xl md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          {mode !== "menu" && !locked ? <button type="button" aria-label="Back" onClick={() => setMode("menu")} className="grid size-11 place-items-center"><ArrowLeft className="size-5" /></button> : null}
          <h2 className="flex-1 font-display text-2xl">{TITLES[mode]}</h2>
          {!locked ? <button type="button" aria-label="Close" onClick={onClose} className="grid size-11 place-items-center"><X className="size-5" /></button> : null}
        </div>
        {mode === "menu" ? (
          <div className="grid grid-cols-2 gap-3">
            {([["video", "Video", Film, "Upload from your phone"], ["photo", "Photo", ImagePlus, "Show your work"], ["post", "Post", PenLine, "Share what you know"], ["story", "Story", CirclePlus, "Disappears in 24 hours"]] as const).map(([key, label, Icon, hint]) => (
              <button key={key} type="button" onClick={() => setMode(key)} className="panel lift grid gap-1 p-4 text-left">
                <span className="grid size-11 place-items-center rounded-xl bg-denim-soft text-denim-deep"><Icon className="size-6" /></span>
                <span className="font-display text-lg">{label}</span>
                <span className="text-xs text-muted">{hint}</span>
              </button>
            ))}
          </div>
        ) : mode === "video" ? (
          <VideoForm setLocked={setLocked} onDone={() => done("Your video is live!")} />
        ) : mode === "photo" ? (
          <PhotoForm setLocked={setLocked} onDone={() => done("Photo shared!")} />
        ) : mode === "post" ? (
          <PostForm setLocked={setLocked} onDone={() => done("Post shared!")} />
        ) : (
          <StoryForm setLocked={setLocked} onDone={() => done("Added to your story")} />
        )}
      </div>
    </div>
  );
}

function CategoryField({ value, onChange }: { value: Category; onChange: (c: Category) => void }) {
  return (
    <Field label="Category">
      <select className={input} value={value} onChange={(e) => onChange(e.target.value as Category)}>{SHOWCASE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
    </Field>
  );
}

function Rules() {
  return <p className="text-xs text-pretty text-muted">Only share your own work or things you have permission to share. Other Zapa members can see it.</p>;
}

type FormProps = { onDone: () => void; setLocked: (v: boolean) => void };

function useSubmit({ onDone, setLocked }: FormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function run(job: () => Promise<unknown>) {
    setPending(true);
    setLocked(true);
    setError(null);
    try {
      await job();
      onDone();
    } catch (reason) {
      setError(failureMessage(reason));
      setLocked(false);
    } finally {
      setPending(false);
    }
  }
  return { error, pending, run };
}

function VideoForm(props: FormProps) {
  const { error, pending, run } = useSubmit(props);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(TAGS);
  const [category, setCategory] = useState<Category>("Talent");
  const [useLink, setUseLink] = useState(false);
  const [link, setLink] = useState("");
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [percent, setPercent] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  function choose(next: File | undefined) {
    if (!next) return;
    const issue = checkVideo(next);
    setProblem(issue);
    setFile(issue ? null : next);
    if (!issue && !title) setTitle(next.name.replace(/\.[^.]+$/, "").slice(0, 80));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (useLink) {
        await unwrap(createShowcase({ data: { kind: "video", title, body, category, linkUrl: link } }));
        return;
      }
      if (!file) throw new Error("Choose a video first.");
      await uploadVideo({ file, title, body, category, onProgress: (s, p) => { setStage(s); setPercent(p); } });
    });
  }

  const label = stage === "preparing" ? "Preparing your video…" : stage === "saving" ? "Saving to Zapa…" : `Uploading ${percent}%`;
  return (
    <form onSubmit={submit} className="grid gap-3">
      {useLink ? (
        <Field label="Video link (YouTube or any web link)"><input className={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" required /></Field>
      ) : (
        <div>
          <input ref={picker} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
          <button type="button" onClick={() => picker.current?.click()} disabled={pending} className="grid min-h-32 w-full place-items-center gap-1 rounded-2xl border-2 border-dashed border-line bg-sand-soft p-4 text-center">
            <Film className="size-8 text-denim-deep" />
            <span className="font-semibold">{file ? file.name : "Choose a video"}</span>
            <span className="text-xs text-muted">{file ? `${(file.size / 1048576).toFixed(1)} MB` : "MP4, MOV or WebM, up to 60 MB"}</span>
          </button>
          {problem ? <p className="mt-2 text-sm text-danger">{problem}</p> : null}
        </div>
      )}
      <Field label="Title"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={120} placeholder="Give it a title" /></Field>
      <CategoryField value={category} onChange={setCategory} />
      <Field label="Caption and hashtags"><textarea className={area} value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} /></Field>
      <button type="button" className="justify-self-start text-sm font-semibold text-denim-deep" disabled={pending} onClick={() => setUseLink((v) => !v)}>{useLink ? "Upload a video file instead" : "Use a YouTube link instead"}</button>
      <Rules />
      {pending && !useLink ? (
        <div role="status" aria-live="polite">
          <div className="h-2.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-denim transition-all" style={{ width: `${stage === "preparing" ? 4 : percent}%` }} /></div>
          <p className="mt-1.5 text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted">Keep this screen open until it finishes.</p>
        </div>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
      <button className={btn} disabled={pending || (!useLink && !file)}>{pending ? "Publishing…" : "Publish"}</button>
    </form>
  );
}

function PhotoPicker({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const picker = useRef<HTMLInputElement>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      onChange(await shrinkImage(file, 1280, 800_000));
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }
  return (
    <div>
      <input ref={picker} type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
      {value ? <img src={value} alt="Preview" className="mb-2 max-h-72 w-full rounded-2xl object-cover" /> : null}
      <button type="button" disabled={disabled} onClick={() => picker.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold"><ImagePlus className="size-4" />{value ? "Change photo" : "Choose a photo"}</button>
    </div>
  );
}

function PhotoForm(props: FormProps) {
  const { error, pending, run } = useSubmit(props);
  const [image, setImage] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(TAGS);
  const [category, setCategory] = useState<Category>("Art and design");
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(() => unwrap(createShowcase({ data: { kind: "image", title, body, category, imageData: image } }))); }} className="grid gap-3">
      <PhotoPicker value={image} onChange={setImage} disabled={pending} />
      <Field label="Title"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={120} /></Field>
      <CategoryField value={category} onChange={setCategory} />
      <Field label="Caption and hashtags"><textarea className={area} value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} /></Field>
      <Rules />
      <ErrorNote>{error}</ErrorNote>
      <button className={btn} disabled={pending || !image}>{pending ? "Sharing…" : "Share photo"}</button>
    </form>
  );
}

function PostForm(props: FormProps) {
  const { error, pending, run } = useSubmit(props);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(TAGS);
  const [category, setCategory] = useState<Category>("Knowledge");
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(() => unwrap(createShowcase({ data: { kind: "post", title, body, category } }))); }} className="grid gap-3">
      <Field label="Title"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={120} placeholder="What do you want to share?" /></Field>
      <CategoryField value={category} onChange={setCategory} />
      <Field label="Your post"><textarea className={`${area} min-h-32`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} /></Field>
      <Rules />
      <ErrorNote>{error}</ErrorNote>
      <button className={btn} disabled={pending}>{pending ? "Sharing…" : "Share post"}</button>
    </form>
  );
}

function StoryForm(props: FormProps): ReactNode {
  const { error, pending, run } = useSubmit(props);
  const [image, setImage] = useState("");
  const [caption, setCaption] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(() => unwrap(createStory({ data: { imageData: image, caption } }))); }} className="grid gap-3">
      <PhotoPicker value={image} onChange={setImage} disabled={pending} />
      <Field label="Caption (optional)"><input className={input} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={140} /></Field>
      <p className="text-xs text-pretty text-muted">Stories disappear after 24 hours. Other Zapa members can see them.</p>
      <ErrorNote>{error}</ErrorNote>
      <button className={btn} disabled={pending || !image}>{pending ? "Posting…" : "Add to story"}</button>
    </form>
  );
}
