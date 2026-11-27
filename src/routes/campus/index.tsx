import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bookmark, Clapperboard, Flame, GraduationCap, UserRound, Users } from "lucide-react";
import { listShowcase, type ContentTabId, type ShowcaseItem } from "@/lib/campus/showcase";
import { failureMessage } from "@/lib/campus/email-auth";
import { useCampus } from "@/components/campus-state";
import { ContentCard } from "@/components/content-cards";
import { StoriesRow } from "@/components/stories";
import { AdTile, useAds } from "@/components/ad-cards";
import { useLiveCounts, withLive } from "@/lib/live-counts";
import { LoadError, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { btnGhost, Empty } from "@/components/ui";

export const Route = createFileRoute("/campus/")({
  head: () => ({ meta: [{ title: "Zapa Content — Zapa MUBAS" }] }),
  component: Home,
});

const TABS: { id: ContentTabId; label: string; icon: typeof Flame }[] = [
  { id: "for-you", label: "For You", icon: Clapperboard },
  { id: "following", label: "Following", icon: Users },
  { id: "trending", label: "Trending", icon: Flame },
  { id: "mubas", label: "MUBAS", icon: GraduationCap },
  { id: "friends", label: "Friends", icon: UserRound },
  { id: "saved", label: "Saved", icon: Bookmark },
];

const EMPTY: Record<ContentTabId, string> = {
  "for-you": "Be the first to share. Tap Create to upload a video, a photo or a post.",
  following: "Follow people from the For You tab and their content shows up here.",
  trending: "Nothing is trending yet. Like and share to get things moving.",
  mubas: "Posts from confirmed lecturers, staff and stewards, and anything tagged #MUBAS, appear here.",
  friends: "Add friends from Discover and their posts will appear here.",
  saved: "Tap Save on any post and it will be kept here for you.",
};

function Home() {
  const { profile } = useCampus();
  const [tab, setTab] = useState<ContentTabId>("for-you");
  const [more, setMore] = useState<ShowcaseItem[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useLoad(() => unwrap(listShowcase({ data: { tab } })), [tab]);
  const items = data ? [...data.items, ...more] : [];
  const live = useLiveCounts(items.slice(0, 24).map((i) => i.id), 12000);
  const ads = useAds();
  const tiles: ReactNode[] = [];
  let adIndex = 0;
  items.forEach((item, i) => {
    tiles.push(<ContentCard key={item.id} item={withLive(item, live)} meId={profile?.userId ?? ""} admin={profile?.role === "admin"} tab={tab} onChange={reset} />);
    if (ads.length && (i + 1) % 6 === 0) tiles.push(<AdTile key={`ad-${i}`} ad={ads[adIndex++ % ads.length]} />);
  });
  if (ads.length && items.length > 0 && items.length < 6) tiles.push(<AdTile key="ad-end" ad={ads[0]} />);

  function reset() {
    setMore([]);
    setDone(false);
    reload();
  }

  useEffect(() => {
    window.addEventListener("zapa:content-created", reset);
    return () => window.removeEventListener("zapa:content-created", reset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function loadMore() {
    setBusy(true);
    try {
      const result = await unwrap(listShowcase({ data: { tab, offset: items.length } }));
      setMore((cur) => [...cur, ...result.items]);
      if (!result.more) setDone(true);
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="sr-only">Zapa Content</h1>
      <StoriesRow />
      <div className="-mx-3 mt-4 flex gap-2 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Content feeds">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => { setTab(id); setMore([]); setDone(false); }}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition ${tab === id ? "bg-denim text-on-denim shadow-md" : "bg-sand-soft text-ink hover:bg-denim-soft"}`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading && !data ? (
          <Skeleton rows={3} />
        ) : error ? (
          <LoadError message={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <Empty title="Nothing here yet" body={EMPTY[tab]} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {tiles}
            </div>
            {!done && data?.more ? (
              <button type="button" className={`${btnGhost} mt-4 w-full`} onClick={() => void loadMore()} disabled={busy}>
                {busy ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
