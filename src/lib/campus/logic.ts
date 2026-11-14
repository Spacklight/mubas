export const STUDY_LEVELS = [
  "Undergraduate",
  "Postgraduate",
  "Diploma",
  "Certificate",
  "Generic",
] as const;

export const STUDY_MODES = [
  "Full-time",
  "ODeL",
  "Weekend",
  "Evening",
  "Block release",
] as const;

export const ACADEMIC_YEARS = [
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Year 5",
  "Foundation",
  "Final year",
  "Not applicable",
] as const;

export const POST_KINDS = ["note", "question", "material"] as const;

export const VIDEO_CATEGORIES = [
  "Tutorials",
  "Lectures",
  "Student experiences",
  "Technology",
  "Entrepreneurship",
  "Academic discussions",
  "University events",
  "Educational entertainment",
] as const;

export const LIBRARY_CATEGORIES = [
  "Textbook",
  "Lecture notes",
  "Presentation",
  "Research paper",
  "Study guide",
  "Past paper",
  "Video lesson",
  "Audio",
  "Other",
] as const;

export const ANNOUNCEMENT_CATEGORIES = [
  "General",
  "Academic calendar",
  "Examinations",
  "Registration",
  "Scholarships",
  "Vacancies",
  "Events",
  "Deadlines",
  "Department",
  "Lecturer note",
] as const;

export const REPORT_REASONS = [
  "Harassment",
  "Impersonation",
  "Spam",
  "Inappropriate content",
  "Copyright",
  "Other",
] as const;

export const RANK_LABEL = [
  "",
  "Same programme and year",
  "Same programme",
  "Same department",
  "Same school",
  "Same study mode",
  "Elsewhere at MUBAS",
];

export function isMubasEmail(value: string): boolean {
  return /^[a-z0-9._%+-]+@mubas\.ac\.mw$/i.test(value.trim());
}

export function cleanText(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

export function cleanHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

export function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "Link";
  }
}

export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return /^[\w-]{6,}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const id = url.searchParams.get("v") ?? "";
      return /^[\w-]{6,}$/.test(id) ? id : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function ago(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Date.now() - then) / 1000;
  if (seconds < 45) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function activeLabel(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "No recent activity";
  if (Date.now() - then < 3 * 60 * 1000) return "Active now";
  return `Last active ${ago(value).toLowerCase()}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part.charAt(0).toUpperCase()).join("");
  return letters || "Z";
}

export function roleLabel(role: string, confirmed: boolean): string | null {
  if (role === "admin") return "Steward";
  if (role === "lecturer") return confirmed ? "Lecturer" : "Says they lecture · not confirmed";
  if (role === "staff") return confirmed ? "University staff" : "Says they are staff · not confirmed";
  return null;
}

export function kindLabel(kind: string): string {
  if (kind === "question") return "Question";
  if (kind === "material") return "Material";
  return "Note";
}
