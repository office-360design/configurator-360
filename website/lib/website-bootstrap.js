// Start the incumbent stylesheet from HTML, at non-render-blocking priority.
// Applying it does not wait for the React bundle/hydration to finish.
export const polishStylesBootstrap = `(() => {
  const link = document.getElementById('website-polish-styles');
  if (!link) return;
  const apply = () => { link.media = 'all'; };
  if (link.sheet) apply();
  else link.addEventListener('load', apply, {once: true});
})();`;
