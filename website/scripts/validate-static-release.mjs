import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localizedRoutePath, metadataRoutes, pageRoutes, routeOutputPath } from "./static-routes.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const websiteRoot = path.resolve(scriptDirectory, "..");
const workspaceRoot = path.resolve(websiteRoot, "..");
const releaseRoot = path.join(websiteRoot, "outputs", "release-site");
const failures = [];
// Local website-only work may not have compiled sibling apps. This explicit mode
// validates their source paths; CI/default validation still requires built apps.
const sourceApps = process.argv.includes("--source-apps");

// The website-only release is composed with these sibling applications/assets
// later in the Pages/Cloud Run workflows. Validate references against the exact
// sources that will be mounted into the final site instead of treating them as
// broken website-release links.
const composedSiteMounts = Object.freeze([
  Object.freeze({
    prefix: "/shared-ui/",
    root: path.join(workspaceRoot, "shared-ui"),
  }),
  Object.freeze({
    prefix: "/window-configurator/",
    root: sourceApps ? path.join(workspaceRoot, "window-configurator", "src", "client") : path.join(workspaceRoot, "dist", "window-configurator-build"),
  }),
  Object.freeze({
    prefix: "/fence-configurator/",
    root: path.join(workspaceRoot, "fence-configurator"),
  }),
  Object.freeze({
    prefix: "/pergola-configurator/",
    root: path.join(workspaceRoot, "pergola-configurator", "dist"),
  }),
]);

async function isFile(file) {
  return (await stat(file).catch(() => null))?.isFile() || false;
}

async function requireFile(relativePath, label = relativePath) {
  if (!(await isFile(path.join(releaseRoot, relativePath)))) failures.push(`Missing ${label}: ${relativePath}`);
}

for (const route of pageRoutes) await requireFile(routeOutputPath(route), `page ${route}`);
for (const route of metadataRoutes) await requireFile(routeOutputPath(route), `metadata ${route}`);
await requireFile("404.html");
await requireFile(".nojekyll");
await requireFile("release-manifest.json");
await requireFile("sitemap-en.xml");
await requireFile("sitemap-ro.xml");
await requireFile("sitemap-de.xml");
await requireFile("sitemap-es.xml");
await requireFile("sitemap-fr.xml");
await requireFile("sitemap-it.xml");
for (const suffix of ["", "-ro", "-de", "-es", "-fr", "-it"]) {
  await requireFile(`llms${suffix}.txt`);
  await requireFile(`llms-full${suffix}.txt`);
}
await requireFile("favicon-32x32.png");
await requireFile("favicon-192x192.png");
await requireFile("favicon-512x512.png");
await requireFile("apple-touch-icon.png");

// Independent copy of the public locale contract (docs/deployment/NEW_LOCALES_ES_FR_IT.md),
// in the required order. Keep it hand-written so the validator does not trust the build.
const localeContract = [
  { locale: "en", hreflang: "en", origin: "https://www.360configurator.com" },
  { locale: "ro", hreflang: "ro-RO", origin: "https://www.360configurator.ro" },
  { locale: "de", hreflang: "de-DE", origin: "https://www.360konfigurator.de" },
  { locale: "es", hreflang: "es-ES", origin: "https://www.360configurador.es" },
  { locale: "fr", hreflang: "fr-FR", origin: "https://www.360configurateur.fr" },
  { locale: "it", hreflang: "it-IT", origin: "https://www.360configuratore.it" },
];
const prefixedLocales = localeContract.map(({ locale }) => locale).filter((locale) => locale !== "en");
const originByLocale = Object.fromEntries(localeContract.map(({ locale, origin }) => [locale, origin]));
const localePrefixPattern = new RegExp(`^\\/(${prefixedLocales.join("|")})(?=\\/|$)`);
const legacyLocalePrefixedUrlPattern = new RegExp(`https:\\/\\/(?:www\\.)?360configurator\\.com\\/(?:${prefixedLocales.join("|")})(?![A-Za-z0-9_-])`);

const htmlFiles = [];
async function collectHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectHtml(absolute);
    else if (entry.isFile() && entry.name.endsWith(".html")) htmlFiles.push(absolute);
  }
}
await collectHtml(releaseRoot);

function cleanReference(value) {
  return value.split("#", 1)[0].split("?", 1)[0];
}

