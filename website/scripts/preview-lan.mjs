import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const releaseRoot = path.resolve(scriptDirectory, "..", "outputs", "release-site");
const host = "0.0.0.0";
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
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

const server = createServer(async (request, response) => {
  const file = await resolveFile(request.url);
  const isNotFound = path.basename(file) === "404.html" && safePathname(request.url) !== "/404.html";
  response.writeHead(isNotFound ? 404 : 200, {
    "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  createReadStream(file).pipe(response);
});

function macAddress(interfaceName) {
  if (process.platform !== "darwin") return null;
  try {
    return execFileSync("ipconfig", ["getifaddr", interfaceName], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

server.listen(port, host, () => {
  const detectedAddresses = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry?.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
  const addresses = [macAddress("en0"), macAddress("en1"), ...detectedAddresses]
    .filter(Boolean);

  console.log("\n360Configurator production LAN preview");
  console.log(`Local:   http://localhost:${port}`);
  for (const address of [...new Set(addresses)]) {
    console.log(`Network: http://${address}:${port}`);
  }
  console.log("\nConnect the phone to the same Wi-Fi network. Press Ctrl+C to stop.\n");
});
