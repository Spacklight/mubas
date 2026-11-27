import { useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { BadgeCheck, Eye, Film, ImagePlus, Link2, Megaphone, MousePointerClick, Pause, Play, Trash2 } from "lucide-react";
import { adAction, createAd, listMyAds, payConfig, type MyAd } from "@/lib/campus/pay";
import { ago } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { checkVideo, uploadVideo, type UploadStage } from "@/lib/video-upload";
import { PaymentBox } from "@/components/payment-box";
import { LoadError, shrinkImage, Skeleton, Tabs, unwrap, useLoad } from "@/components/page-kit";
import { area, btn, btnGhost, btnQuiet, Chip, Empty, ErrorNote, Field, input, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/ads")({
  head: () => ({ meta: [{ title: "Zapa Ads — Zapa MUBAS" }] }),
  component: AdsPage,
});

const TABS = ["My ads", "New ad"] as const;
const STATUS: Record<string, { label: string; tone: string }> = {
  awaiting_payment: { label: "Waiting for payment", tone: "bg-sand text-navy" },
  pending_review: { label: "Payment being checked", tone: "bg-sand-soft text-ink" },
  active: { label: "Running", tone: "bg-good-soft text-good" },
  paused: { label: "Paused", tone: "bg-sand-soft text-ink" },
  rejected: { label: "Rejected", tone: "bg-danger-soft text-danger" },
  revoked: { label: "Stopped", tone: "bg-danger-soft text-danger" },
};

function AdsPage() {
  const config = useLoad(() => unwrap(payConfig()), []);
  const mine = useLoad(() => unwrap(listMyAds()), []);
  const [tab, setTab] = useState<(typeof TABS)[number]>("My ads");
  const [paying, setPaying] = useState<number | null>(null);
  const price = config.data?.adsPrice ?? 500;
  const days = config.data?.adsDays ?? 7;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Zapa Ads" lede={`Do you run a business? Show your photo or video to students across MUBAS for K${price} (${days} days).`} />
      <section className="hero-glow mb-4 rounded-card p-4 text-on-navy">
        <p className="flex items-center gap-2 font-display text-2xl"><Megaphone className="size-6 text-sand" />Reach the whole campus</p>
        <ul className="mt-2 grid gap-1 text-sm">
          <li className="flex items-center gap-2"><BadgeCheck className="size-4 text-sand" />Your ad appears in the Home feed and in the video player</li>
          <li className="flex items-center gap-2"><BadgeCheck className="size-4 text-sand" />Students contact you on WhatsApp or by phone</li>
          <li className="flex items-center gap-2"><BadgeCheck className="size-4 text-sand" />Pay by mobile money, then upload a screenshot. Zapa checks it automatically</li>
        </ul>
      </section>
      <Tabs items={TABS} value={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === "New ad" ? (
          <NewAd onCreated={(adId) => { setTab("My ads"); setPaying(adId); mine.reload(); }} />
        ) : mine.loading && !mine.data ? <Skeleton rows={2} /> : mine.error ? <LoadError message={mine.error} onRetry={mine.reload} /> : !mine.data || mine.data.ads.length === 0 ? (
          <Empty title="No ads yet" body="Create your first ad. It takes about two minutes." />
        ) : (
          <ul className="grid gap-3">
            {mine.data.ads.map((ad) => <AdRow key={ad.id} ad={ad} price={price} open={paying === ad.id} onTogglePay={() => setPaying(paying === ad.id ? null : ad.id)} onChange={() => { mine.reload(); setPaying(null); }} />)}
          </ul>
        )}
      </div>
      <section className="panel mt-6 p-4 text-sm text-pretty text-muted">
        <p className="font-semibold text-ink">Ad rules</p>
        <ul className="mt-1 grid list-disc gap-1 pl-5"><li>Honest ads for real businesses. No scams, adult content, weapons, drugs or anything illegal.</li><li>No false claims about MUBAS, and no pretending to be the university.</li><li>Stewards can stop an ad that breaks the rules. Payments are not refunded for ads removed for breaking the rules.</li></ul>
      </section>
    </div>
  );
}

