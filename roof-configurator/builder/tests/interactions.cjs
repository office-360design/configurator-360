const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.ROOF_TEST_BROWSER,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
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
    const click = async (a) => {
      await page.locator("#board").waitFor({ state: "attached" });
      if (!(await page.locator('[data-action="' + a + '"]:visible').count())) {
        if (a === "editPending")
          await page.locator("[data-action=resizeGhost]").click();
        else await page.locator("[data-action=pieceMenu]").click();
        if (!(await page.locator('[data-action="' + a + '"]:visible').count()))
          await page.locator(".accordion-toggle").click();
      }
      await page
        .locator('[data-action="' + a + '"]:visible')
        .first()
        .click();
    };
    const state = () =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("360:roof-builder:v1:" + location.host),
        ),
      );
    await page.goto(
      (process.env.ROOF_BUILDER_TEST_URL || "http://127.0.0.1:8080") +
        "/roof-configurator/builder/?locale=en-US",
    );
    await click("add");
    await page.locator("[data-choice=gable]").click();
    await click("apply");
    await click("extend");
    await click("apply");
    assert.equal((await state()).parts[0].depth, 8);
    assert.equal((await state()).parts[0].z, -2);
    await click("resizeTool");
    const hits = await page
      .locator(".dimensionHit")
      .evaluateAll((es) =>
        es.map((e) => ({ w: e.getBBox().width, h: e.getBBox().height })),
      );
    assert.ok(hits.every((r) => r.w >= 48 && r.h >= 48));
    await page.locator(".dimensionHit").first().focus();
    await page.keyboard.press("Enter");
    assert.ok(await page.locator("[data-field=width]").isVisible());
    await page.keyboard.press("Escape");
    await click("add");
    await page.locator("[data-choice=measured]").click();
    await page.locator("[data-choice=custom]").click();
    await click("apply");
    await click("diagonal");
    await page.locator("[data-field=diagonal]").fill("9");
    await click("apply");
    assert.equal((await state()).parts[1].diagonals["0:2"], 9);
    await click("products");
    await page.locator("[data-product=simetric]").click();
    await click("apply");
    await click("plan");
    await page.locator('[data-plan-setting="direction"]').selectOption("right");
    assert.ok(
      !(await page
        .locator("#status")
        .evaluate((e) => e.classList.contains("error"))),
    );
    const final = await state();
    assert.equal(
      final.faceSettings[final.parts[1].id + ":0"].direction,
      "right",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS interactions: selected-edge extension, 48 px dimension targets, keyboard editing, notched-outline diagonal, catalog choice and Simetric installation side",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