function localTarget(value, htmlFile) {
  const clean = cleanReference(value);
  if (!clean || /^(?:[a-z]+:|\/\/|#)/i.test(clean)) return null;
  const absolute = clean.startsWith("/")
    ? path.join(releaseRoot, clean.replace(/^\/+/, ""))
    : path.resolve(path.dirname(htmlFile), clean);
  if (absolute !== releaseRoot && !absolute.startsWith(`${releaseRoot}${path.sep}`)) return null;
  return absolute;
}

function composedSiteTarget(value) {
  const clean = cleanReference(value);
  if (!clean.startsWith("/")) return null;

  for (const mount of composedSiteMounts) {
    if (!clean.startsWith(mount.prefix)) continue;
    const relative = clean.slice(mount.prefix.length);
    const target = path.resolve(mount.root, relative || ".");
    if (target !== mount.root && !target.startsWith(`${mount.root}${path.sep}`)) return null;
    return target;
  }

  return null;
}

async function resolvesToStaticTarget(target) {
  if (!target) return false;
  const info = await stat(target).catch(() => null);
  if (info?.isFile()) return true;
  if (info?.isDirectory() && (await isFile(path.join(target, "index.html")))) return true;
  if (!path.extname(target) && (await isFile(path.join(target, "index.html")))) return true;
  return false;
}

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8");
  const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const reference of references) {
    const target = localTarget(reference, htmlFile);
    if (!target) continue;
    // Like nginx ($site_prefix), a root path on a country page resolves in that locale's tree first.
    const treeLocale = path.relative(releaseRoot, htmlFile).split(path.sep)[0];
    const clean = cleanReference(reference);
    // A country page links to its own slugs; an English slug there would only work through the 301.
    if (prefixedLocales.includes(treeLocale) && clean.startsWith("/")) {
      const englishRoute = clean.replace(/\/$/, "");
      const localized = localizedRoutePath(treeLocale, englishRoute);
      if (localized !== englishRoute) failures.push(`${path.relative(releaseRoot, htmlFile)} links to the English slug ${reference} instead of ${localized}`);
    }
    if (prefixedLocales.includes(treeLocale) && clean.startsWith("/") && await resolvesToStaticTarget(path.join(releaseRoot, treeLocale, clean))) continue;
    if (await resolvesToStaticTarget(target)) continue;

    const composedTarget = composedSiteTarget(reference);
    if (await resolvesToStaticTarget(composedTarget)) continue;

    failures.push(`${path.relative(releaseRoot, htmlFile)} -> ${reference}`);
  }
}

const brokenRenderMarkers = [
  "This page couldn’t load",
  "This page couldn't load",
  "Connection closed.",
];

