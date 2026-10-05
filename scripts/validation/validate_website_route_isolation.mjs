import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

const dynamicRoute = path.join(root, "website", "app", "configurators", "[slug]", "page.tsx");
const roofRoute = path.join(root, "website", "app", "configurators", "roof", "page.tsx");

const dynamicSource = fs.readFileSync(dynamicRoute, "utf8");

if (!fs.existsSync(roofRoute)) {
  throw new Error("Missing explicit English /configurators/roof route.");
}

if (!dynamicSource.includes("export const dynamicParams = false;")) {
  throw new Error("English configurator dynamic route must set dynamicParams=false.");
}

if (!dynamicSource.includes('item.slug !== "roof"')) {
  throw new Error("Roof must stay excluded from the shared [slug] generateStaticParams list.");
}

console.log("[website-route-isolation] OK explicit English roof route is isolated from [slug] prerendering.");
