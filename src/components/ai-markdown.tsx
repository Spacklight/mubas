import type { ReactNode } from "react";

/** Safe inline formatting: **bold**, *italic* and `code`. Nothing is injected as HTML. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = m[0];
    if (token.startsWith("**")) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={key++} className="rounded bg-black/10 px-1 py-0.5 text-[0.9em]">{token.slice(1, -1)}</code>);
    else out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Renders a model answer: headings, numbered and bulleted lists, paragraphs. */
export function AiMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<p key={key++} className="mt-3 text-base font-bold first:mt-0">{inline(heading[1])}</p>);
      i += 1;
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push(<ol key={key++} className="mt-2 list-decimal space-y-1.5 pl-6 first:mt-0">{items.map((item, n) => <li key={n}>{inline(item)}</li>)}</ol>);
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ""));
        i += 1;
      }
      blocks.push(<ul key={key++} className="mt-2 list-disc space-y-1.5 pl-6 first:mt-0">{items.map((item, n) => <li key={n}>{inline(item)}</li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(\d+[.)]|[-*•]|#{1,4})\s+/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(<p key={key++} className="mt-2 text-pretty first:mt-0">{inline(para.join(" "))}</p>);
  }
  return <div className="text-[0.95rem] leading-relaxed">{blocks}</div>;
}
