const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.ROOF_BUILDER_TEST_URL || "http://127.0.0.1:8080";
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, locale] of [
      [390, "ro-RO"],
      [320, "de-DE"],
      [1440, "en-US"],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + "/roof-configurator/builder/?locale=" + locale);
      await page.locator("#welcome [data-action=add]").click();
      await page.locator("[data-choice=hip]").click();
      await page.locator("[data-action=apply]").click();
      assert.equal(await page.locator("#sidebar").isVisible(), false);
      assert.equal(await page.locator("[data-field]:visible").count(), 0);
      const controls = await page
        .locator(
          ".header button,.toolbar button,.viewToggle button,.constructionDock button,.zoom button,.planLaunch",
        )
        .evaluateAll((es) =>
          es.map((e) => {
            const r = e.getBoundingClientRect();
            return {
              text: e.textContent,
              x: r.x,
              y: r.y,
              w: r.width,
              h: r.height,
            };
          }),
        );
      for (const r of controls) {
        assert.ok(
          r.x >= 0 && r.x + r.w <= width + 1 && r.y >= 0 && r.y + r.h <= 900,
          `${locale}/${width}: ${r.text} must be fully visible`,
        );
        assert.ok(
          r.w >= 48 && r.h >= 48,
          `${locale}/${width}: ${r.text} touch target`,
        );
      }
      const view = await page.locator(".viewToggle").boundingBox(),
        undo = await page.locator(".toolbar").boundingBox();
      assert.ok(
        view.x + view.width <= undo.x ||
          view.y + view.height <= undo.y ||
          undo.y + undo.height <= view.y,
        `${locale}: camera and history must not overlap`,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.locator("[data-action=heightTool]").click();
      assert.equal(await page.locator("#sidebar").isVisible(), true);
      const drawer = await page.locator("#sidebar").boundingBox(),
        dock = await page.locator("#constructionDock").boundingBox();
      assert.ok(
        drawer.y >= 0 && drawer.y + drawer.height <= dock.y,
        "Properties leave construction controls visible",
      );
      await page.locator("[data-action=returnToBuild]").click();
      assert.equal(await page.locator("#sidebar").isVisible(), false);
      if (locale === "ro-RO")
        await page.screenshot({ path: "/tmp/roof-builder-game-ro-mobile.png" });
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS game HUD: Romanian/German/English, 320/390/1440 px, uncluttered default, separated controls, 48 px targets, explicit property drawer",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
