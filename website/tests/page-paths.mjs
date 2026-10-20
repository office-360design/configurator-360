// Exported page file for an internal (English) route: country trees use their own slugs.
import {localizedRoutePath} from '../scripts/static-routes.mjs';

export function pageFile(prefix, route = '/') {
  const locale = prefix.replace('/', '') || 'en';
  const path = localizedRoutePath(locale, route);
  return `${prefix}${path === '/' ? '' : `${path.slice(1)}/`}index.html`;
}

export {localizedRoutePath};
