import type { MetadataRoute } from "next";
import { configurators } from "../lib/configurators";
import { configuratorUrl, localeOrigins } from "../lib/i18n";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = localeOrigins.en;
  const staticPaths = ["/", "/about", "/contact"];

  return [
    ...staticPaths.map((path) => ({
      url: `${origin}${path}`,
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 1 : .78,
    })),
    ...configurators.map((item) => ({
      url: `${origin}/configurators/${item.slug}`,
      changeFrequency: "monthly" as const,
      priority: .9,
    })),
    ...configurators.map((item) => ({
      url: configuratorUrl("en", item.slug),
      changeFrequency: "monthly" as const,
      priority: .72,
    })),
  ];
}
