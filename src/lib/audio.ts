/** Wraps raw 16-bit mono PCM (base64) in a WAV header so the browser can play and download it. */
export function pcmToWavUrl(base64: string, sampleRate = 24000): string {
  const bin = atob(base64);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) pcm[i] = bin.charCodeAt(i);
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, pcm.length, true);
  return URL.createObjectURL(new Blob([header, pcm], { type: "audio/wav" }));
}

/** Free voice built into the phone or browser. */
export function speakOnDevice(text: string, opts: { rate: number; lang: string; onEnd?: () => void }): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const clean = text.replace(/\*\*|__|`/g, "").replace(/^\s*[-*]\s+/gm, "").replace(/\s+/g, " ").trim().slice(0, 4000);
  const utter = new SpeechSynthesisUtterance(clean);
  utter.rate = opts.rate;
  utter.lang = opts.lang;
  utter.onend = () => opts.onEnd?.();
  utter.onerror = () => opts.onEnd?.();
  window.speechSynthesis.speak(utter);
  return true;
}

export function stopDeviceSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
