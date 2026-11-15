import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { ThemeButton } from "@/components/theme-button";
import { CampusScene } from "@/components/campus-scene";
import { btn, ErrorNote, Field, input } from "@/components/ui";
import { emailAuth, failureMessage } from "@/lib/campus/email-auth";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "join" ? ("join" as const) : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in — Zapa MUBAS" }] }),
  component: Login,
});

type Mode = "signin" | "join" | "reset";

function Login() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(search.mode === "join" ? "join" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNote(null);
    try {
      const auth = emailAuth();
      if (mode === "reset") {
        const result = await auth.requestPasswordReset({ email, redirectTo: "/login" });
        if (result.error) throw new Error(result.error.message ?? "Could not send the reset link.");
        setNote("If that email has an account, a reset link is on its way.");
        return;
      }
      if (mode === "join") {
        if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
        const made = await auth.signUp.email({ email, password, name: name.trim() || email.split("@")[0] });
        if (made.error) throw new Error(made.error.message ?? "Could not create the account.");
      }
      const result = await auth.signIn.email({ email, password, callbackURL: "/campus" });
      if (result.error) throw new Error(result.error.message ?? "Wrong email or password.");
      void navigate({ to: "/campus" });
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setPending(false);
    }
  }

  const title = mode === "join" ? "Join Zapa MUBAS" : mode === "reset" ? "Reset your password" : "Welcome back";
  return (
    <div className="grid min-h-screen bg-paper md:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-4 py-4 md:px-10">
        <div className="flex items-center">
          <Logo />
          <div className="ml-auto"><ThemeButton /></div>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="rise font-display text-4xl text-balance text-ink">{title}</h1>
          <p className="rise rise-2 mt-2 text-pretty text-muted">
            {mode === "join" ? "Create your account, then tell Zapa what you study." : mode === "reset" ? "We will email you a link to choose a new password." : "Sign in to your campus community."}
          </p>
          <form onSubmit={(event) => void submit(event)} className="rise rise-3 mt-6 grid gap-4">
            {mode === "join" ? (
              <Field label="Full name">
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="As friends know you" required />
              </Field>
            ) : null}
            <Field label="Email">
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@mubas.ac.mw" required />
            </Field>
            {mode !== "reset" ? (
              <Field label="Password">
                <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "join" ? "new-password" : "current-password"} minLength={mode === "join" ? 8 : undefined} required />
              </Field>
            ) : null}
            <ErrorNote>{error}</ErrorNote>
            {note ? <p className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{note}</p> : null}
            <button className={btn} type="submit" disabled={pending}>
              {pending ? "One moment…" : mode === "join" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
            </button>
          </form>
          <div className="mt-5 grid gap-2 text-sm">
            {mode === "signin" ? (
              <>
                <button type="button" className="text-left font-semibold text-denim-deep" onClick={() => setMode("reset")}>Forgot your password?</button>
                <p className="text-muted">New here? <button type="button" className="font-semibold text-denim-deep" onClick={() => { setMode("join"); setError(null); }}>Create an account</button></p>
              </>
            ) : (
              <p className="text-muted">{mode === "join" ? "Already have an account?" : "Remembered it?"} <button type="button" className="font-semibold text-denim-deep" onClick={() => { setMode("signin"); setError(null); }}>Sign in</button></p>
            )}
          </div>
          <p className="mt-8 text-xs text-pretty text-muted">
            By joining you agree to the <Link to="/guide" className="font-semibold underline">community guidelines</Link>. Zapa is independent and not an official MUBAS system.
          </p>
        </div>
      </div>
      <aside className="hero-glow hidden items-center justify-center p-10 md:flex">
        <div className="max-w-lg">
          <CampusScene className="drift h-auto w-full drop-shadow-2xl" />
          <p className="mt-6 font-display text-2xl italic text-sand">Your Campus. Your Community. Your Connection.</p>
        </div>
      </aside>
    </div>
  );
}
