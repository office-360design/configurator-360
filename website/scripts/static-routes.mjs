import { readFileSync } from "node:fs";

export const locales = ["en", "ro", "de", "es", "fr", "it"];
// Public slugs of the presentation pages per locale (shared with lib/i18n.ts and the nginx redirects).
export const pageSlugs = JSON.parse(readFileSync(new URL("../lib/page-slugs.json", import.meta.url), "utf8"));
export const configurators = ["window", "hall", "fence", "tiles", "pergola", "roof", "solar", "chair", "cardbox", "bookshelf"];

export const pageRoutes = locales.flatMap((locale) => {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return [
    prefix || "/",
    `${prefix}/about`,
    `${prefix}/contact`,
    `${prefix}/pricing`,
    `${prefix}/book-a-demo`,
    ...configurators.map((slug) => `${prefix}/configurators/${slug}`),
  ];
});

export const metadataRoutes = [
  "/robots.txt",
  "/sitemap.xml",
];

/** Path of an internal (English) route on a locale's domain: /about → /chi-siamo for "it". */
export function localizedRoutePath(locale, route) {
  if (locale === "en") return route;
  const segments = route.split("/");
  const page = Object.values(pageSlugs.pages).find((slugs) => slugs.en === segments[1]);
  if (!page) return route;
  segments[1] = page[locale];
  if (page === pageSlugs.pages.configurators && segments[2]) segments[2] = pageSlugs.configurators[segments[2]]?.[locale] ?? segments[2];
  return segments.join("/");
}

/** Public path of an exported route: the /ro, /de … trees use their own language slugs. */
export function publicRoute(route) {
  const match = route.match(/^\/(ro|de|es|fr|it)(\/.*)?$/);
  if (!match) return route;
  return `/${match[1]}${match[2] ? localizedRoutePath(match[1], match[2]) : ""}`;
}

export function routeOutputPath(route) {
  if (route === "/") return "index.html";
  if (/\.[a-z0-9]+$/i.test(route)) return route.slice(1);
  return `${publicRoute(route).replace(/^\//, "")}/index.html`;
}
