export const locales = ["en", "ro", "de"];
export const configurators = ["pergola", "roof", "window", "hall", "solar"];

export const pageRoutes = locales.flatMap((locale) => {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return [
    prefix || "/",
    `${prefix}/about`,
    `${prefix}/contact`,
    ...configurators.map((slug) => `${prefix}/configurators/${slug}`),
  ];
});

export const metadataRoutes = [
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
];

export function routeOutputPath(route) {
  if (route === "/") return "index.html";
  if (/\.[a-z0-9]+$/i.test(route)) return route.slice(1);
  return `${route.replace(/^\//, "")}/index.html`;
}
