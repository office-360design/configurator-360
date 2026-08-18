import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..");

function fail(message) {
  console.error(`[window-importmap] ${message}`);
  process.exitCode = 1;
}

function validate(filePath, label) {
  if (!fs.existsSync(filePath)) return;

  const html = fs.readFileSync(filePath, "utf8");
  const importMaps = [...html.matchAll(/<script\b[^>]*\btype=["']importmap["'][^>]*>/gi)];
  if (importMaps.length !== 1) {
    fail(`${label}: expected exactly one import map, found ${importMaps.length}.`);
    return;
  }

  const importMapIndex = importMaps[0].index;
  const moduleScripts = [...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*>/gi)];
  const modulePreloads = [...html.matchAll(/<link\b[^>]*\brel=["'][^"']*\bmodulepreload\b[^"']*["'][^>]*>/gi)];

  const prematureLoads = [...moduleScripts, ...modulePreloads]
    .filter((match) => match.index < importMapIndex)
    .sort((a, b) => a.index - b.index);

  if (prematureLoads.length) {
    const first = prematureLoads[0][0].replace(/\s+/g, " ").trim();
    fail(`${label}: module loading starts before the import map: ${first}`);
    return;
  }

  if (!html.includes('"three": "./lib/three.module.js"')) {
    fail(`${label}: import map no longer maps the bare "three" specifier.`);
    return;
  }

  console.log(`[window-importmap] OK ${label}: import map precedes ${moduleScripts.length} module script(s).`);
}

validate(path.join(projectRoot, "src/client/index.html"), "src/client/index.html");
validate(path.join(projectRoot, "dist/site/index.html"), "dist/site/index.html");
