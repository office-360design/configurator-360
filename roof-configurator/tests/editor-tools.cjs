// Use the same category navigation as an editor user.
exports.clickTool = async (page, action) => {
  const group = { draw: 'perimeter', extend: 'perimeter', connect: 'perimeter',
    split: 'surfaces', insert: 'surfaces', window: 'features', dormer: 'features',
    pan: 'view', fit: 'view', slopeArrows: 'view', axes: 'view' }[action];
  const button = page.locator(`[data-action="${action}"]`);
  if (group && !await button.isVisible()) await page.locator(`[data-tool-group="${group}"]`).click();
  await button.click();
};
