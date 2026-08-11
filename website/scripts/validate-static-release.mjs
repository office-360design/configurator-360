import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { metadataRoutes, pageRoutes, routeOutputPath } from "./static-routes.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const websiteRoot = path.resolve(scriptDirectory, "..");
const releaseRoot = path.join(websiteRoot, "outputs", "release-site");
const failures = [];

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

const htmlFiles = [];
async function collectHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectHtml(absolute);
    else if (entry.isFile() && entry.name.endsWith(".html")) htmlFiles.push(absolute);
  }
}
await collectHtml(releaseRoot);

function localTarget(value, htmlFile) {
  const clean = value.split("#", 1)[0].split("?", 1)[0];
  if (!clean || /^(?:[a-z]+:|\/\/|#)/i.test(clean)) return null;
  const absolute = clean.startsWith("/")
    ? path.join(releaseRoot, clean.replace(/^\/+/, ""))
    : path.resolve(path.dirname(htmlFile), clean);
  if (absolute !== releaseRoot && !absolute.startsWith(`${releaseRoot}${path.sep}`)) return null;
  return absolute;
}

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8");
  const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const reference of references) {
    const target = localTarget(reference, htmlFile);
    if (!target) continue;
    const info = await stat(target).catch(() => null);
    if (info?.isFile()) continue;
    if (info?.isDirectory() && (await isFile(path.join(target, "index.html")))) continue;
    if (!path.extname(target) && (await isFile(path.join(target, "index.html")))) continue;
    failures.push(`${path.relative(releaseRoot, htmlFile)} -> ${reference}`);
  }
}

for (const route of pageRoutes) {
  const html = await readFile(path.join(releaseRoot, routeOutputPath(route)), "utf8");
  const expectedLanguage = route === "/ro" || route.startsWith("/ro/") ? "ro" : route === "/de" || route.startsWith("/de/") ? "de" : "en";
  if (!html.includes("https://360configurator.com")) failures.push(`${route} lacks the canonical .com origin`);
  if (html.includes("https://360configurator.ro/#")) failures.push(`${route} contains legacy .ro schema identifiers`);
  if (!html.includes(`<html lang="${expectedLanguage}"`)) failures.push(`${route} has an incorrect document language; expected ${expectedLanguage}`);
}

if (failures.length) {
  console.error("Static release validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${pageRoutes.length} website pages, ${metadataRoutes.length} metadata routes, ${htmlFiles.length} HTML files, canonical metadata, and internal links.`);
}
