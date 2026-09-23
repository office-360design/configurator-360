from pathlib import Path

p = Path('shared-ui/styles/tenantBranding.css')
s = p.read_text()
s += '''
/* Keep tenant branding and the editable title inside their grid tracks. */
.shared-ui-host .site-header--tenant .brand {
  min-width: 0;
  max-width: 154px;
  overflow: hidden;
}
.shared-ui-host .site-header--tenant .tenant-brand-name {
  display: block;
  min-width: 0;
  max-width: 100%;
  line-height: 18px;
}
.shared-ui-host .site-header--tenant .project-name-shell,
.shared-ui-host .site-header--tenant .project-name-input {
  min-width: 0;
  max-width: 100%;
}
.dashboard-branding .dashboard-home strong { max-width: 100%; }
.dashboard-branding .brand-logo { min-width: 0; }
@media (max-width: 760px) {
  .shared-ui-host .site-header--tenant .brand { max-width: 83px; }
}
@media (max-width: 680px) {
  .dashboard-branding, .dashboard-branding .dashboard-home { width: 100%; }
  .dashboard-header .auth-panel { flex-wrap: wrap; }
  .dashboard-header #authState { min-width: 0; overflow-wrap: anywhere; }
}
@media (max-width: 480px) {
  .shared-ui-host .site-header--tenant .brand { max-width: 78px; }
  .shared-ui-host .site-header--tenant .project-name-shell,
  .shared-ui-host .site-header--tenant .book-demo-button { display: none; }
}
@media (max-width: 360px) {
  .shared-ui-host .site-header--tenant .brand { max-width: 60px; }
}
'''
p.write_text(s)

p = Path('scripts/validation/tenant-branding.browser.mjs')
s = p.read_text()
start = s.index('  async function checkHeader(width) {')
end = s.index('  for (const [locale, base]', start)
s = s[:start] + '''  async function checkHeader(width) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const selectors = {
      header: '.site-header', primary: '.brand',
      badge: '.tenant-platform-brand', actions: '.site-header__actions',
      name: '.project-name-shell', nameInput: '.project-name-input',
    };
    const boxes = {};
    for (const [key, selector] of Object.entries(selectors)) {
      boxes[key] = await page.locator(selector).boundingBox();
    }
    try {
      const { header, primary, badge, actions, name, nameInput } = boxes;
      assert.ok(header && primary && badge && actions, 'Required branding and controls must stay rendered');
      assert.ok(Math.abs(header.height - 47) < 1, `Header height changed at ${width}px`);
      for (const [key, box] of Object.entries({ primary, badge, actions, name, nameInput })) {
        if (!box) continue; // Existing phone layout hides the project-name control.
        assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `${key} offscreen at ${width}px`);
        assert.ok(box.y >= -1 && box.y + box.height <= header.height + 1, `${key} outside bar at ${width}px`);
      }
      assert.ok(primary.x + primary.width <= badge.x + 1 || primary.y + primary.height <= badge.y + 1, 'Brand marks must not overlap');
      assert.ok(primary.x + primary.width <= actions.x + 1, `Tenant logo overlaps actions at ${width}px`);
      assert.ok(badge.x + badge.width <= actions.x + 1, `Attribution overlaps actions at ${width}px`);
      if (name) {
        assert.ok(name.x >= Math.max(primary.x + primary.width, badge.x + badge.width) - 1, `Name overlaps branding at ${width}px`);
        assert.ok(name.x + name.width <= actions.x + 1, `Name overlaps actions at ${width}px`);
      }
      const badgeImage = await page.locator('.tenant-platform-brand img').boundingBox();
      const tenantImage = page.locator('.brand img');
      if (await tenantImage.count()) {
        const primaryImage = await tenantImage.boundingBox();
        assert.ok(badgeImage.height < primaryImage.height, 'Platform mark should be smaller');
      }
    } catch (error) {
      console.error('BRANDING_LAYOUT', page.url(), JSON.stringify(boxes));
      await page.screenshot({ path: resolve(artifacts, `tenant-branding-failure-${width}.png`) });
      errors.push(error.message);
    }
  }
''' + s[end:]
old = '      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Dashboard overflow: ${width}`);'
new = '''      await page.evaluate(() => new Promise(requestAnimationFrame));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) {
        const offenders = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).flatMap((node) => {
          const box = node.getBoundingClientRect();
          if (!box.width || !box.height || (box.right <= innerWidth + 1 && box.left >= -1)) return [];
          return [{ tag: node.tagName, id: node.id, className: node.className, x: box.x, right: box.right, width: box.width }];
        }));
        console.error('DASHBOARD_LAYOUT', width, JSON.stringify(offenders));
        await page.screenshot({ path: resolve(artifacts, `tenant-branding-dashboard-${width}.png`) });
        errors.push(`Dashboard overflow: ${width}`);
      }'''
assert s.count(old) == 1
s = s.replace(old, new)
p.write_text(s)
