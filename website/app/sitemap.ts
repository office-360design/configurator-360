import type { MetadataRoute } from "next";
import { configurators } from "../lib/configurators";
import { absoluteUrl, languageAlternates } from "../lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-08-11T00:00:00+03:00");
  const staticPaths = ["/", "/about", "/contact"];
  const locales = ["en", "ro", "de"] as const;
  return [
    ...locales.flatMap((locale) => staticPaths.map((path) => ({
      url: absoluteUrl(locale, path),
      lastModified: updated,
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 1 : .78,
      alternates: { languages: languageAlternates(path) },
    }))),
    ...locales.flatMap((locale) => configurators.map((item) => ({
      url: absoluteUrl(locale, `/configurators/${item.slug}`),
      lastModified: updated,
      changeFrequency: "monthly" as const,
      priority: .85,
      alternates: { languages: languageAlternates(`/configurators/${item.slug}`) },
    }))),
  ];
}
