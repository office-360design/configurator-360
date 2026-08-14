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
  canonicalOrigin: "https://www.360configurator.com",
  localizedOrigins: { en: "https://www.360configurator.com", ro: "https://www.360configurator.ro", de: "https://www.360configurator.de" },
  websiteRoutes: pageRoutes,
  externalConfigurators: {
    window: { en: "https://www.360configurator.com/window-configurator/", ro: "https://www.360configurator.ro/configurator-ferestre/", de: "https://www.360configurator.de/fenster-konfigurator/" },
    pergola: { en: "https://www.360configurator.com/pergola-configurator/", ro: "https://www.360configurator.ro/configurator-pergola/", de: "https://www.360configurator.de/pergola-konfigurator/" },
    roof: { en: "https://www.360configurator.com/roof-configurator/", ro: "https://www.360configurator.ro/configurator-acoperis/", de: "https://www.360configurator.de/dach-konfigurator/" },
    solar: { en: "https://www.360configurator.com/solar-configurator/", ro: "https://www.360configurator.ro/configurator-solar/", de: "https://www.360configurator.de/solar-konfigurator/" },
    hall: { en: "https://www.360configurator.com/hall-configurator/", ro: "https://www.360configurator.ro/configurator-hala/", de: "https://www.360configurator.de/hallen-konfigurator/" },
  },
};
await writeFile(path.join(releaseRoot, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Assembled website-only static release: ${releaseRoot}`);
