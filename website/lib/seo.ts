import type { Metadata } from "next";
import { localizedPath, type Locale } from "./i18n";

export const SITE_URL = "https://360configurator.com";
export const SITE_NAME = "360Configurator";
export const OG_IMAGE = "/og-360configurator.png";
export const SOCIAL_PROFILES = [
  "https://www.facebook.com/360configurator",
  "https://x.com/360configurator",
  "https://www.linkedin.com/company/360configurator/",
] as const;

const openGraphLocales: Record<Locale, string> = {
  en: "en_US",
  ro: "ro_RO",
  de: "de_DE",
};

export function languageAlternates(path = "/") {
  return {
    en: localizedPath("en", path),
    ro: localizedPath("ro", path),
    de: localizedPath("de", path),
    "x-default": localizedPath("en", path),
  };
}

export function pageMetadata({ locale, path = "/", title, description }: {
  locale: Locale;
  path?: string;
  title: string;
  description: string;
}): Metadata {
  const canonical = localizedPath(locale, path);
  return {
    title,
    description,
    alternates: { canonical, languages: languageAlternates(path) },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: SITE_NAME,
      locale: openGraphLocales[locale],
      alternateLocale: Object.values(openGraphLocales).filter((value) => value !== openGraphLocales[locale]),
      title: `${title} — ${SITE_NAME}`,
      description,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: `${SITE_NAME} spatial product configuration platform` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${SITE_NAME}`,
      description,
      images: [OG_IMAGE],
    },
  };
}

export function absoluteUrl(locale: Locale, path = "/") {
  return `${SITE_URL}${localizedPath(locale, path)}`;
}

export function breadcrumbSchema(locale: Locale, items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(locale, items.at(-1)?.path || "/")}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(locale, item.path),
    })),
  };
}

export function organizationSchema(locale: Locale, description: string) {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/360configurator.png`, width: 500, height: 250 },
    email: locale === "ro" ? "office@360configurator.ro" : "office@360configurator.com",
    description,
    areaServed: "Worldwide",
    sameAs: SOCIAL_PROFILES,
  };
}

export function websiteSchema(locale: Locale, description: string) {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description,
    inLanguage: locale,
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export function graphSchema(nodes: Record<string, unknown>[]) {
  return { "@context": "https://schema.org", "@graph": nodes };
}
