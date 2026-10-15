import {readFile} from 'node:fs/promises';
import path from 'node:path';

const copy = {
  en: {
    overview: '360Configurator develops browser-based 3D product configurators for manufacturers and distributors. Website previews are lite versions; features, pricing and outputs vary between the full applications.',
    pages: 'Primary pages', products: 'Configurators and use cases', boundaries: 'Implementation and limits',
    scope: 'Existing system, adaptation or custom development: the recommendation, scope and price follow technical review. Previews are not manufacturing specifications or supplier quotations. The paving configurator is a prototype. Use Contact or the demo request to discuss a software project.',
    resources: 'Official resources', sitemap: 'XML sitemap', robots: 'Crawler policy', full: 'Full product context', details: 'Product details from the public website', application: 'Full application', pricing: 'Implementation costs and ongoing service',
  },
  ro: {
    overview: '360Configurator dezvoltă configuratoare 3D în browser pentru produse cu dimensiuni, variante și reguli de compatibilitate. Previzualizările de pe website sunt versiuni lite; funcțiile, prețurile și rezultatele disponibile diferă între aplicațiile complete.',
    pages: 'Pagini principale', products: 'Configuratoare și utilizări',
    boundaries: 'Implementare și limite',
    scope: 'Sistem existent, adaptare sau dezvoltare personalizată: recomandarea, implementarea și prețul se stabilesc după evaluarea tehnică. Previzualizările nu sunt specificații de fabricație și nu garantează o ofertă de la un furnizor. Configuratorul de pavaj este un prototip. Pentru proiecte, folosiți pagina de contact sau solicitarea de demonstrație.',
    resources: 'Resurse oficiale', sitemap: 'Sitemap XML', robots: 'Reguli pentru crawlere', full: 'Context complet despre produse', details: 'Detalii despre produse din website-ul public', application: 'Aplicația completă', pricing: 'Costurile implementării și serviciile de operare',
  },
  de: {
    overview: '360Configurator entwickelt browserbasierte 3D-Konfiguratoren für Produkte mit Maßen, Varianten und Kompatibilitätsregeln. Website-Vorschauen sind Lite-Versionen; Funktionen, Preise und Ausgaben unterscheiden sich je nach vollständiger Anwendung.',
    pages: 'Hauptseiten', products: 'Konfiguratoren und Anwendungsfälle',
    boundaries: 'Implementierung und Grenzen',
    scope: 'Vorhandenes System, Anpassung oder individuelle Entwicklung: Empfehlung, Umfang und Preis werden nach der technischen Prüfung festgelegt. Vorschauen sind keine Fertigungsspezifikationen und garantieren kein Lieferantenangebot. Der Pflasterkonfigurator ist ein Prototyp. Für Projekte nutzen Sie Kontakt oder Demo-Anfrage.',
    resources: 'Offizielle Ressourcen', sitemap: 'XML-Sitemap', robots: 'Crawler-Regeln', full: 'Vollständiger Produktkontext', details: 'Produktdetails aus der öffentlichen Website', application: 'Vollständige Anwendung', pricing: 'Implementierungskosten und laufender Betrieb',
  },
};
function decode(value) {
  return value.replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
    .replace(/&#(x[\da-f]+|\d+);/gi,(_,code)=>String.fromCodePoint(code[0].toLowerCase()==='x' ? parseInt(code.slice(1),16) : Number(code)));
}

// Only controlled, explicitly marked sections from our static export are read.
// Do not ingest scripts/RSC payloads, navigation, controls or external pages.
export function sectionText(fragment) {
  return decode(fragment
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
    .replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/gi,'')
    .replace(/<span\b[^>]*>\s*(?:0\d|[+↗↓→])\s*<\/span>/g,'')
    .replace(/<h([23])\b[^>]*>/g,(_,level)=>`\n\n${'#'.repeat(Number(level)+1)} `)
    .replace(/<(?:p|summary|caption)\b[^>]*>/g,'\n\n')
    .replace(/<li\b[^>]*>/g,'\n- ')
    .replace(/<(?:th|td)\b[^>]*>/g,' | ')
    .replace(/<\/tr>/g,' |\n')
    .replace(/<br\s*\/?\s*>/g,'\n')
    .replace(/<\/(?:h[23]|p|summary|caption)>/g,'\n\n')
    .replace(/<[^>]+>/g,''))
    .replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

function pageFile(releaseRoot,locale,route) {
  return path.join(releaseRoot,locale==='en'?'':locale,route==='/'?'index.html':`${route.slice(1)}/index.html`);
}

// Derive product facts from the actual localized server-rendered page metadata.
// Changes to product copy cannot leave a separate hand-written feature list stale.
export async function localizedMachineContext(releaseRoot, locale, origin, products) {
  if (!copy[locale]) throw new Error(`Unsupported machine-context locale: ${locale}`);
  const text=copy[locale];
  const primary=['/','/about','/pricing','/contact','/book-a-demo'];
  const productPaths=products.map(slug=>`/configurators/${slug}`);
  const entries=[];
  for (const route of [...primary,...productPaths]) {
    const html=await readFile(pageFile(releaseRoot,locale,route),'utf8');
    const title=decode(html.match(/<title>([^<]+)<\/title>/i)?.[1] || '360Configurator');
    const description=decode(html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i)?.[1] || '');
    if (!description) throw new Error(`Missing description for ${locale}${route}`);
    entries.push(`- [${title}](${origin}${route}): ${description}`);
  }
  return `# 360Configurator\n\n> ${text.overview}\n\n## ${text.pages}\n\n${entries.slice(0,primary.length).join('\n')}\n\n## ${text.products}\n\n${entries.slice(primary.length).join('\n')}\n\n## ${text.boundaries}\n\n${text.scope}\n\n## ${text.resources}\n\n- [${text.full}](${origin}/llms-full.txt)\n- [${text.sitemap}](${origin}/sitemap.xml)\n- [${text.robots}](${origin}/robots.txt)\n`;
}

export async function localizedFullContext(releaseRoot,locale,origin,products) {
  const summary=await localizedMachineContext(releaseRoot,locale,origin,products);
  const pricingHtml=await readFile(pageFile(releaseRoot,locale,'/pricing'),'utf8');
  const pricing=pricingHtml.match(/<section\b[^>]*data-machine-section="implementation-costs"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  if (!pricing) throw new Error(`Missing implementation costs for ${locale}`);
  const pricingContext=`## ${copy[locale].pricing}\n\n${origin}/pricing#cost-breakdown\n\n${sectionText(pricing)}`;
  const sections=[];
  for (const slug of products) {
    const route=`/configurators/${slug}`;
    const html=await readFile(pageFile(releaseRoot,locale,route),'utf8');
    const title=sectionText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
    const marked=[...html.matchAll(/<section\b[^>]*data-machine-section="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
    for (const required of ['overview','features','outputs']) {
      if (!marked.some(([ ,name])=>name===required)) throw new Error(`Missing ${required} context for ${locale}/${slug}`);
    }
    const graph=JSON.parse(html.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1] || '{}');
    const application=graph['@graph']?.find(item=>item['@type']==='WebApplication')?.url;
    if (!application || new URL(application).origin!==origin) throw new Error(`Invalid full app URL for ${locale}/${slug}`);
    sections.push(`## ${title}\n\n${origin}${route}\n\n${marked.map(([, ,fragment])=>sectionText(fragment)).join('\n\n')}\n\n${copy[locale].application}: ${application}`);
  }
  return `${summary}\n${pricingContext}\n\n## ${copy[locale].details}\n\n${sections.join('\n\n')}\n`;
}
