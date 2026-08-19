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

let renderSequence = 0;

async function loadFreshWorker(route, attempt) {
  const moduleUrl = pathToFileURL(serverEntry);
  moduleUrl.searchParams.set(
    "static-export",
    `${process.pid}-${Date.now()}-${renderSequence++}-${attempt}-${encodeURIComponent(route)}`,
  );
  const { default: worker } = await import(moduleUrl.href);
  return worker;
}

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

const MAX_RENDER_ATTEMPTS = 3;
const BROKEN_RENDER_MARKERS = [
  "This page couldn’t load",
  "This page couldn't load",
  "Connection closed.",
];

function assertCompleteRender(route, body) {
  if (!body.trim()) throw new Error(`Static render returned an empty body for ${route}`);

  const brokenMarker = BROKEN_RENDER_MARKERS.find((marker) => body.includes(marker));
  if (brokenMarker) {
    throw new Error(`Static render for ${route} contains a broken RSC marker: ${brokenMarker}`);
  }

  if (pageRoutes.includes(route) && !body.includes("site-shell")) {
    throw new Error(`Static render for ${route} is missing the expected site shell.`);
  }

  if (route.includes("/configurators/") && !body.includes("detail-page")) {
    throw new Error(`Static render for ${route} is missing the configurator detail page.`);
  }
}

async function renderRoute(route, { allowNotFound = false } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt += 1) {
    try {
      // Vinext's App Router build uses React Server Components. Render each
      // static route through a fresh handler instance so request/stream state
      // cannot leak from a previously exported route.
      const worker = await loadFreshWorker(route, attempt);
      const response = await worker.fetch(
        new Request(`https://360configurator.com${route}`, {
          headers: { accept: "text/html,application/xhtml+xml" },
        }),
        { ASSETS: assets },
        { ...executionContext },
      );

      if (!response.ok && !(allowNotFound && response.status === 404)) {
        throw new Error(`Static render failed for ${route}: HTTP ${response.status}`);
      }

      const body = await response.text();
      if (!allowNotFound) assertCompleteRender(route, body);
      else if (!body.trim()) throw new Error(`Static render returned an empty body for ${route}`);

      return { body, response };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RENDER_ATTEMPTS) {
        console.warn(
          `Static render attempt ${attempt}/${MAX_RENDER_ATTEMPTS} failed for ${route}:`,
          error instanceof Error ? error.message : error,
        );
        await new Promise((resolve) => setTimeout(resolve, 75 * attempt));
      }
    }
  }

  throw new Error(
    `Static render failed for ${route} after ${MAX_RENDER_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : lastError
    }`,
  );
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
      "https://www.360konfigurator.de",
    )
    .replaceAll(
      "https://360configurator.com/de",
      "https://www.360konfigurator.de",
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
