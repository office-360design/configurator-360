import type { Locale } from '../lib/i18n';

const reference = {
  en: {body: '360Configurator was selected among the 40 startups taking part in How to Web Spotlight 2024.', link: 'Read the organiser’s announcement'},
  ro: {body: '360Configurator a fost selectat între cele 40 de startupuri participante la How to Web Spotlight 2024.', link: 'Vezi anunțul organizatorului'},
  de: {body: '360Configurator gehörte zu den 40 Startups, die für How to Web Spotlight 2024 ausgewählt wurden.', link: 'Zur Mitteilung des Veranstalters'},
} as const;

export function SpotlightReference({locale}: {locale: Locale}) {
  const text = reference[locale];
  return <p className="evidence-reference">{text.body}{' '}<a href="https://www.howtoweb.co/meet-the-40-eastern-european-startups-competing-for-the-spotlight/">{text.link}</a>.</p>;
}
