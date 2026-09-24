import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const releaseRoot = path.join(root, "website", "outputs", "release-site");

const routes = [
  "/configurators/roof",
  "/ro/configurators/roof",
  "/de/configurators/roof",
  "/configurators/pergola",
  "/configurators/window",
];

function routeFile(route) {
  return path.join(releaseRoot, route.replace(/^\/+/, ""), "index.html");
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function normalizePreview(value, limit = 700) {
  return value
    .slice(0, limit)
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n\n");
}

function extractScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((match, index) => ({
    index,
    attrs: (match[1] || "").trim(),
    body: match[2] || "",
  }));
}

function interesting(script) {
  const text = `${script.attrs}\n${script.body}`;
  return /rsc|flight|react\.server|readablestream|transformstream|enqueue|controller|bootstrap|vite/i.test(text);
}

function firstDifference(a, b) {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i += 1;
  if (i === a.length && i === b.length) return null;
  return i;
}

const routeData = new Map();

for (const route of routes) {
  const file = routeFile(route);
  if (!fs.existsSync(file)) {
    console.log(`[inline-rsc] MISSING ${route}: ${file}`);
    continue;
  }

  const html = fs.readFileSync(file, "utf8");
  const scripts = extractScripts(html);
  const matches = scripts.filter(interesting);

  routeData.set(route, { html, scripts, matches });

  console.log(`\n=== ${route} ===`);
  console.log(`htmlBytes=${Buffer.byteLength(html)} totalScripts=${scripts.length} interestingScripts=${matches.length}`);

  for (const script of matches) {
    console.log(
      `\n--- script #${script.index} bytes=${Buffer.byteLength(script.body)} sha=${sha(script.body)} attrs=${JSON.stringify(script.attrs)} ---`
    );
    console.log(normalizePreview(script.body));
  }
}

const en = routeData.get("/configurators/roof");
const ro = routeData.get("/ro/configurators/roof");
const de = routeData.get("/de/configurators/roof");

function compare(label, left, right) {
  if (!left || !right) return;
  console.log(`\n=== ${label} script-by-script comparison ===`);
  const count = Math.max(left.scripts.length, right.scripts.length);

  for (let i = 0; i < count; i += 1) {
    const a = left.scripts[i];
    const b = right.scripts[i];

    if (!a || !b) {
      console.log(`#${i}: ${!a ? "missing on left" : "missing on right"}`);
      continue;
    }

    const attrsSame = a.attrs === b.attrs;
    const bodySame = a.body === b.body;
    if (attrsSame && bodySame) continue;

    const diffAt = firstDifference(a.body, b.body);
    const around = diffAt === null ? 0 : Math.max(0, diffAt - 180);

    console.log(
      `#${i}: attrsSame=${attrsSame} leftBytes=${Buffer.byteLength(a.body)} rightBytes=${Buffer.byteLength(b.body)} ` +
      `leftSha=${sha(a.body)} rightSha=${sha(b.body)} firstBodyDiff=${diffAt}`
    );
    if (!attrsSame) {
      console.log(`  left attrs:  ${a.attrs}`);
      console.log(`  right attrs: ${b.attrs}`);
    }
    if (diffAt !== null) {
      console.log(`  left around diff:  ${JSON.stringify(a.body.slice(around, around + 500))}`);
      console.log(`  right around diff: ${JSON.stringify(b.body.slice(around, around + 500))}`);
    }
  }
}

compare("EN roof vs RO roof", en, ro);
compare("EN roof vs DE roof", en, de);

if (en) {
  console.log("\n=== EN roof globals/bootstrap tokens ===");
  const tokens = [...new Set(
    [...en.html.matchAll(/\b(?:globalThis|self|window)\.([A-Za-z_$][\w$]*)/g)]
      .map((match) => match[1])
  )].sort();

  console.log(tokens.length ? tokens.join("\n") : "(none found)");
}
