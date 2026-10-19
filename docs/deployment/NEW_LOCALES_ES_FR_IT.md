# Spanish, French and Italian: shared decisions

This file fixes the decisions every change for es-ES, fr-FR and it-IT follows.
Keep it consistent with `shared-ui/src/config.js` and `website/lib/i18n.ts`.

## Locales and domains

| Locale | Short | Public host | Apex (301 → www) | Tenant root | Native name | Flag |
|---|---|---|---|---|---|---|
| es-ES | es | www.360configurador.es | 360configurador.es | 360configurador.es | Español | 🇪🇸 |
| fr-FR | fr | www.360configurateur.fr | 360configurateur.fr | 360configurateur.fr | Français | 🇫🇷 |
| it-IT | it | www.360configuratore.it | 360configuratore.it | 360configuratore.it | Italiano | 🇮🇹 |

- **Language order:** en-US, ro-RO, de-DE, es-ES, fr-FR, it-IT. Use this order everywhere: lists, tables, hreflang.
- **Region defaults:**
  - Units: metric.
  - Currency: EUR.
  - Number and date formatting uses the locale itself (`es-ES`, `fr-FR`, `it-IT`), never `de-DE` just because the currency is EUR.
- **Country codes (IP region defaults):** ES → es-ES, FR → fr-FR, IT → it-IT.
- **Contact mailbox for es/fr/it:** office@360configurator.com.
- **Website static build:** pages are stored under the internal prefixes `/es`, `/fr` and `/it`, the same way `/ro` and `/de` already are. Old `.com/es/…`, `.com/fr/…` and `.com/it/…` URLs redirect 301 to the country domain.

## Configurator routes (public aliases over the English build directories)

| Product | en-US | es-ES | fr-FR | it-IT |
|---|---|---|---|---|
| pergola | /pergola-configurator/ | /configurador-pergolas/ | /configurateur-pergola/ | /configuratore-pergola/ |
| roof | /roof-configurator/ | /configurador-tejados/ | /configurateur-toiture/ | /configuratore-tetto/ |
| window | /window-configurator/ | /configurador-ventanas/ | /configurateur-fenetres/ | /configuratore-finestre/ |
| hall | /hall-configurator/ | /configurador-naves/ | /configurateur-hangar/ | /configuratore-capannone/ |
| solar | /solar-configurator/ | /configurador-solar/ | /configurateur-solaire/ | /configuratore-fotovoltaico/ |
| fence | /fence-configurator/ | /configurador-vallas/ | /configurateur-cloture/ | /configuratore-recinzioni/ |
| cardbox | /cardbox-configurator/ | /configurador-cajas-carton/ | /configurateur-cartons/ | /configuratore-scatole/ |
| chair | /chair-configurator/ | /configurador-sillas/ | /configurateur-chaises/ | /configuratore-sedie/ |
| bookshelf | /bookshelf-configurator/ | same | same | same |
| tiles | /tiles-configurator/ | same | same | same |

Gas, cages and curtain wall keep their single route on every domain, as they do today.

Product words for `normalizeProductType`:

| Product | Spanish | French | Italian |
|---|---|---|---|
| fence | valla | clôture / cloture | recinzion |
| cardbox | caja / cartón | carton | scatol |
| chair | silla | chaise | sedi |
| bookshelf | estanter | bibliothèque | librer |

## Translation rules
- Translate from the English source; use the German and Romanian versions only to understand context. Tone: professional B2B, industrial, concise. Use formal address: "usted" in Spanish, "vous" in French, "Lei" in Italian.
- Keep these exactly as they are:
  - placeholders (`{n}`, `{name}`, `${…}`), HTML tags and entities;
  - units (mm, m², kN/m², W/m²K, kWp);
  - product and article codes, brand names (Schüco, Cortizo, GUTMANN, 360Configurator), catalogue codes;
  - keyboard keys.
- Keep a string's length close to the English one, because labels sit in tight UI.
- Use correct typography: Spanish ¿¡ and accents, French non-breaking space before `: ; ? !` written as a normal space (not the NBSP character), Italian accents.
- Never fall back silently. Where code uses a ternary (`locale === 'ro' ? … : 'de' ? … : en`), turn it into a lookup keyed by locale that has all six entries.
- Positional arrays (`[ro, de]`, `en|ro|de`) get new columns in the order es, fr, it, or become keyed objects. Update their parsers and validators at the same time.
