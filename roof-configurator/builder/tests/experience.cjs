const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const base = process.env.ROOF_BUILDER_TEST_URL || "http://127.0.0.1:8080";
const state = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("360:roof-builder:v1:" + location.host)),
  );
const click = (page, action) =>
  page.locator(`[data-action="${action}"]:visible`).first().click();
async function healthy(page) {
  assert.equal(
    await page
      .locator("#status")
      .evaluate((e) => e.classList.contains("error")),
    false,
    await page.locator("#status").textContent(),
  );
}
async function drawOutline(page, buttonClose = false) {
  await click(page, "freeDraw");
  const r = await page.locator("#board").boundingBox();
  const points = [
    [0.2, 0.28],
    [0.72, 0.28],
    [0.72, 0.46],
    [0.52, 0.46],
    [0.52, 0.59],
    [0.2, 0.59],
  ];
  let count = 0;
  for (const [x, y] of points) {
    await page.mouse.click(r.x + r.width * x, r.y + r.height * y);
    assert.equal(
      await page.locator(".drawnCorner").count(),
      ++count,
      "Each corner must appear immediately",
    );
  }
  assert.equal(await page.locator(".drawnLine").count(), 1);
  await page.screenshot({ path: "/tmp/roof-builder-new-free-drawing.png" });
  assert.match(await page.locator("#panel").textContent(), /6 corners/);
  // Closing the first corner generates a preview, not a committed project.
  if (buttonClose) {
    const footer = await page.locator("#status").boundingBox();
    for (const action of ["cancel", "backCorner", "finishOutline"]) {
      const rect = await page
        .locator("#panel [data-action=" + action + "]")
        .boundingBox();
      assert.ok(
        rect.y + rect.height <= footer.y && rect.height >= 48,
        "Drawing actions must stay fully visible above the status bar",
      );
    }
    await click(page, "finishOutline");
  } else await page.mouse.click(r.x + r.width * 0.2, r.y + r.height * 0.28);
  await page.locator("#panel.quickPlacement").waitFor();
  await click(page, "apply");
  await healthy(page);
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const errors = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (e) => errors.push(e.message));
    if (process.env.ROOF_TEST_THREE)
      await page.route("https://cdn.jsdelivr.net/npm/three@0.169.0/**", (r) =>
        r.fulfill({
          path: path.join(
            process.env.ROOF_TEST_THREE,
            r.request().url().split("three@0.169.0/")[1],
          ),
          contentType: "text/javascript",
        }),
      );
    await page.goto(base + "/roof-configurator/builder/?locale=en-US");
    await page.locator("#welcome .startCard").first().click();
    await page.locator("[data-choice=hip]").click();
    assert.equal(
      await page.locator("[data-field]:visible").count(),
      0,
      "First placement must not demand form filling",
    );
    await click(page, "apply");
    await healthy(page);
    assert.equal((await state(page)).parts.length, 1);
    assert.equal(
      await page.locator(".badge:visible").count(),
      0,
      "No unexplained completion badges in construction",
    );
    assert.equal(await page.locator("[data-grow]").count(), 4);
    assert.equal(await page.locator("#sidebar").isVisible(), false);
    assert.equal(await page.locator("[data-field]:visible").count(), 0);
    assert.equal(await page.locator(".handleHit").count(), 0);
    await click(page, "resizeTool");
    const first = await state(page),
      corner = await page.locator(".handleHit").first().boundingBox();
    await page.mouse.move(
      corner.x + corner.width / 2,
      corner.y + corner.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      corner.x + corner.width / 2 - 30,
      corner.y + corner.height / 2 - 20,
      { steps: 5 },
    );
    await page.mouse.up();
    const resized = (await state(page)).parts[0];
    assert.ok(
      resized.width > first.parts[0].width &&
        resized.depth > first.parts[0].depth,
    );
    assert.ok(
      Math.abs(resized.x + resized.width - first.parts[0].width) < 1e-6,
    );
    assert.ok(
      Math.abs(resized.z + resized.depth - first.parts[0].depth) < 1e-6,
    );
    await click(page, "undo");
    assert.deepEqual(await state(page), first);
    // Placement controls edit only the ghost. Cancel restores the original selection.
    await click(page, "add");
    await page.locator("[data-choice=gable]").click();
    await click(page, "rotateGhost");
    await click(page, "resizeGhost");
    const ghostBefore = await page
      .locator("#board .preview")
      .first()
      .getAttribute("d");
    const ghostCorner = await page.locator(".handleHit").first().boundingBox();
    await page.mouse.move(
      ghostCorner.x + ghostCorner.width / 2,
      ghostCorner.y + ghostCorner.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      ghostCorner.x + ghostCorner.width / 2 - 35,
      ghostCorner.y + ghostCorner.height / 2 - 20,
      { steps: 5 },
    );
    await page.mouse.up();
    assert.notEqual(
      await page.locator("#board .preview").first().getAttribute("d"),
      ghostBefore,
    );
    assert.deepEqual(
      await state(page),
      first,
      "Resizing/rotating a ghost must not save it",
    );
    await click(page, "cancel");
    assert.deepEqual(await state(page), first);
    assert.equal(await page.locator("#board .preview").count(), 0);
    assert.ok(
      (await page
        .locator("[data-action=resizeTool]")
        .getAttribute("aria-pressed")) === "true",
    );
    // A keyboard-accessible + offers an attached wing with a visible preview.
    await page.locator('[data-grow="2"]').focus();
    await page.keyboard.press("Enter");
    await click(page, "apply");
    await healthy(page);
    assert.equal((await state(page)).parts.length, 2);
    assert.equal((await state(page)).connections.length, 1);
    const valleys = await page.evaluate(async () => {
      const { resolveProject } = await import("./geometry.js?v=builder-game-3");
      return resolveProject(
        JSON.parse(
          localStorage.getItem("360:roof-builder:v1:" + location.host),
        ),
      ).folds.filter((f) => f.type === "valley").length;
    });
    assert.ok(valleys > 0, "Attaching a wing creates a valley");
    await click(page, "moveTool");
    const before = await state(page),
      face = await page.locator("#board .face.active").first().boundingBox();
    await page.mouse.move(
      face.x + face.width * 0.5,
      face.y + face.height * 0.65,
    );
    await page.mouse.down();
    await page.mouse.move(
      face.x + face.width * 0.5 + 45,
      face.y + face.height * 0.65 + 20,
      { steps: 8 },
    );
    await page.mouse.up();
    const moved = await state(page);
    assert.notEqual(moved.parts[1].x, before.parts[1].x);
    await click(page, "undo");
    assert.deepEqual(await state(page), before);
    // A cancelled drag never commits its temporary positions.
    const cancelFace = await page
      .locator("#board .face.active")
      .first()
      .boundingBox();
    await page.mouse.move(
      cancelFace.x + cancelFace.width * 0.5,
      cancelFace.y + cancelFace.height * 0.65,
    );
    await page.mouse.down();
    await page.mouse.move(
      cancelFace.x + cancelFace.width * 0.5 + 40,
      cancelFace.y + cancelFace.height * 0.65 + 20,
      { steps: 5 },
    );
    await page.dispatchEvent("#board", "pointercancel", {
      pointerId: 1,
      pointerType: "mouse",
      bubbles: true,
    });
    await page.mouse.up();
    assert.deepEqual(await state(page), before);
    await click(page, "heightTool");
    await page.locator('[data-pitch="45"]').click();
    await click(page, "returnToBuild");
    await healthy(page);
    assert.equal((await state(page)).parts[1].pitch, 45);
    const beforeDetail = await state(page);
    await click(page, "details");
    await page.locator("[data-detail=chimney]").click();
    assert.equal(await page.locator("[data-field]:visible").count(), 0);
    await click(page, "rotateGhost");
    await click(page, "resizeGhost");
    assert.equal(await page.locator("[data-field]:visible").count(), 2);
    await page.locator("[data-field=featureWidth]").fill("0.6");
    await click(page, "resumePlacement");
    await click(page, "apply");
    await healthy(page);
    const withChimney = (await state(page)).parts[1];
    assert.equal(withChimney.openings[0].type, "chimney");
    assert.equal(withChimney.openings[0].rotation, 45);
    assert.equal(withChimney.openings[0].width, 0.6);
    assert.equal(
      withChimney.rotation,
      beforeDetail.parts[1].rotation,
      "Feature controls must not rotate the parent roof",
    );
    await click(page, "undo");
    assert.deepEqual(await state(page), beforeDetail);
    await page.screenshot({ path: "/tmp/roof-builder-game-wings.png" });
    await click(page, "plan");
    assert.ok((await page.locator(".planCard").count()) >= 3);
    await click(page, "closePlan");
    await page.close();
    const drawn = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    drawn.on("pageerror", (e) => errors.push(e.message));
    await drawn.goto(base + "/roof-configurator/builder/?locale=en-US");
    await drawOutline(drawn);
    assert.equal((await state(drawn)).parts[0].footprint.length, 6);
    await drawn.screenshot({ path: "/tmp/roof-builder-new-outline.png" });
    await click(drawn, "pieceMenu");
    await click(drawn, "shapeTool");
    await drawn.locator('[data-roof-kind="hip"]').click();
    await click(drawn, "returnToBuild");
    assert.match(await drawn.locator("#status").textContent(), /recesses/);
    assert.equal((await state(drawn)).parts[0].kind, "gable");
    await click(drawn, "pieceMenu");
    await click(drawn, "water");
    await drawn.locator(".edgeHit").nth(1).click({ force: true });
    await healthy(drawn);
    assert.equal((await state(drawn)).parts[0].waterEdge, 1);
    await click(drawn, "plan");
    assert.equal(await drawn.locator(".planCard").count(), 2);
    await click(drawn, "closePlan");
    await click(drawn, "undo");
    await healthy(drawn);
    const saved = await state(drawn);
    await drawn.reload();
    assert.deepEqual(await state(drawn), saved);
    await drawn.close();
    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    mobile.on("pageerror", (e) => errors.push(e.message));
    await mobile.goto(base + "/roof-configurator/builder/?locale=en-US");
    await mobile.screenshot({ path: "/tmp/roof-builder-new-mobile-start.png" });
    await drawOutline(mobile, true);
    await healthy(mobile);
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await mobile.screenshot({
      path: "/tmp/roof-builder-game-mobile.png",
    });
    await click(mobile, "add");
    await mobile.locator("[data-choice=measured]").click();
    await mobile.locator("[data-choice=triangle]").click();
    await click(mobile, "apply");
    await click(mobile, "apply");
    await healthy(mobile);
    const actual = await state(mobile);
    assert.equal(actual.parts[1].pitch, null);
    if (process.env.ROOF_TEST_THREE) {
      await mobile.route("https://cdn.jsdelivr.net/npm/three@0.169.0/**", (r) =>
        r.fulfill({
          path: path.join(
            process.env.ROOF_TEST_THREE,
            r.request().url().split("three@0.169.0/")[1],
          ),
          contentType: "text/javascript",
        }),
      );
      await click(mobile, "3d");
      await mobile.locator("#viewer canvas").waitFor();
      assert.ok(
        (await mobile.locator("#canvasNotice").textContent()).includes("30°"),
      );
      assert.ok(
        !(await mobile.locator("#canvasNotice").textContent()).includes(
          "incomplete",
        ),
      );
      assert.equal((await state(mobile)).parts[1].pitch, null);
      await click(mobile, "setPitch");
      assert.equal(
        await mobile.locator("[data-field]:visible").count(),
        1,
        "Missing-angle remedy asks only for the angle",
      );
      await mobile.locator("[data-field=pitch]").fill("27,5");
      await click(mobile, "apply");
      await healthy(mobile);
      assert.equal((await state(mobile)).parts[1].pitch, 27.5);
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS beginner construction: illustrated start, no required fields, + wings, keyboard, valley, drag/undo/cancel, free-drawn concave footprint, local error recovery, gutter direction, planning, save/reopen, mobile and honest 3D estimate",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
