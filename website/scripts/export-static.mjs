import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { metadataRoutes, pageRoutes, routeOutputPath } from "./static-routes.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const websiteRoot = path.resolve(scriptDirectory, "..");
const serverEntry = path.join(websiteRoot, "dist", "server", "index.js");
const clientRoot = path.join(websiteRoot, "dist", "client");
const exportRoot = path.join(websiteRoot, "outputs", "exported-pages");

await stat(serverEntry).catch(() => {
  throw new Error("Missing website server build. Run `npm run build` before exporting.");
});

await rm(exportRoot, { recursive: true, force: true });
await mkdir(exportRoot, { recursive: true });

const moduleUrl = pathToFileURL(serverEntry);
moduleUrl.searchParams.set("static-export", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(moduleUrl.href);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const assets = {
  async fetch(request) {
    const url = new URL(request.url);
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const candidate = path.resolve(clientRoot, relativePath || "index.html");
    if (candidate !== clientRoot && !candidate.startsWith(`${clientRoot}${path.sep}`)) {
      return new Response("Not found", { status: 404 });
    }
    try {
      const body = await readFile(candidate);
      const contentType = mimeTypes[path.extname(candidate)] || "application/octet-stream";
      return new Response(body, { headers: { "content-type": contentType } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

async function renderRoute(route, { allowNotFound = false } = {}) {
  const response = await worker.fetch(
    new Request(`https://360configurator.com${route}`, {
      headers: { accept: "text/html,application/xhtml+xml" },
    }),
    { ASSETS: assets },
    executionContext,
  );
  if (!response.ok && !(allowNotFound && response.status === 404)) {
    throw new Error(`Static render failed for ${route}: HTTP ${response.status}`);
  }
  const body = await response.text();
  if (!body.trim()) throw new Error(`Static render returned an empty body for ${route}`);
  return { body, response };
}

function languageForRoute(route) {
  if (route === "/ro" || route.startsWith("/ro/")) return "ro";
  if (route === "/de" || route.startsWith("/de/")) return "de";
  return "en";
}

function normalizeLocalizedPublicUrls(html) {
  return html
    .replaceAll(
      "https://www.360configurator.com/ro",
      "https://www.360configurator.ro",
    )
    .replaceAll(
      "https://360configurator.com/ro",
      "https://www.360configurator.ro",
    )
    .replaceAll(
      "https://www.360configurator.com/de",
      "https://www.360configurator.de",
    )
    .replaceAll(
      "https://360configurator.com/de",
      "https://www.360configurator.de",
    );
}

for (const route of [...pageRoutes, ...metadataRoutes]) {
  const { body } = await renderRoute(route);
  const destination = path.join(exportRoot, routeOutputPath(route));
  await mkdir(path.dirname(destination), { recursive: true });
  let localizedBody = pageRoutes.includes(route)
    ? body.replace(
        /<html lang=["'][^"']*["']/,
        `<html lang="${languageForRoute(route)}"`,
      )
    : body;

  localizedBody = normalizeLocalizedPublicUrls(localizedBody);

  await writeFile(destination, localizedBody);
}

const { body: notFound } = await renderRoute("/__static-export-not-found__", { allowNotFound: true });
await writeFile(path.join(exportRoot, "404.html"), notFound);

console.log(`Exported ${pageRoutes.length} pages and ${metadataRoutes.length} metadata routes.`);
console.log(`Output: ${exportRoot}`);
