const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const base = process.env.ROOF_BUILDER_TEST_URL || "http://127.0.0.1:8080";
const launch = {
  headless: true,
  executablePath: process.env.ROOF_TEST_BROWSER || undefined,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
};
async function routeThree(page) {
  if (process.env.ROOF_TEST_THREE)
    await page.route("https://cdn.jsdelivr.net/npm/three@0.169.0/**", (route) =>
      route.fulfill({
        path: path.join(
          process.env.ROOF_TEST_THREE,
          route.request().url().split("three@0.169.0/")[1],
        ),
        contentType: "text/javascript",
      }),
    );
}
async function statusOkay(frame) {
  assert.ok(
    !(await frame
      .locator("#status")
      .evaluate((el) => el.classList.contains("error"))),
    await frame.locator("#status").textContent(),
  );
}
async function click(frame, action) {
  await frame.locator("#app #board").waitFor({ state: "attached" });
  let target = frame.locator('[data-action="' + action + '"]:visible');
  if (!(await target.count())) {
    if (action === "editPending")
      await frame.locator("[data-action=resizeGhost]").click();
    else if (await frame.locator("[data-action=pieceMenu]:visible").count())
      await frame.locator("[data-action=pieceMenu]").click();
    if (
      !(await frame
        .locator('[data-action="' + action + '"]:visible')
        .count()) &&
      (await frame.locator(".accordion-toggle:visible").count())
    )
      await frame.locator(".accordion-toggle").click();
  }
  await frame
    .locator('[data-action="' + action + '"]:visible')
    .first()
    .click();
}
const partCount = (frame) =>
  frame
    .locator("#app #board")
    .evaluate(
      (e) =>
        new Set(
          [...e.querySelectorAll("[data-face]")].map(
            (f) => f.dataset.face.split(":")[0],
          ),
        ).size,
    );
