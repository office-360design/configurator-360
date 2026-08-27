import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the 360Configurator homepage and native previews", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Industrial 3D Product Configuration — 360Configurator/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.360configurator\.com"/);
  assert.match(html, /hrefLang="x-default"/);
  assert.match(html, /"@type":"WebSite"/);
  assert.match(html, /"@type":"ItemList"/);
  assert.match(html, /Complex products\./);
  assert.match(html, /Made self-evident\./);
  assert.doesNotMatch(html, /\/window-runtime\/\?preview=1/);
  assert.doesNotMatch(html, /Schüco B2-6 scroll sequence/);
  assert.doesNotMatch(html, /Interactive Schüco Window System AW CT 65 B2-6 preview/);
  assert.match(html, /Pergola/);
  assert.match(html, /Roof/);
  assert.match(html, /Your product could be/);
  assert.match(html, /href="\/pricing"/);
  assert.match(html, /https:\/\/www\.linkedin\.com\/company\/360configurator\//);
  assert.match(html, /<title>Facebook<\/title>/);
  assert.match(html, /<title>X<\/title>/);
  assert.match(html, /<title>LinkedIn<\/title>/);
  assert.doesNotMatch(html, />Fb<\/a>/);
  assert.match(html, /webgl-stage-placeholder/);
  assert.doesNotMatch(html, /modulepreload[^>]+\/chunks\/webgl-stage-/);
});

test("ships explicit machine-readable discovery context", async () => {
  const [llms, llmsFull, robots, sitemap] = await Promise.all([
    readFile(new URL("../public/llms.txt", import.meta.url), "utf8"),
    readFile(new URL("../public/llms-full.txt", import.meta.url), "utf8"),
    readFile(new URL("../app/robots.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
  ]);

  assert.match(llms, /XML sitemap/);
  assert.match(llmsFull, /Bill of materials/);
  assert.match(robots, /OAI-SearchBot/);
  assert.match(robots, /GPTBot/);
  assert.match(sitemap, /localeOrigins/);
  assert.match(sitemap, /configuratorUrl/);
});

test("keeps production-grade configurator behavior inside the isolated website copy", async () => {
  const [runtime, controls, stage, deferredStage, threeRuntime, polish] = await Promise.all([
    readFile(new URL("../public/window-runtime/index.html", import.meta.url), "utf8"),
    readFile(new URL("../components/showcase-controls.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/webgl-stage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/deferred-webgl-stage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/window-runtime/lib/three.module.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles/homepage-polish.css", import.meta.url), "utf8"),
  ]);

  assert.match(runtime, /2_4_Oeffnungselemnt_Vertikal/);
  assert.match(runtime, /function registerExplode/);
  assert.match(runtime, /getActiveGasketCode/);
  assert.match(runtime, /window-preview-command/);
  assert.match(runtime, /sectionGroup\.visible/);
  assert.match(controls, /privacy-wall/);
  assert.match(controls, /Integrated spots/);
  assert.match(controls, /Roof shape/);
  assert.match(stage, /detail\.control === "shape"/);
  assert.match(deferredStage, /import\("\.\/webgl-stage"\)/);
  assert.match(deferredStage, /requestIdleCallback/);
  assert.ok(Buffer.byteLength(threeRuntime) < 700_000, "window runtime Three.js build should stay minified");
  assert.match(threeRuntime, /Copyright 2010-2023 Three\.js Authors/);
  assert.match(polish, /window-instrument/);
  assert.doesNotMatch(polish, /-webkit-text-stroke:\s*1px/);
});
