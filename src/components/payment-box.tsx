import { useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ImagePlus, ShieldCheck, TriangleAlert } from "lucide-react";
import { payConfig, submitPayment } from "@/lib/campus/pay";
import { failureMessage } from "@/lib/campus/email-auth";
import { shrinkImage, unwrap, useLoad } from "@/components/page-kit";
import { btn, ErrorNote, Field, input } from "@/components/ui";

type Result = { verdict: "approved" | "review" | "rejected"; reason: string };

/** Shows where to pay, takes the payment screenshot, and shows the automatic check result. */
export function PaymentBox({ purpose, adId, tier, amount, onDone }: { purpose: "ad" | "plan"; adId?: number; tier?: number; amount: number; onDone: () => void }) {
  const { data } = useLoad(() => unwrap(payConfig()), []);
  const [proof, setProof] = useState("");
  const [txn, setTxn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const number = data?.number ?? "0987074481";

  async function copy() {
    try {
      await navigator.clipboard.writeText(number);
      toast.success("Number copied");
    } catch {
      toast.error("Could not copy. Type the number instead.");
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setProof(await shrinkImage(file, 1400, 800_000));
      setError(null);
    } catch (reason) {
      toast.error(failureMessage(reason));
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await unwrap(submitPayment({ data: { purpose, ...(adId ? { adId } : {}), ...(tier ? { tier } : {}), proof, ...(txn.trim() ? { txnId: txn.trim() } : {}) } }));
      setResult({ verdict: r.verdict, reason: r.reason });
      if (r.verdict !== "rejected") onDone();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (result && result.verdict !== "rejected") {
    return (
      <div role="status" className={`rounded-2xl p-4 ${result.verdict === "approved" ? "bg-good-soft text-good" : "bg-sand-soft"}`}>
        <p className="flex items-center gap-2 font-display text-xl">{result.verdict === "approved" ? <><Check className="size-6" />Payment confirmed!</> : <><ShieldCheck className="size-6" />Received. We are checking it.</>}</p>
        <p className="mt-1 text-sm text-pretty">{result.verdict === "approved" ? (purpose === "ad" ? "Your ad is now live." : "Your plan is now active.") : `${result.reason} You will see the result here shortly.`}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-sand-soft p-4">
      <p className="font-display text-xl">Pay K{amount}</p>
      <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-pretty">
        <li>Open your mobile money (Airtel Money or TNM Mpamba) or banking app.</li>
        <li>Send exactly <strong>K{amount}</strong> to <strong>{number}</strong>.</li>
        <li>Take a screenshot of the confirmation. It must show the amount, the number you paid, the transaction ID and the date.</li>
        <li>Upload the screenshot below. Zapa checks it automatically.</li>
      </ol>
      <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-bold"><Copy className="size-4" />Copy {number}</button>
      <div>
        <input ref={picker} type="file" accept="image/*" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        {proof ? <img src={proof} alt="Payment screenshot" className="mb-2 max-h-72 rounded-xl border border-line object-contain" /> : null}
        <button type="button" disabled={busy} onClick={() => picker.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold ring-1 ring-line"><ImagePlus className="size-4" />{proof ? "Change screenshot" : "Choose the screenshot"}</button>
      </div>
      <Field label="Transaction ID (optional, helps us confirm faster)"><input className={input} value={txn} onChange={(e) => setTxn(e.target.value)} maxLength={60} placeholder="e.g. MP261121.1030.A12345" /></Field>
      {result?.verdict === "rejected" ? <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{result.reason}</p> : null}
      <ErrorNote>{error}</ErrorNote>
      <button type="button" className={btn} disabled={busy || !proof} onClick={() => void submit()}>{busy ? "Checking your payment…" : "Verify my payment"}</button>
      <p className="text-xs text-pretty text-muted">Each screenshot and each transaction can only be used once. Payments are not refundable once your ad or plan is active. A steward may review payments, and fake or edited screenshots lead to a ban.</p>
    </div>
  );
}
