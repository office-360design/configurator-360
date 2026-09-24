import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

const files = [
  "website/components/localized-configurator-page.tsx",
  "website/app/configurators/[slug]/page.tsx",
  "website/app/configurators/roof/page.tsx",
  "website/app/[locale]/configurators/[slug]/page.tsx",
];

const failures = [];

for (const relative of files) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) continue;
  const source = fs.readFileSync(absolute, "utf8");

  if (/from\s+["']next\/navigation["']/.test(source) && /\bnotFound\b/.test(source)) {
    failures.push(`${relative} imports notFound from next/navigation`);
  }
  if (/\bnotFound\s*\(/.test(source)) {
    failures.push(`${relative} calls notFound()`);
  }
}

const localizedRoute = fs.readFileSync(
  path.join(root, "website/app/[locale]/configurators/[slug]/page.tsx"),
  "utf8",
);
if (!localizedRoute.includes("export const dynamicParams = false;")) {
  failures.push("localized configurator route must keep dynamicParams=false");
}

if (failures.length) {
  console.error("[configurator-notfound] FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("[configurator-notfound] OK configurator marketing routes do not use App Router notFound().");
}
