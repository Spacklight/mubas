import { useEffect, useRef, useState } from "react";
import { ExternalLink, MessageCircle, Phone, Play } from "lucide-react";
import { adEvent, listAds, type AdCard } from "@/lib/campus/pay";
import { youtubeId } from "@/lib/campus/logic";
import { useCampus } from "@/components/campus-state";
import { unwrap } from "@/components/page-kit";

/** Loads the ads that are running right now. Failing quietly: the feed works without ads. */
export function useAds(): AdCard[] {
  const [ads, setAds] = useState<AdCard[]>([]);
  useEffect(() => {
    let live = true;
    void unwrap(listAds())
      .then((r) => live && setAds(r.ads))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return ads;
}

const seen = new Set<number>();
export function trackView(id: number) {
  if (seen.has(id)) return;
  seen.add(id);
  void adEvent({ data: { id, type: "view" } }).catch(() => undefined);
}
const trackClick = (id: number) => void adEvent({ data: { id, type: "click" } }).catch(() => undefined);

function cover(ad: AdCard, saver: boolean): string | null {
  if (saver) return null;
  if (ad.hasMedia && ad.kind === "image") return `/api/media/${ad.itemId}`;
  if (ad.hasMedia && ad.hasThumb) return `/api/media/${ad.itemId}?thumb=1`;
  const yt = ad.linkUrl ? youtubeId(ad.linkUrl) : null;
  return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null;
}

function Actions({ ad, large = false }: { ad: AdCard; large?: boolean }) {
  const size = large ? "min-h-12 px-5 text-base" : "min-h-10 px-3 text-sm";
  return (
    <div className="flex flex-wrap gap-2">
      <a href={ad.contactUrl} target="_blank" rel="noreferrer" onClick={() => trackClick(ad.id)} className={`inline-flex items-center gap-1.5 rounded-full bg-good px-4 font-bold text-white ${size}`}><MessageCircle className="size-4" />WhatsApp</a>
      <a href={ad.callUrl} onClick={() => trackClick(ad.id)} className={`inline-flex items-center gap-1.5 rounded-full bg-white/90 px-4 font-bold text-ink ${size}`}><Phone className="size-4" />Call</a>
      {ad.ctaUrl ? <a href={ad.ctaUrl} target="_blank" rel="noreferrer noopener" onClick={() => trackClick(ad.id)} className={`inline-flex items-center gap-1.5 rounded-full bg-white/90 px-4 font-bold text-ink ${size}`}><ExternalLink className="size-4" />Visit</a> : null}
    </div>
  );
}

/** A sponsored tile in the Home grid. */
export function AdTile({ ad }: { ad: AdCard }) {
  const { dataSaver } = useCampus();
  const ref = useRef<HTMLElement>(null);
  const src = cover(ad, dataSaver);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && trackView(ad.id), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [ad.id]);

  return (
    <article ref={ref} className="relative isolate aspect-[3/4.25] overflow-hidden rounded-2xl bg-navy text-white shadow-lg ring-2 ring-sand">
      {src ? <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" /> : <div className="hero-glow absolute inset-0 grid place-items-center">{ad.kind === "video" ? <Play className="size-14 text-on-navy/70" /> : null}</div>}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/30" />
      <span className="absolute left-2.5 top-2.5 rounded-full bg-sand px-2.5 py-1 text-xs font-extrabold text-navy">Sponsored</span>
      <div className="absolute inset-x-0 bottom-0 grid gap-1.5 p-3">
        <p className="text-xs font-bold text-sand">{ad.business}</p>
        <h3 className="line-clamp-2 font-display text-lg leading-tight text-balance">{ad.title}</h3>
        {ad.body ? <p className="line-clamp-2 text-xs text-pretty text-white/85">{ad.body}</p> : null}
        <Actions ad={ad} />
      </div>
    </article>
  );
}

/** A full-screen sponsored slide in the Zapa Content player. */
export function AdSlide({ ad, index, active, near, muted }: { ad: AdCard; index: number; active: boolean; near: boolean; muted: boolean }) {
  const { dataSaver } = useCampus();
  const video = useRef<HTMLVideoElement>(null);
  const isFile = ad.kind === "video" && ad.hasMedia;
  const src = cover(ad, dataSaver);

  useEffect(() => {
    if (active) trackView(ad.id);
    const v = video.current;
    if (!v) return;
    v.muted = muted;
    if (active && !dataSaver) void v.play().catch(() => undefined);
    else v.pause();
  }, [active, ad.id, muted, dataSaver]);

  return (
    <section data-index={index} className="relative h-full w-full snap-start snap-always overflow-hidden bg-black" aria-label={`Sponsored: ${ad.title}`}>
      {isFile ? (
        <video ref={video} src={near ? `/api/media/${ad.itemId}` : undefined} poster={ad.hasThumb && !dataSaver ? `/api/media/${ad.itemId}?thumb=1` : undefined} loop playsInline muted={muted} preload={near ? "auto" : "none"} className="absolute inset-0 size-full object-contain" />
      ) : src ? (
        <img src={src} alt="" className="absolute inset-0 size-full object-contain" />
      ) : (
        <div className="hero-glow absolute inset-0" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30" />
      <span className="absolute left-3 top-[6.6rem] rounded-full bg-sand px-3 py-1 text-xs font-extrabold text-navy md:top-[7.25rem] md:py-1.5 md:text-sm">Sponsored · Zapa Ads</span>
      <div className="absolute inset-x-0 bottom-0 grid gap-2 px-4 pb-[6rem] md:pb-8">
        <p className="text-sm font-bold text-sand">{ad.business}</p>
        <h2 className="font-display text-3xl leading-tight text-balance [@media(max-height:720px)]:text-2xl">{ad.title}</h2>
        {ad.body ? <p className="line-clamp-3 text-pretty text-white/90">{ad.body}</p> : null}
        <Actions ad={ad} large />
      </div>
    </section>
  );
}
