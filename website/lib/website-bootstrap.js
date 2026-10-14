import { CONSENT_KEY } from './website-analytics.js';

// Runs before body paint. Only reads the preference; it never loads a tag or
// grants consent. The server-rendered panel stays visible if storage is blocked.
export const analyticsChoiceBootstrap = `try {
  const choice = localStorage.getItem(${JSON.stringify(CONSENT_KEY)});
  document.documentElement.dataset.analyticsChoice = choice === 'granted' || choice === 'denied' ? choice : 'unknown';
} catch (_) { document.documentElement.dataset.analyticsChoice = 'unknown'; }`;

// Start the incumbent stylesheet from HTML, at non-render-blocking priority.
// Applying it does not wait for the React bundle/hydration to finish.
export const polishStylesBootstrap = `(() => {
  const link = document.getElementById('website-polish-styles');
  if (!link) return;
  const apply = () => { link.media = 'all'; };
  if (link.sheet) apply();
  else link.addEventListener('load', apply, {once: true});
})();`;
