/** Site-wide settings. Change `url` here if the domain changes. */
export const SITE = {
  name: "Zapa MUBAS",
  url: "https://zapamubas.de5.net",
  tagline: "Your Campus. Your Community. Your Connection.",
  description:
    "Zapa MUBAS is a community for students, lecturers and staff of the Malawi University of Business and Applied Sciences: find classmates, join programme rooms, chat, share talents and study resources, and keep up with campus news.",
  /** Public support address. Leave empty until a real mailbox exists. */
  contactEmail: "",
  /** Direct link to the Android app (APK). Set VITE_ANDROID_APK_URL at build time, or edit here. */
  androidApkUrl: ((import.meta.env.VITE_ANDROID_APK_URL as string | undefined) || "/downloads/zapa-mubas.apk").trim(),
  updated: "15 November 2026",
} as const;

export const absoluteUrl = (path = "/") => `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;

type SeoInput = { title: string; description?: string; path: string; noindex?: boolean };

/** Title, description, canonical, Open Graph and Twitter tags for a route's `head`. */
export function seo({ title, description = SITE.description, path, noindex = false }: SeoInput) {
  const url = absoluteUrl(path);
  const image = absoluteUrl("/og.jpg");
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE.name },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:locale", content: "en_MW" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export const organizationJsonLd = () =>
  JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: SITE.name,
        url: SITE.url,
        description: SITE.description,
        inLanguage: "en",
      },
      {
        "@type": "Organization",
        name: SITE.name,
        url: SITE.url,
        logo: absoluteUrl("/favicon.svg"),
        slogan: SITE.tagline,
      },
    ],
  });
