import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pageRoutes } from "./static-routes.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const websiteRoot = path.resolve(scriptDirectory, "..");
const clientRoot = path.join(websiteRoot, "dist", "client");
const exportedPagesRoot = path.join(websiteRoot, "outputs", "exported-pages");
const releaseRoot = path.join(websiteRoot, "outputs", "release-site");

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

const manifest = {
  generatedAt: new Date().toISOString(),
  canonicalOrigin: "https://360configurator.com",
  romanianRedirect: "https://360configurator.ro -> https://360configurator.com/ro",
  websiteRoutes: pageRoutes,
  externalConfigurators: {
    window: "https://aks.360configurator.com/window-configurator/",
    pergola: "https://aks.360configurator.com/pergola-configurator/",
    roof: "https://aks.360configurator.com/roof-configurator/",
    solar: "https://aks.360configurator.com/solar-configurator/",
    hall: "https://aks.360configurator.com/hall-configurator/",
  },
};
await writeFile(path.join(releaseRoot, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Assembled website-only static release: ${releaseRoot}`);
