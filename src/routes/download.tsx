import { createFileRoute } from "@tanstack/react-router";
import { Download, ShieldCheck, Smartphone } from "lucide-react";
import { Prose, PublicShell } from "@/components/public-layout";
import { SITE, seo } from "@/lib/site";

export const Route = createFileRoute("/download")({
  head: () => seo({ title: "Get the Zapa MUBAS Android app", description: "Download and install the Zapa MUBAS app on your Android phone.", path: "/download" }),
  component: DownloadPage,
});

function DownloadPage() {
  const apk = SITE.androidApkUrl;
  return (
    <PublicShell>
      <Prose>
        <span className="grid size-14 place-items-center rounded-2xl bg-denim-soft text-denim-deep"><Smartphone className="size-7" /></span>
        <h1 className="mt-3 font-display text-4xl">Get the Zapa MUBAS app</h1>
        <p>Keep your campus community one tap away on your Android phone.</p>
        {apk ? (
          <a href={apk} download className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-denim px-6 font-semibold text-on-denim !no-underline"><Download className="size-5" />Download for Android</a>
        ) : (
          <p className="panel mt-5 p-4">The Android app is not published yet. You can still add Zapa to your home screen from your browser menu: choose <strong>Add to Home screen</strong>.</p>
        )}
        <h2>How to install</h2>
        <ul>
          <li>Tap <strong>Download for Android</strong> and wait for the file to finish.</li>
          <li>Open the downloaded file. If Android asks, allow your browser or file manager to <strong>install unknown apps</strong>.</li>
          <li>Tap <strong>Install</strong>, then <strong>Open</strong>, and sign in with your Zapa account.</li>
        </ul>
        <p className="panel flex items-start gap-3 p-4 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-good" />Only install the app from this page or from a store listing we link to. If your phone warns about the file, check that you opened this page at <strong>{SITE.url.replace("https://", "")}</strong>.</p>
        <p className="text-sm text-muted">Need help? Open the <a href="/docs">documentation</a>.</p>
      </Prose>
    </PublicShell>
  );
}
