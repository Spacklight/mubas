import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getShell } from "@/lib/campus/server";
import type { Profile } from "@/lib/campus/types";
import { failureMessage } from "@/lib/campus/email-auth";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

type CampusValue = {
  profile: Profile | null;
  unreadNotes: number;
  unreadMessages: number;
  canPreviewSteward: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  dataSaver: boolean;
  setDataSaver: (value: boolean) => void;
};

const CampusContext = createContext<CampusValue | null>(null);

export function useCampus(): CampusValue {
  const value = useContext(CampusContext);
  if (!value) throw new Error("Campus state is only available inside the campus.");
  return value;
}

export function CampusState({ children }: { children: ReactNode }) {
  const { user: sessionUser, isPending } = useCurrentUserState();
  // The session hook briefly reports "pending / no user" whenever it re-checks
  // in the background. Keep the last known user so the page is never torn down.
  const lastUser = useRef(sessionUser);
  if (sessionUser) lastUser.current = sessionUser;
  const user = sessionUser ?? (isPending ? lastUser.current : null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [unreadNotes, setUnreadNotes] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [canPreviewSteward, setCanPreviewSteward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loadedOnce = useRef(false);
  const [dataSaver, setDataSaverState] = useState(false);

  useEffect(() => {
    setDataSaverState(localStorage.getItem("zapa-data-saver") === "1");
  }, []);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!user?.id) return;
    let live = true;
    // Only the very first load shows a loading state. Background refreshes are
    // silent, otherwise the whole page is replaced by a skeleton and anything
    // being typed is lost.
    if (!loadedOnce.current) setLoading(true);
    getShell()
      .then((result) => {
        if (!live) return;
        setProfile(result.profile);
        setUnreadNotes(result.unreadNotes);
        setUnreadMessages(result.unreadMessages);
        setCanPreviewSteward(result.canPreviewSteward);
        setError(null);
        loadedOnce.current = true;
      })
      .catch((reason) => {
        if (live && !loadedOnce.current) setError(failureMessage(reason));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [user?.id, tick]);

  useEffect(() => {
    if (!user?.id) return;
    // No timers: refresh quietly only when the user comes back to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") setTick((value) => value + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user?.id]);

  function setDataSaver(value: boolean) {
    setDataSaverState(value);
    localStorage.setItem("zapa-data-saver", value ? "1" : "0");
  }

  if (isPending && !user) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-11 w-40 animate-pulse rounded-full bg-line" />
        <div className="mt-6 h-40 animate-pulse rounded-card bg-line" />
      </div>
    );
  }

  if (!user) return <RedirectToSignIn />;

  return (
    <CampusContext.Provider
      value={{
        profile,
        unreadNotes,
        unreadMessages,
        canPreviewSteward,
        loading,
        error,
        refresh,
        dataSaver,
        setDataSaver,
      }}
    >
      {children}
    </CampusContext.Provider>
  );
}
