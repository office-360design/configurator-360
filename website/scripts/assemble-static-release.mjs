import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pageRoutes } from "./static-routes.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const websiteRoot = path.resolve(scriptDirectory, "..");
const clientRoot = path.join(websiteRoot, "dist", "client");
const exportedPagesRoot = path.join(websiteRoot, "outputs", "exported-pages");
const releaseRoot = path.join(websiteRoot, "outputs", "release-site");

const localizedOrigins = {
  en: "https://www.360configurator.com",
  ro: "https://www.360configurator.ro",
  de: "https://www.360konfigurator.de",
};

const marketingConfiguratorSlugs = ["pergola", "roof", "window", "hall", "solar", "fence"];
const externalConfiguratorSlugs = [...marketingConfiguratorSlugs, "cardbox"];

const externalConfiguratorPaths = {
  en: {
    window: "/window-configurator/",
    pergola: "/pergola-configurator/",
    roof: "/roof-configurator/",
    solar: "/solar-configurator/",
    hall: "/hall-configurator/",
    fence: "/fence-configurator/",
    cardbox: "/cardbox-configurator/",
  },
  ro: {
    window: "/configurator-ferestre/",
    pergola: "/configurator-pergola/",
    roof: "/configurator-acoperis/",
    solar: "/configurator-solar/",
    hall: "/configurator-hala/",
    fence: "/configurator-garduri/",
    cardbox: "/configurator-cutii-carton/",
  },
  de: {
    window: "/fenster-konfigurator/",
    pergola: "/pergola-konfigurator/",
    roof: "/dach-konfigurator/",
    solar: "/solar-konfigurator/",
    hall: "/hallen-konfigurator/",
    fence: "/zaun-konfigurator/",
    cardbox: "/karton-konfigurator/",
  },
};

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sitemapUrls(locale) {
  const origin = localizedOrigins[locale];
  return [
    `${origin}/`,
    `${origin}/about`,
    `${origin}/contact`,
    `${origin}/pricing`,
    `${origin}/book-a-demo`,
    ...marketingConfiguratorSlugs.map((slug) => `${origin}/configurators/${slug}`),
    ...externalConfiguratorSlugs.map((slug) => `${origin}${externalConfiguratorPaths[locale][slug]}`),
  ];
}

function sitemapXml(locale) {
  const urls = sitemapUrls(locale);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url>\n    <loc>${xmlEscape(url)}</loc>\n  </url>`)
    .join("\n")}\n</urlset>\n`;
}

async function requireDirectory(directory, label) {
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Missing ${label}: ${directory}`);
}

await Promise.all([
  requireDirectory(clientRoot, "website client build"),
  requireDirectory(exportedPagesRoot, "static page export"),
]);

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });
await cp(clientRoot, releaseRoot, { recursive: true });
await cp(exportedPagesRoot, releaseRoot, { recursive: true, force: true });
await writeFile(path.join(releaseRoot, ".nojekyll"), "");

for (const locale of Object.keys(localizedOrigins)) {
  await writeFile(path.join(releaseRoot, `sitemap-${locale}.xml`), sitemapXml(locale));
}
// Keep the static/default sitemap coherent for direct previews and non-Nginx hosting.
await writeFile(path.join(releaseRoot, "sitemap.xml"), sitemapXml("en"));

const manifest = {
  generatedAt: new Date().toISOString(),
  canonicalOrigin: "https://www.360configurator.com",
  localizedOrigins,
  websiteRoutes: pageRoutes,
  sitemaps: Object.fromEntries(Object.entries(localizedOrigins).map(([locale, origin]) => [locale, `${origin}/sitemap.xml`])),
  externalConfigurators: Object.fromEntries(externalConfiguratorSlugs.map((slug) => [
    slug,
    Object.fromEntries(Object.entries(localizedOrigins).map(([locale, origin]) => [locale, `${origin}${externalConfiguratorPaths[locale][slug]}`])),
  ])),
};
await writeFile(path.join(releaseRoot, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Assembled website-only static release: ${releaseRoot}`);