function AdRow({ ad, price, open, onTogglePay, onChange }: { ad: MyAd; price: number; open: boolean; onTogglePay: () => void; onChange: () => void }) {
  const st = STATUS[ad.status] ?? { label: ad.status, tone: "bg-sand-soft" };
  const thumb = ad.hasThumb ? `/api/media/${ad.itemId}?thumb=1` : ad.hasMedia && ad.kind === "image" ? `/api/media/${ad.itemId}` : null;

  async function act(action: "pause" | "resume" | "delete") {
    if (action === "delete" && !window.confirm("Delete this ad? A running ad is not refunded.")) return;
    try {
      await unwrap(adAction({ data: { id: ad.id, action } }));
      onChange();
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  return (
    <li className="panel p-3">
      <div className="flex gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-navy">{thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <Film className="size-7 text-on-navy/70" />}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{ad.title}</p>
          <p className="truncate text-sm text-muted">{ad.business}</p>
          <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${st.tone}`}>{st.label}</span>
          {ad.status === "active" && ad.endsAt ? <p className="mt-1 text-xs text-muted">Runs until {new Date(ad.endsAt).toLocaleDateString()}</p> : null}
        </div>
      </div>
      {ad.status === "active" || ad.status === "paused" ? (
        <p className="mt-2 flex gap-4 text-sm"><span className="inline-flex items-center gap-1.5"><Eye className="size-4" />{ad.impressions} views</span><span className="inline-flex items-center gap-1.5"><MousePointerClick className="size-4" />{ad.clicks} contacts</span><span className="text-muted">{ad.startsAt ? `Started ${ago(ad.startsAt)}` : ""}</span></p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {ad.status === "awaiting_payment" ? <button type="button" className={btn} onClick={onTogglePay}>{open ? "Hide payment" : `Pay K${price} to start`}</button> : null}
        {ad.status === "active" ? <button type="button" className={btnGhost} onClick={() => void act("pause")}><Pause className="size-4" />Pause</button> : null}
        {ad.status === "paused" ? <button type="button" className={btnGhost} onClick={() => void act("resume")}><Play className="size-4" />Resume</button> : null}
        {ad.status !== "revoked" ? <button type="button" className={btnQuiet} onClick={() => void act("delete")}><Trash2 className="size-4" />Delete</button> : null}
      </div>
      {open && ad.status === "awaiting_payment" ? <div className="mt-3"><PaymentBox purpose="ad" adId={ad.id} amount={price} onDone={onChange} /></div> : null}
    </li>
  );
}

function NewAd({ onCreated }: { onCreated: (adId: number) => void }) {
  const [kind, setKind] = useState<"image" | "video" | "link">("image");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [business, setBusiness] = useState("");
  const [phone, setPhone] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [image, setImage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const clip = useRef<HTMLInputElement>(null);

  async function pickPhoto(f: File | undefined) {
    if (!f) return;
    try {
      setImage(await shrinkImage(f, 1280, 800_000));
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  function pickClip(f: File | undefined) {
    if (!f) return;
    const issue = checkVideo(f);
    if (issue) return void toast.error(issue);
    setFile(f);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (kind === "video") {
        if (!file) throw new Error("Choose a video first.");
        const out = await uploadVideo({ file, title, body, category: "Business", ad: { business, phone, ...(ctaUrl ? { ctaUrl } : {}) }, onProgress: (s, p) => { setStage(s); setPercent(p); } });
        if (!out.adId) throw new Error("Your video uploaded but the ad was not created. Please try again.");
        toast.success("Ad created. Now pay to start it.");
        onCreated(out.adId);
      } else {
        const r = await unwrap(createAd({ data: { kind: kind === "image" ? "image" : "link", title, body, business, phone, ...(ctaUrl ? { ctaUrl } : {}), ...(kind === "image" ? { imageData: image } : { linkUrl: link }) } }));
        toast.success("Ad created. Now pay to start it.");
        onCreated(r.adId);
      }
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const label = stage === "preparing" ? "Preparing your video…" : stage === "saving" ? "Saving…" : `Uploading ${percent}%`;
  return (
    <form onSubmit={(e) => void submit(e)} className="panel grid gap-3 p-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {([["image", "Photo ad", ImagePlus], ["video", "Video ad", Film], ["link", "Video link", Link2]] as const).map(([k, l, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold ${kind === k ? "bg-navy text-on-navy" : "border border-line"}`}><Icon className="size-4" />{l}</button>
        ))}
      </div>
      {kind === "image" ? (
        <div>
          <input ref={photo} type="file" accept="image/*" className="sr-only" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          {image ? <img src={image} alt="Ad preview" className="mb-2 max-h-64 w-full rounded-2xl object-cover" /> : null}
          <button type="button" disabled={busy} onClick={() => photo.current?.click()} className={btnGhost}><ImagePlus className="size-4" />{image ? "Change photo" : "Choose a photo"}</button>
        </div>
      ) : kind === "video" ? (
        <div>
          <input ref={clip} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="sr-only" onChange={(e) => pickClip(e.target.files?.[0])} />
          <button type="button" disabled={busy} onClick={() => clip.current?.click()} className="grid min-h-28 w-full place-items-center gap-1 rounded-2xl border-2 border-dashed border-line bg-sand-soft p-4 text-center"><Film className="size-7 text-denim-deep" /><span className="font-semibold">{file ? file.name : "Choose a video"}</span><span className="text-xs text-muted">{file ? `${(file.size / 1048576).toFixed(1)} MB` : "MP4, MOV or WebM, up to 60 MB"}</span></button>
        </div>
      ) : (
        <Field label="Video link (YouTube or any web link)"><input className={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" required /></Field>
      )}
      <Field label="Headline"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={100} placeholder="e.g. Fresh bread delivered to your hostel" /></Field>
      <Field label="Short description"><textarea className={area} value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} placeholder="What do you sell? Prices, location, opening times." /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Business name"><input className={input} value={business} onChange={(e) => setBusiness(e.target.value)} required minLength={2} maxLength={80} /></Field>
        <Field label="WhatsApp / phone number"><input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required placeholder="0991234567" /></Field>
      </div>
      <Field label="Website or Facebook page (optional)"><input className={input} value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://" /></Field>
      {busy && kind === "video" ? <div role="status"><div className="h-2.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-denim transition-all" style={{ width: `${stage === "preparing" ? 4 : percent}%` }} /></div><p className="mt-1 text-sm font-semibold">{label}</p></div> : null}
      <ErrorNote>{error}</ErrorNote>
      <button className={btn} disabled={busy || (kind === "image" && !image) || (kind === "video" && !file)}>{busy ? "Creating your ad…" : "Create ad, then pay"}</button>
      <Chip>Nothing is charged until you pay and upload a screenshot</Chip>
    </form>
  );
}
