import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..");
const releaseRoot = path.join(projectRoot, "website", "outputs", "release-site");

const routes = [
  "/configurators/window",
  "/configurators/pergola",
  "/configurators/roof",
  "/configurators/hall",
  "/configurators/solar",
  "/ro/configurators/window",
  "/ro/configurators/pergola",
  "/ro/configurators/roof",
  "/ro/configurators/hall",
  "/ro/configurators/solar",
  "/de/configurators/window",
  "/de/configurators/pergola",
  "/de/configurators/roof",
  "/de/configurators/hall",
  "/de/configurators/solar",
];

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
};

function safePathname(requestUrl = "/") {
  try {
    return decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  } catch {
    return "/404.html";
  }
}

async function resolveFile(requestUrl) {
  const pathname = safePathname(requestUrl).replace(/^\/+/, "");
  const requested = path.resolve(releaseRoot, pathname || "index.html");

  if (requested !== releaseRoot && !requested.startsWith(`${releaseRoot}${path.sep}`)) {
    return path.join(releaseRoot, "404.html");
  }

  const info = await stat(requested).catch(() => null);
  if (info?.isFile()) return requested;
  if (info?.isDirectory()) {
    const indexFile = path.join(requested, "index.html");
    if ((await stat(indexFile).catch(() => null))?.isFile()) return indexFile;
  }

  const routeIndex = path.join(requested, "index.html");
  if ((await stat(routeIndex).catch(() => null))?.isFile()) return routeIndex;
  return path.join(releaseRoot, "404.html");
}

const releaseInfo = await stat(releaseRoot).catch(() => null);
if (!releaseInfo?.isDirectory()) {
  throw new Error("Missing website/outputs/release-site. Run `npm run release:static --prefix website` first.");
}

const server = createServer(async (request, response) => {
  const file = await resolveFile(request.url);
  const missing = path.basename(file) === "404.html" && safePathname(request.url) !== "/404.html";
  response.writeHead(missing ? 404 : 200, {
    "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const route of routes) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(`${origin}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(1200);

    const state = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      h1: [...document.querySelectorAll("h1")].map((node) => node.textContent?.trim() || ""),
      title: document.title,
      detailPage: Boolean(document.querySelector(".detail-page")),
      bodyText: document.body.innerText,
    }));

    const expectedLang = route.startsWith("/ro/") ? "ro" : route.startsWith("/de/") ? "de" : "en";
    const connectionErrors = [...consoleErrors, ...pageErrors].filter((message) =>
      /connection closed|couldn.?t load/i.test(message)
    );

    if (!response || !response.ok()) failures.push(`${route}: HTTP ${response?.status() ?? "no response"}`);
    if (state.lang !== expectedLang) failures.push(`${route}: expected lang=${expectedLang}, got ${state.lang || "(empty)"}`);
    if (!state.detailPage) failures.push(`${route}: .detail-page disappeared after hydration`);
    if (state.h1.some((value) => /this page couldn.?t load/i.test(value))) failures.push(`${route}: framework error UI replaced the page`);
    if (/this page couldn.?t load/i.test(state.bodyText)) failures.push(`${route}: body contains framework error UI`);
    for (const error of connectionErrors) failures.push(`${route}: ${error}`);

    console.log(
      `[website-hydration] ${failures.some((failure) => failure.startsWith(`${route}:`)) ? "FAIL" : "OK"} ${route}`
    );

    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error("\nWebsite hydration validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\nValidated hydration for ${routes.length} localized configurator marketing pages.`);
}
