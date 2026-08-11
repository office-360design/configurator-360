import type { MetadataRoute } from "next";
import { configurators } from "../lib/configurators";
import { languageAlternates, SITE_URL } from "../lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-08-11T00:00:00+03:00");
  const staticPaths = ["/", "/about", "/contact"];
  const locales = ["en", "ro", "de"] as const;
  return [
    ...locales.flatMap((locale) => staticPaths.map((path) => ({
      url: `${SITE_URL}${locale === "en" ? "" : `/${locale}`}${path === "/" ? "" : path}`,
      lastModified: updated,
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 1 : .78,
      alternates: { languages: Object.fromEntries(Object.entries(languageAlternates(path)).map(([language, url]) => [language, `${SITE_URL}${url}`])) },
    }))),
    ...locales.flatMap((locale) => configurators.map((item) => ({
      url: `${SITE_URL}${locale === "en" ? "" : `/${locale}`}/configurators/${item.slug}`,
      lastModified: updated,
      changeFrequency: "monthly" as const,
      priority: .85,
      alternates: { languages: Object.fromEntries(Object.entries(languageAlternates(`/configurators/${item.slug}`)).map(([language, url]) => [language, `${SITE_URL}${url}`])) },
    }))),
  ];
}
