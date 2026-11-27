import { useEffect, useRef, useState } from "react";
import { showcaseCounts, type ShowcaseItem } from "@/lib/campus/showcase";

export type LiveCount = { id: number; likes: number; comments: number; shares: number; views: number; liked: boolean };

/** Lays fresh counts from other devices over the posts already on screen. */
export function withLive<T extends ShowcaseItem>(item: T, live: Record<number, LiveCount>): T {
  const c = live[item.id];
  return c ? { ...item, likeCount: c.likes, commentCount: c.comments, shares: c.shares, views: c.views, liked: c.liked } : item;
}

/**
 * Quietly re-reads like, comment, share and view counts for the given posts every
 * few seconds while the page is open and visible. Nothing is re-rendered unless a
 * number actually changed, so scrolling and typing are never interrupted.
 */
export function useLiveCounts(ids: number[], everyMs = 8000): Record<number, LiveCount> {
  const [live, setLive] = useState<Record<number, LiveCount>>({});
  const key = ids.slice(0, 40).join(",");
  const latest = useRef(key);
  latest.current = key;

  useEffect(() => {
    if (!key) return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await showcaseCounts({ data: { ids: key.split(",").map(Number) } });
        if (stopped || !("counts" in result) || latest.current !== key) return;
        setLive((cur) => {
          let changed = false;
          const next = { ...cur };
          for (const c of result.counts) {
            const old = cur[c.id];
            if (!old || old.likes !== c.likes || old.comments !== c.comments || old.shares !== c.shares || old.views !== c.views || old.liked !== c.liked) {
              next[c.id] = c;
              changed = true;
            }
          }
          return changed ? next : cur;
        });
      } catch {
        // try again on the next tick
      }
    };
    const timer = window.setInterval(() => void tick(), everyMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, everyMs]);

  return live;
}
