import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { deleteStory, listStories, type StoryItem } from "@/lib/campus/showcase";
import { ago } from "@/lib/campus/logic";
import { failureMessage } from "@/lib/campus/email-auth";
import { useCampus } from "@/components/campus-state";
import { Avatar, unwrap, useLoad } from "@/components/page-kit";

type Group = { userId: string; author: string; stories: StoryItem[] };

function group(stories: StoryItem[], meId: string): Group[] {
  const byUser = new Map<string, Group>();
  for (const story of [...stories].reverse()) {
    const g = byUser.get(story.userId) ?? { userId: story.userId, author: story.author, stories: [] };
    g.stories.push(story); // oldest first inside a person's stories
    byUser.set(story.userId, g);
  }
  const all = [...byUser.values()];
  return [...all.filter((g) => g.userId === meId), ...all.filter((g) => g.userId !== meId)];
}

/** The row of story tiles at the top of Zapa Content. */
export function StoriesRow() {
  const { profile } = useCampus();
  const { data, reload } = useLoad(() => unwrap(listStories()), []);
  const [open, setOpen] = useState<number | null>(null);
  const meId = profile?.userId ?? "";
  const groups = data ? group(data.stories, meId) : [];

  useEffect(() => {
    window.addEventListener("zapa:content-created", reload);
    return () => window.removeEventListener("zapa:content-created", reload);
  }, [reload]);

  return (
    <>
      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1" aria-label="Stories">
        <button type="button" onClick={() => window.dispatchEvent(new Event("zapa:open-create"))} className="grid h-44 w-28 shrink-0 place-items-center content-center gap-2 rounded-2xl bg-gradient-to-b from-denim to-navy text-sm font-semibold text-on-navy shadow-lg">
          <span className="grid size-12 place-items-center rounded-full bg-white/20"><Plus className="size-7" /></span>
          Create Story
        </button>
        {groups.map((g, index) => {
          const latest = g.stories[g.stories.length - 1];
          const mine = g.userId === meId;
          return (
            <button key={g.userId} type="button" onClick={() => setOpen(index)} className="relative h-44 w-28 shrink-0 rounded-2xl bg-gradient-to-tr from-sand via-denim to-denim-deep p-[3px] shadow-lg" aria-label={`${mine ? "Your" : `${g.author}'s`} story`}>
              <span className="relative block size-full overflow-hidden rounded-[13px] bg-navy">
                <img src={`/api/story/${latest.id}`} alt="" loading="lazy" className="size-full object-cover" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 truncate p-2 text-sm font-bold text-white">{mine ? "My Story" : g.author.split(" ")[0]}</span>
              </span>
            </button>
          );
        })}
      </div>
      {open !== null && groups[open] ? <StoryViewer groups={groups} start={open} meId={meId} onClose={() => setOpen(null)} onChanged={reload} /> : null}
    </>
  );
}

const SECONDS = 6;

function StoryViewer({ groups, start, meId, onClose, onChanged }: { groups: Group[]; start: number; meId: string; onClose: () => void; onChanged: () => void }) {
  const [g, setG] = useState(start);
  const [i, setI] = useState(0);
  const current = groups[g];
  const story = current?.stories[i];

  const next = useCallback(() => {
    if (!current) return onClose();
    if (i < current.stories.length - 1) setI(i + 1);
    else if (g < groups.length - 1) {
      setG(g + 1);
      setI(0);
    } else onClose();
  }, [current, g, groups.length, i, onClose]);

  const prev = () => {
    if (i > 0) setI(i - 1);
    else if (g > 0) {
      setG(g - 1);
      setI(groups[g - 1].stories.length - 1);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(next, SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [next, g, i]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, onClose]);

  if (!current || !story) return null;

  async function remove() {
    try {
      await unwrap(deleteStory({ data: { id: story!.id } }));
      onChanged();
      onClose();
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black" role="dialog" aria-label="Story">
      <div className="relative h-full w-full max-w-md">
        <img src={`/api/story/${story.id}`} alt="" className="size-full object-contain" />
        <div className="absolute inset-x-0 top-0 grid gap-2 bg-gradient-to-b from-black/60 to-transparent p-3">
          <div className="flex gap-1">
            {current.stories.map((s, index) => (
              <span key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                <span key={`${g}-${i}`} className={`block h-full bg-white ${index < i ? "w-full" : index === i ? "story-fill" : "w-0"}`} style={index === i ? { animationDuration: `${SECONDS}s` } : undefined} />
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 text-white">
            <Avatar name={current.author} size="size-9" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{current.userId === meId ? "My Story" : current.author}</p><p className="text-xs text-white/70">{ago(story.createdAt)}</p></div>
            {current.userId === meId ? <button type="button" aria-label="Delete story" onClick={() => void remove()} className="grid size-11 place-items-center"><Trash2 className="size-5" /></button> : null}
            <button type="button" aria-label="Close" onClick={onClose} className="grid size-11 place-items-center"><X className="size-6" /></button>
          </div>
        </div>
        {story.caption ? <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pb-8 text-center text-lg font-semibold text-white">{story.caption}</p> : null}
        <button type="button" aria-label="Previous" onClick={prev} className="absolute inset-y-20 left-0 w-1/3" />
        <button type="button" aria-label="Next" onClick={next} className="absolute inset-y-20 right-0 w-1/3" />
      </div>
    </div>
  );
}
