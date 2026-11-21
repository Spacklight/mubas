import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, Smartphone, X } from "lucide-react";
import { SITE } from "@/lib/site";

const KEY = "zapa-app-prompt";
const SNOOZE_DAYS = 7;

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Friendly pop-up that invites Android visitors to install the Zapa MUBAS app. */
export function InstallPrompt() {
  const [open, setOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const android = /Android/i.test(ua);
    const inApp = /ZapaApp/i.test(ua) || matchMedia("(display-mode: standalone)").matches;
    if (!android || inApp) return;
    try {
      const until = Number(localStorage.getItem(KEY) ?? 0);
      if (until > Date.now()) return;
    } catch {
      // storage unavailable: still show the prompt
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const timer = window.setTimeout(() => setOpen(true), 7000);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
    } catch {
      // ignore
    }
  }

  if (!open || (!SITE.androidApkUrl && !installEvent)) return null;

  return (
    <div role="dialog" aria-label="Get the Zapa MUBAS app" className="rise fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-card border border-line bg-card p-4 shadow-2xl md:bottom-6">
      <button type="button" onClick={close} aria-label="Dismiss" className="absolute right-2 top-2 grid size-10 place-items-center rounded-full text-muted hover:bg-sand-soft"><X className="size-5" /></button>
      <div className="flex items-start gap-3 pr-8">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-navy text-sand"><Smartphone className="size-6" /></span>
        <div>
          <p className="font-display text-xl leading-tight">Get the Zapa MUBAS app</p>
          <p className="mt-1 text-sm text-pretty text-muted">Open your campus community from your home screen and never miss a message.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SITE.androidApkUrl ? (
          <>
            <a href={SITE.androidApkUrl} download onClick={close} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-denim px-4 text-sm font-semibold text-on-denim"><Download className="size-4" />Download</a>
            <Link to="/download" onClick={close} className="inline-flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-semibold">How to install</Link>
          </>
        ) : (
          <button type="button" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-denim px-4 text-sm font-semibold text-on-denim" onClick={() => void installEvent?.prompt().then(close)}>Install app</button>
        )}
        <button type="button" onClick={close} className="min-h-11 px-3 text-sm font-semibold text-muted">Not now</button>
      </div>
    </div>
  );
}
