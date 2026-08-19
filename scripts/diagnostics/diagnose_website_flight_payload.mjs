import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
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

function extractFlightPushes(html, route) {
  const scriptBodies = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] || "")
    .filter((body) => body.includes("__next_f.push"));

  const pushes = [];
  const sandbox = {
    self: {
      __next_f: {
        push(value) {
          pushes.push(value);
          return pushes.length;
        },
      },
    },
  };

  for (const [index, body] of scriptBodies.entries()) {
    try {
      vm.runInNewContext(body, sandbox, { timeout: 1000, filename: `${route}#flight-${index}` });
    } catch (error) {
      console.log(`[flight-diag] WARN ${route} inline script ${index} could not be evaluated: ${error.message}`);
    }
  }

  return pushes;
}

function flightText(pushes) {
  return pushes
    .filter((entry) => Array.isArray(entry) && entry[0] === 1 && typeof entry[1] === "string")
    .map((entry) => entry[1])
    .join("");
}

function parseRows(text) {
  const rows = [];
  // Flight text rows are newline-delimited and normally begin with a hex id + colon.
  // Keep malformed/non-row lines separately; a truncated tail is especially useful.
  for (const line of text.split("\n")) {
    if (!line) continue;
    const match = /^([0-9a-f]+):([\s\S]*)$/i.exec(line);
    if (match) {
      rows.push({ id: match[1].toLowerCase(), payload: match[2], raw: line });
    } else {
      rows.push({ id: null, payload: line, raw: line });
    }
  }
  return rows;
}

function referenceDiagnostics(rows) {
  const defined = new Set(rows.filter((row) => row.id).map((row) => row.id));
  const duplicates = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row.id) continue;
    if (seen.has(row.id)) duplicates.push(row.id);
    seen.add(row.id);
  }

  // Common Flight references include $<hex>, $L<hex> and $@<hex>.
  const references = [];
  for (const row of rows) {
    for (const match of row.payload.matchAll(/\$(?:L|@)?([0-9a-f]+)\b/gi)) {
      references.push({ from: row.id, to: match[1].toLowerCase(), token: match[0] });
    }
  }

  const missing = references.filter((ref) => !defined.has(ref.to));
  return { defined, duplicates: [...new Set(duplicates)], references, missing };
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function summarize(route) {
  const file = routeFile(route);
  if (!fs.existsSync(file)) {
    console.log(`[flight-diag] MISSING ${route}: ${file}`);
    return null;
  }

  const html = fs.readFileSync(file, "utf8");
  const pushes = extractFlightPushes(html, route);
  const text = flightText(pushes);
  const rows = parseRows(text);
  const refs = referenceDiagnostics(rows);
  const malformed = rows.filter((row) => !row.id);

  const typeCounts = new Map();
  for (const entry of pushes) {
    const key = Array.isArray(entry) ? String(entry[0]) : typeof entry;
    typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
  }

  const lastRows = rows.slice(-10).map((row) => {
    if (!row.id) return `MALFORMED:${row.raw.slice(0, 120)}`;
    return `${row.id}:${row.payload.slice(0, 120)}`;
  });

  console.log(`\n=== ${route} ===`);
  console.log(`html=${formatBytes(Buffer.byteLength(html))}`);
  console.log(`flight push entries=${pushes.length} types=${JSON.stringify(Object.fromEntries(typeCounts))}`);
  console.log(`flight text=${formatBytes(Buffer.byteLength(text))} rows=${rows.length} definedIds=${refs.defined.size}`);
  console.log(`duplicate row ids=${refs.duplicates.length ? refs.duplicates.join(",") : "none"}`);
  console.log(`malformed/non-row lines=${malformed.length}`);
  console.log(`references=${refs.references.length} missingReferences=${refs.missing.length}`);

  if (refs.missing.length) {
    console.log("missing references (first 30):");
    for (const ref of refs.missing.slice(0, 30)) {
      console.log(`  ${ref.from ?? "?"} -> ${ref.token} (target row ${ref.to})`);
    }
  }

  if (malformed.length) {
    console.log("malformed/non-row lines (last 10):");
    for (const row of malformed.slice(-10)) console.log(`  ${row.raw.slice(0, 240)}`);
  }

  console.log("last 10 Flight rows:");
  for (const row of lastRows) console.log(`  ${row}`);

  console.log(`flight tail (last 500 chars): ${JSON.stringify(text.slice(-500))}`);

  return {
    route,
    htmlBytes: Buffer.byteLength(html),
    pushCount: pushes.length,
    flightBytes: Buffer.byteLength(text),
    rowCount: rows.length,
    definedCount: refs.defined.size,
    missingCount: refs.missing.length,
    malformedCount: malformed.length,
    lastDefinedId: [...rows].reverse().find((row) => row.id)?.id ?? null,
  };
}

const summaries = routes.map(summarize).filter(Boolean);

console.log("\n=== comparison ===");
for (const summary of summaries) {
  console.log(JSON.stringify(summary));
}

// Print the exact minified React Flight close path from the built client bundle.
// This gives us the local variable names around "Connection closed." so we can
// instrument pending chunks next if the static payload comparison is inconclusive.
const chunksRoot = path.join(releaseRoot, "_next", "static", "chunks");
if (fs.existsSync(chunksRoot)) {
  const files = fs.readdirSync(chunksRoot).filter((name) => name.endsWith(".js"));
  let found = false;
  for (const name of files) {
    const absolute = path.join(chunksRoot, name);
    const body = fs.readFileSync(absolute, "utf8");
    const needle = "Connection closed.";
    const index = body.indexOf(needle);
    if (index === -1) continue;
    found = true;
    const start = Math.max(0, index - 1800);
    const end = Math.min(body.length, index + 1800);
    console.log(`\n=== React Flight close implementation: ${name} ===`);
    console.log(body.slice(start, end));
    break;
  }
  if (!found) console.log("\n[flight-diag] Could not find the Connection closed string in client chunks.");
} else {
  console.log(`\n[flight-diag] Missing chunks directory: ${chunksRoot}`);
}