(async () => {
  const browser = await chromium.launch(launch),
    errors = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await routeThree(page);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/roof-configurator/", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => window.ROOF_CONFIGURATOR_API);
    const old = await page.evaluate(() =>
      window.ROOF_CONFIGURATOR_API.captureState(),
    );
    await page.locator("#roofBuilderOpen").click();
    let frame = page.frameLocator('iframe[title="Roof builder"]');
    await click(frame, "add");
    await frame.locator("[data-choice=measured]").click();
    await frame.locator("[data-choice=rectangle]").click();
    await frame.locator("[data-field=width]").fill("1");
    await frame.locator("[data-field=surfaceHeight]").fill("7,7");
    await frame.locator("[data-confirm]").check();
    await click(frame, "apply");
    await statusOkay(frame);
    assert.equal(await partCount(frame), 1);
    const measuredFixture = await frame
      .locator("#app #board")
      .evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("360:roof-builder:v1:" + location.host),
          ).parts[0],
      );
    assert.equal(measuredFixture.width, 1);
    assert.equal(measuredFixture.depth, 7.7);
    await click(frame, "plan");
    await frame.locator("[data-sheet]").first().click();
    await frame.locator("#splitInput").fill("11+11");
    await click(frame, "splitApply");
    try {
      await statusOkay(frame);
    } catch (error) {
      console.error(
        "Split failure context",
        await frame.locator("#app").evaluate(() => ({
          project: JSON.parse(
            localStorage.getItem("360:roof-builder:v1:" + location.host),
          ),
          selected: document.querySelector(".planOptions")?.textContent,
        })),
      );
      throw error;
    }
    assert.equal(await frame.locator(".planCard [data-sheet]").count(), 2);
    assert.match(await frame.locator(".planOptions").textContent(), /100 mm/);
    await frame.locator("#splitInput").fill("7+7+8");
    await click(frame, "splitApply");
    await statusOkay(frame);
    assert.equal(await frame.locator(".planCard [data-sheet]").count(), 3);
    await frame.locator('[data-plan-setting="offset"]').fill("2000");
    await frame.locator('[data-plan-setting="offset"]').dispatchEvent("change");
    assert.ok(
      await frame
        .locator("#status")
        .evaluate((el) => el.classList.contains("error")),
    );
    assert.equal(await frame.locator(".planCard [data-sheet]").count(), 3);
    await frame.locator('[data-plan-setting="offset"]').fill("0");
    await frame.locator("#splitInput").fill("10+10");
    await click(frame, "splitApply");
    assert.ok(
      await frame
        .locator("#status")
        .evaluate((el) => el.classList.contains("error")),
    );
    assert.equal(await frame.locator(".planCard [data-sheet]").count(), 3);
    const csvDownload = page.waitForEvent("download");
    await click(frame, "csv");
    const csv = await csvDownload;
    assert.match(await fs.readFile(await csv.path(), "utf8"), /Rodach Antic/);
    await click(frame, "closePlan");
    await click(frame, "files");
    const fileDownload = page.waitForEvent("download");
    await click(frame, "save");
    const file = await fileDownload;
    const saved = JSON.parse(await fs.readFile(await file.path(), "utf8"));
    assert.equal(saved.parts[0].depth, 7.7);
    assert.deepEqual(
      Object.values(saved.faceSettings)[0].partitions["0/A-1.1"],
      [7, 7, 8],
    );
    await click(frame, "cancel");
    await click(frame, "close");
    await page.locator("dialog iframe").waitFor({ state: "detached" });
    assert.equal(await page.locator("dialog iframe").count(), 0);
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "roofBuilderOpen",
    );
    assert.deepEqual(
      await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState()),
      old,
    );
    await page.locator("#roofBuilderOpen").click();
    frame = page.frameLocator('iframe[title="Roof builder"]');
    await frame.locator("#board [data-face]").first().waitFor();
    assert.equal(await partCount(frame), 1);
    assert.ok(await frame.locator("[data-action=undo]").isDisabled());
    await click(frame, "plan");
    assert.equal(await frame.locator(".planCard [data-sheet]").count(), 3);
    await click(frame, "closePlan");
    await click(frame, "files");
    await click(frame, "open");
    await frame.locator("#projectFile").setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":1}'),
    });
    await frame
      .locator("#status")
      .filter({ hasText: "not a valid project" })
      .waitFor();
    assert.match(
      await frame.locator("#status").textContent(),
      /not a valid project/,
    );
    assert.equal(await partCount(frame), 1);
    await click(frame, "copy");
    await frame.locator("#board [data-face]").nth(1).waitFor();
    assert.equal(await partCount(frame), 2);
    await click(frame, "undo");
    assert.equal(await partCount(frame), 1);
    await click(frame, "redo");
    assert.equal(await partCount(frame), 2);
    const child = page.frames().find((f) => f.url().includes("/builder/"));
    await child.evaluate(async () => {
      const { BuilderViewer } = await import("./viewer.js?v=builder-game-3");
      const dispose = BuilderViewer.prototype.dispose;
      window.disposalCount = 0;
      BuilderViewer.prototype.dispose = function () {
        window.disposalCount++;
        return dispose.call(this);
      };
    });
    for (let i = 0; i < 3; i++) {
      await click(frame, "3d");
      await frame.locator("#viewer canvas").waitFor();
      await click(frame, "2d");
      assert.equal(await frame.locator("#viewer canvas").count(), 0);
    }
    assert.equal(await child.evaluate(() => window.disposalCount), 3);
    await click(frame, "plan");
    const printDialogs = [];
    page.on("dialog", (d) => {
      printDialogs.push(d.type());
      d.dismiss();
    });
    await child.evaluate(
      () =>
        (window.print = () => {
          window.printCalled = true;
        }),
    );
    await click(frame, "print");
    assert.ok(await child.evaluate(() => window.printCalled));
    assert.match(await frame.locator("#print").textContent(), /Sheet order/);
    await click(frame, "closePlan");
    await page.screenshot({ path: "/tmp/roof-builder-desktop.png" });
    await click(frame, "close");
    await page.locator("dialog iframe").waitFor({ state: "detached" });
    assert.deepEqual(
      await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState()),
      old,
    );
    console.log(
      "PASS desktop: isolation, decimal input, manual splits, CSV, file save, invalid import, copy, independent history, reopen, viewer cleanup, print",
    );

    const construction = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await routeThree(construction);
    const pendingRequests = new Set();
    construction.on("request", (req) => pendingRequests.add(req.url()));
    construction.on("requestfinished", (req) =>
      pendingRequests.delete(req.url()),
    );
    construction.on("requestfailed", (req) => {
      pendingRequests.delete(req.url());
      console.error("Request failed", req.url(), req.failure());
    });
    construction.on("pageerror", (e) => errors.push(e.message));
    construction.on("console", (message) => {
      if (message.type() === "warning") console.error(message.text());
    });
    await construction.goto(base + "/roof-configurator/builder/?locale=en-US");
    await click(construction, "add");
    await construction.locator("[data-choice=gable]").click();
    await click(construction, "editPending");
    await construction.locator("[data-field=width]").fill("10");
    await construction.locator("[data-field=depth]").fill("8");
    await construction.locator("[data-field=pitch]").fill("32");
    await click(construction, "apply");
    await statusOkay(construction);
    await click(construction, "edit");
    await construction.locator("[data-field=width]").fill("");
    await click(construction, "apply");
    assert.ok(
      await construction
        .locator("#status")
        .evaluate((el) => el.classList.contains("error")),
    );
    assert.equal(await partCount(construction), 1);
    await click(construction, "cancel");
    await click(construction, "dormer");
    await statusOkay(construction);
    await click(construction, "apply");
    await statusOkay(construction);
    await click(construction, "pieceMenu");
    const otherFace = await construction
      .locator("#selectedFaceSelect option")
      .nth(1)
      .getAttribute("value");
    await construction.locator(".accordion-toggle").click();
    await construction.locator("#selectedFaceSelect").selectOption(otherFace);
    await click(construction, "opening");
    await click(construction, "apply");
    await statusOkay(construction);
    await click(construction, "pieceMenu");
    if (!(await construction.locator("#selectedEdge").isVisible()))
      await construction.locator(".accordion-toggle").click();
    await construction.locator("#selectedEdge").selectOption("1");
    await click(construction, "attach");
    await construction.locator("[data-choice=gable]").click();
    await click(construction, "editPending");
    await construction.locator("[data-field=pitch]").fill("45");
    await click(construction, "apply");
    await statusOkay(construction);
    await click(construction, "add");
    await construction.locator("[data-choice=measured]").click();
    await construction.locator("[data-choice=triangle]").click();
    await construction.locator("[data-field=width]").fill("6.1");
    await construction.locator("[data-field=surfaceHeight]").fill("3");
    await construction.locator("[data-field=offset]").fill("2.8");
    await click(construction, "apply");
    await click(construction, "duplicate");
    await click(construction, "apply");
    await click(construction, "mirror");
    await click(construction, "apply");
    await statusOkay(construction);
    const built = await construction.evaluate(() =>
      JSON.parse(localStorage.getItem("360:roof-builder:v1:" + location.host)),
    );
    assert.equal(built.parts.length, 5);
    assert.equal(built.parts[0].dormers.length, 1);
    assert.equal(built.parts[0].openings.length, 1);
    assert.equal(built.connections.length, 1);
    await click(construction, "fit");
    await construction.screenshot({
      path: "/tmp/roof-builder-construction.png",
    });
    await click(construction, "plan");
    await statusOkay(construction);
    assert.equal(await construction.locator(".planCard").count(), 9);
    await click(construction, "closePlan");
    await click(construction, "3d");
    try {
      // SwiftShader can take longer to compile the detailed multi-wing model.
      await construction
        .locator("#viewer canvas")
        .waitFor({ timeout: 120_000 });
    } catch (error) {
      console.error(
        "Construction preview failure",
        await construction.locator("#status").textContent(),
      );
      console.error(
        "Preview DOM",
        await construction.evaluate(() => ({
          url: location.href,
          shell: document.querySelector(".shell").className,
          viewer: document.querySelector("#viewer").outerHTML.slice(0, 400),
          viewButton: document.querySelector('[data-action="3d"]').outerHTML,
        })),
      );
      console.error("Pending requests", [...pendingRequests]);
      await construction.screenshot({
        path: "/tmp/roof-v2-preview-failure.png",
      });
      throw error;
    }
    await construction.evaluate(async () => {
      const { productGeometry } = await import("./viewer.js?v=builder-game-3"),
        { resolveProject } = await import("./geometry.js?v=builder-game-3");
      const state = JSON.parse(
        localStorage.getItem("360:roof-builder:v1:" + location.host),
      );
      const face = resolveProject(state).faces.find((f) => f.assembled),
        geometry = productGeometry(face);
      const normals = geometry.getAttribute("normal");
      for (let i = 0; i < normals.count; i++) {
        const dot =
          normals.getX(i) * face.normal.x +
          normals.getY(i) * face.normal.y +
          normals.getZ(i) * face.normal.z;
        if (!Number.isFinite(dot) || dot <= 0)
          throw Error("Product normal points below the roof");
      }
      geometry.dispose();
    });
    await construction.screenshot({
      path: "/tmp/roof-builder-construction-3d.png",
    });
    await click(construction, "2d");
    assert.equal(await construction.locator("#viewer canvas").count(), 0);
    await click(construction, "add");
    await construction.locator("[data-choice=measured]").click();
    await construction.locator("[data-choice=custom]").click();
    await click(construction, "apply");
    await click(construction, "diagonal");
    await construction.locator("[data-field=diagonal]").fill("9");
    await click(construction, "apply");
    await statusOkay(construction);
    await click(construction, "edit");
    await construction.keyboard.press("Escape");
    assert.ok(
      await construction
        .locator("#panel")
        .evaluate((el) => el.classList.contains("hidden")),
    );
    await click(construction, "plan");
    await construction.locator(".planCard [data-sheet]").first().focus();
    await construction.keyboard.press("Enter");
    assert.ok(await construction.locator("#splitInput").isVisible());
    await construction.close();
    console.log(
      "PASS construction: confirmed dimensions, invalid input recovery, dormer, opening, attached unequal-pitch wing, measured triangle, duplicate/mirror, sheet plans, 3D",
    );

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const m = await mobile.newPage();
    await routeThree(m);
    m.on("pageerror", (e) => errors.push(e.message));
    await m.goto(base + "/roof-configurator/builder/?locale=ro-RO");
    await click(m, "add");
    await m.locator("[data-choice=measured]").click();
    await m.locator("[data-choice=trapezoid]").click();
    await m.locator("[data-field=width]").fill("13,6");
    await m.locator("[data-field=top]").fill("8,1");
    await m.locator("[data-field=surfaceHeight]").fill("3,5");
    await m.locator("[data-field=offset]").fill("2,75");
    await click(m, "apply");
    assert.ok(
      await m
        .locator("#panel")
        .evaluate((el) => el.classList.contains("placement")),
    );
    await click(m, "apply");
    await statusOkay(m);
    const state = await m.evaluate(() =>
      JSON.parse(localStorage.getItem("360:roof-builder:v1:" + location.host)),
    );
    assert.equal(state.parts[0].width, 13.6);
    assert.equal(state.parts[0].depth, 3.5);
    await click(m, "opening");
    await click(m, "apply");
    assert.ok(
      await m
        .locator("#panel")
        .evaluate((el) => el.classList.contains("placement")),
    );
    await click(m, "apply");
    await statusOkay(m);
    assert.equal(
      await m.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("360:roof-builder:v1:" + location.host),
          ).parts[0].openings.length,
      ),
      1,
    );
    await click(m, "undo");
    for (const action of ["add", "undo", "redo", "fit", "plan", "close"]) {
      const rect = await m
        .locator('[data-action="' + action + '"]')
        .first()
        .boundingBox();
      assert.ok(rect.width >= 48 && rect.height >= 48);
      assert.ok(
        rect.x >= 0 && rect.x + rect.width <= 391,
        action + " is visible",
      );
    }
    const cdp = await mobile.newCDPSession(m),
      rect = await m.locator("#board").boundingBox(),
      touch = (x, y, id) => ({ x, y, id, radiusX: 1, radiusY: 1 });
    const beforePan = await m.locator("#grid").getAttribute("x");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touch(rect.x + 12, rect.y + 100, 1)],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [touch(rect.x + 42, rect.y + 100, 1)],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.notEqual(await m.locator("#grid").getAttribute("x"), beforePan);
    const beforeZoom = await m.locator("#grid").getAttribute("width");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        touch(rect.x + 80, rect.y + 120, 3),
        touch(rect.x + 180, rect.y + 120, 4),
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        touch(rect.x + 80, rect.y + 120, 3),
        touch(rect.x + 230, rect.y + 120, 4),
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.ok(
      Number(await m.locator("#grid").getAttribute("width")) >
        Number(beforeZoom),
    );
    await click(m, "fit");
    await click(m, "plan");
    assert.equal(await m.locator(".planCard").count(), 1);
    await m.screenshot({ path: "/tmp/roof-builder-mobile-plan.png" });
    await click(m, "closePlan");
    await m.screenshot({ path: "/tmp/roof-builder-mobile.png" });
    assert.equal(await m.locator("body").evaluate((el) => el.scrollWidth), 390);
    await mobile.close();
    console.log(
      "PASS mobile: full labels, visible actions, touch pan/pinch, decimal comma, staged placement, sheet plan",
    );
    const unavailable = await browser.newContext();
    await unavailable.addInitScript(() =>
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("blocked");
        },
      }),
    );
    const u = await unavailable.newPage();
    await u.goto(
      base + "/roof-configurator/builder/?locale=de-DE&units=imperial",
    );
    await u.locator("[data-action=add]").first().click();
    await u.locator("[data-choice=shed]").click();
    await click(u, "editPending");
    assert.match(await u.locator("#panel").textContent(), /ft/);
    await click(u, "apply");
    assert.match(
      await u.locator("#status").textContent(),
      /Autospeichern nicht verfügbar/,
    );
    assert.equal(await partCount(u), 1);
    await unavailable.close();
    console.log(
      "PASS unavailable storage: German/imperial, editing and file-saving fallback",
    );
    const failed3d = await browser.newPage();
    await failed3d.route("https://cdn.jsdelivr.net/npm/three@0.169.0/**", (r) =>
      r.abort(),
    );
    await failed3d.goto(base + "/roof-configurator/builder/?locale=en-US");
    await click(failed3d, "add");
    await failed3d.locator("[data-choice=gable]").click();
    await click(failed3d, "apply");
    await click(failed3d, "3d");
    await failed3d
      .locator("#status")
      .filter({ hasText: "could not load" })
      .waitFor();
    assert.ok(await failed3d.locator("#board").isVisible());
    assert.equal(await failed3d.locator("#viewer canvas").count(), 0);
    await click(failed3d, "plan");
    assert.equal(await failed3d.locator(".planCard").count(), 2);
    await failed3d.close();
    console.log(
      "PASS 3D loading failure: valid drawing and sheet plans remain available",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
