import { SiteHeaderClient } from "./site-header-client";
import { getLocalizedConfigurators } from "../lib/configurators-localized";
import type { Locale } from "../lib/i18n";

// Keep full product descriptions, translated features and FAQs on the server.
// Navigation hydrates only the compact fields it actually displays.
export function SiteHeader({locale = "en", currentPath = "/"}: {locale?:Locale; currentPath?:string}) {
  const configurators = getLocalizedConfigurators(locale).map(({slug,index,category,title,shortTitle,launchUrl}) => ({slug,index,category,title,shortTitle,launchUrl}));
  return <SiteHeaderClient locale={locale} currentPath={currentPath} configurators={configurators}/>;
}