for (const route of pageRoutes) {
  const html = await readFile(path.join(releaseRoot, routeOutputPath(route)), "utf8");

  for (const marker of brokenRenderMarkers) {
    if (html.includes(marker)) failures.push(`${route} contains a broken RSC/static-render marker: ${marker}`);
  }

  if (!html.includes("site-shell")) failures.push(`${route} is missing the expected site shell`);
  if (route.includes("/configurators/") && !html.includes("detail-page")) {
    failures.push(`${route} is missing the configurator detail-page shell`);
  }
  const expectedLanguage = route.match(localePrefixPattern)?.[1] ?? "en";
  const expectedOrigin = originByLocale[expectedLanguage];
  const publicPath = route.replace(localePrefixPattern, "") || "/";
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
  const canonicalTags = [...head.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi)];
  const tagUrl = tag => tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
  const matchesUrl = (tag, expected) => {
    try { return new URL(tagUrl(tag)).href === new URL(expected).href; } catch { return false; }
  };
  // publicPath is the internal (English) route; every domain shows it under its own slugs.
  if (canonicalTags.length !== 1 || !matchesUrl(canonicalTags[0]?.[0] || "", `${expectedOrigin}${localizedRoutePath(expectedLanguage, publicPath)}`)) {
    failures.push(`${route} must have exactly one self-canonical in the initial HTML head`);
  }
  for (const [language, alternateOrigin, alternateLocale] of [...localeContract.map(({ hreflang, origin, locale }) => [hreflang, origin, locale]), ["x-default", "https://www.360configurator.com", "en"]]) {
    const alternates = [...head.matchAll(/<link\b[^>]*rel=["']alternate["'][^>]*>/gi)].map(match => match[0]);
    if (!alternates.some(tag => new RegExp(`hreflang=["']${language}["']`, "i").test(tag) && matchesUrl(tag, `${alternateOrigin}${localizedRoutePath(alternateLocale, publicPath)}`))) {
      failures.push(`${route} lacks reciprocal ${language} hreflang in the initial HTML head`);
    }
  }
  if (!/<meta\b[^>]*name=["']robots["'][^>]*content=["']index, follow/i.test(head)) {
    failures.push(`${route} lacks indexable robots metadata in the initial HTML head`);
  }
  if (!html.includes(expectedOrigin)) failures.push(`${route} lacks its localized canonical origin ${expectedOrigin}`);
  if (legacyLocalePrefixedUrlPattern.test(html)) failures.push(`${route} contains a legacy locale-prefixed .com URL`);
  if (html.includes("https://www.360configurator.roof-configurator/")) {
    failures.push(`${route} contains the corrupted English roof configurator URL`);
  }
  if (
    route === "/configurators/roof" &&
    !html.includes("https://www.360configurator.com/roof-configurator/")
  ) {
    failures.push(`${route} is missing the correct English roof configurator URL`);
  }
  if (!html.includes(`<html lang="${expectedLanguage}"`)) failures.push(`${route} has an incorrect document language; expected ${expectedLanguage}`);
  if (route === "/" || prefixedLocales.some((locale) => route === `/${locale}`)) {
    for (const slug of ["pergola", "roof", "window", "hall", "solar", "fence", "chair", "cardbox", "bookshelf", "tiles"]) {
      if (!html.includes(`href="${localizedRoutePath(expectedLanguage, `/configurators/${slug}`)}"`)) failures.push(`${route} lacks crawlable product link for ${slug}`);
    }
  }
}

const sitemapExpectations = {
  en: {
    origin: "https://www.360configurator.com",
    apps: ["/pergola-configurator/", "/roof-configurator/", "/window-configurator/", "/hall-configurator/", "/solar-configurator/", "/fence-configurator/", "/cardbox-configurator/", "/chair-configurator/"],
  },
  ro: {
    origin: "https://www.360configurator.ro",
    apps: ["/configurator-pergola/", "/configurator-acoperis/", "/configurator-ferestre/", "/configurator-hala/", "/configurator-solar/", "/configurator-garduri/", "/configurator-cutii-carton/", "/configurator-scaune/"],
  },
  de: {
    origin: "https://www.360konfigurator.de",
    apps: ["/pergola-konfigurator/", "/dach-konfigurator/", "/fenster-konfigurator/", "/hallen-konfigurator/", "/solar-konfigurator/", "/zaun-konfigurator/", "/karton-konfigurator/", "/stuhl-konfigurator/"],
  },
  es: {
    origin: "https://www.360configurador.es",
    apps: ["/configurador-pergolas/", "/configurador-tejados/", "/configurador-ventanas/", "/configurador-naves/", "/configurador-solar/", "/configurador-vallas/", "/configurador-cajas-carton/", "/configurador-sillas/"],
  },
  fr: {
    origin: "https://www.360configurateur.fr",
    apps: ["/configurateur-pergola/", "/configurateur-toiture/", "/configurateur-fenetres/", "/configurateur-hangar/", "/configurateur-solaire/", "/configurateur-cloture/", "/configurateur-cartons/", "/configurateur-chaises/"],
  },
  it: {
    origin: "https://www.360configuratore.it",
    apps: ["/configuratore-pergola/", "/configuratore-tetto/", "/configuratore-finestre/", "/configuratore-capannone/", "/configuratore-fotovoltaico/", "/configuratore-recinzioni/", "/configuratore-scatole/", "/configuratore-sedie/"],
  },
};
const marketingSlugs = ["pergola", "roof", "window", "hall", "solar", "fence", "chair", "cardbox", "bookshelf", "tiles"];
const allOrigins = Object.values(sitemapExpectations).map(({ origin }) => origin);

for (const [locale, { origin, apps }] of Object.entries(sitemapExpectations)) {
  const xml = await readFile(path.join(releaseRoot, `sitemap-${locale}.xml`), "utf8");
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const page = (route) => `${origin}${localizedRoutePath(locale, route)}`;
  const expected = [
    `${origin}/`,
    page("/about"),
    page("/contact"),
    page("/pricing"),
    page("/book-a-demo"),
    ...marketingSlugs.map((slug) => page(`/configurators/${slug}`)),
    ...apps.map((appPath) => `${origin}${appPath}`),
  ];

  if (urls.length !== expected.length) failures.push(`sitemap-${locale}.xml has ${urls.length} URLs; expected ${expected.length}`);
  for (const url of expected) if (!urls.includes(url)) failures.push(`sitemap-${locale}.xml is missing ${url}`);
  for (const url of urls) {
    if (!url.startsWith(`${origin}/`)) failures.push(`sitemap-${locale}.xml contains a foreign-domain URL: ${url}`);
  }
  for (const foreignOrigin of allOrigins.filter((candidate) => candidate !== origin)) {
    if (xml.includes(foreignOrigin)) failures.push(`sitemap-${locale}.xml contains foreign origin ${foreignOrigin}`);
  }
}

// Independent spot checks of the localized slugs (not derived from lib/page-slugs.json).
for (const [locale, present, absent] of [["it", "/chi-siamo", "/about"], ["de", "/konfiguratoren/fenster", "/configurators/window"], ["ro", "/despre-noi", "/about"]]) {
  const xml = await readFile(path.join(releaseRoot, `sitemap-${locale}.xml`), "utf8");
  if (!xml.includes(`${originByLocale[locale]}${present}<`)) failures.push(`sitemap-${locale}.xml lacks the localized page ${present}`);
  if (xml.includes(`${originByLocale[locale]}${absent}<`)) failures.push(`sitemap-${locale}.xml still lists the English slug ${absent}`);
}

const defaultSitemap = await readFile(path.join(releaseRoot, "sitemap.xml"), "utf8");
const englishSitemap = await readFile(path.join(releaseRoot, "sitemap-en.xml"), "utf8");
if (defaultSitemap !== englishSitemap) failures.push("default sitemap.xml does not match sitemap-en.xml");

if (failures.length) {
  console.error("Static release validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${pageRoutes.length} website pages, ${metadataRoutes.length} metadata routes, ${htmlFiles.length} HTML files, canonical metadata, and internal/composed-site links${sourceApps ? " (window app source paths; compiled app not validated)" : ""}.`);
}
