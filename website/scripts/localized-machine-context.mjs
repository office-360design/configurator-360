import {readFile} from 'node:fs/promises';
import path from 'node:path';

const copy = {
  ro: {
    overview: '360Configurator dezvoltă configuratoare 3D în browser pentru produse cu dimensiuni, variante și reguli de compatibilitate. Previzualizările de pe website sunt versiuni lite; funcțiile, prețurile și rezultatele disponibile diferă între aplicațiile complete.',
    pages: 'Pagini principale', products: 'Configuratoare și utilizări',
    boundaries: 'Implementare și limite',
    scope: 'Sistem existent, adaptare sau dezvoltare personalizată: recomandarea, implementarea și prețul se stabilesc după evaluarea tehnică. Previzualizările nu sunt specificații de fabricație și nu garantează o ofertă de la un furnizor. Configuratorul de pavaj este un prototip. Pentru proiecte, folosiți pagina de contact sau solicitarea de demonstrație.',
    resources: 'Resurse oficiale', sitemap: 'Sitemap XML', robots: 'Reguli pentru crawlere',
  },
  de: {
    overview: '360Configurator entwickelt browserbasierte 3D-Konfiguratoren für Produkte mit Maßen, Varianten und Kompatibilitätsregeln. Website-Vorschauen sind Lite-Versionen; Funktionen, Preise und Ausgaben unterscheiden sich je nach vollständiger Anwendung.',
    pages: 'Hauptseiten', products: 'Konfiguratoren und Anwendungsfälle',
    boundaries: 'Implementierung und Grenzen',
    scope: 'Vorhandenes System, Anpassung oder individuelle Entwicklung: Empfehlung, Umfang und Preis werden nach der technischen Prüfung festgelegt. Vorschauen sind keine Fertigungsspezifikationen und garantieren kein Lieferantenangebot. Der Pflasterkonfigurator ist ein Prototyp. Für Projekte nutzen Sie Kontakt oder Demo-Anfrage.',
    resources: 'Offizielle Ressourcen', sitemap: 'XML-Sitemap', robots: 'Crawler-Regeln',
  },
};
function decode(value) {
  return value.replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
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
    const html=await readFile(path.join(releaseRoot,locale,route==='/'?'index.html':`${route.slice(1)}/index.html`),'utf8');
    const title=decode(html.match(/<title>([^<]+)<\/title>/i)?.[1] || '360Configurator');
    const description=decode(html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i)?.[1] || '');
    if (!description) throw new Error(`Missing description for ${locale}${route}`);
    entries.push(`- [${title}](${origin}${route}): ${description}`);
  }
  return `# 360Configurator\n\n> ${text.overview}\n\n## ${text.pages}\n\n${entries.slice(0,primary.length).join('\n')}\n\n## ${text.products}\n\n${entries.slice(primary.length).join('\n')}\n\n## ${text.boundaries}\n\n${text.scope}\n\n## ${text.resources}\n\n- [${text.sitemap}](${origin}/sitemap.xml)\n- [${text.robots}](${origin}/robots.txt)\n`;
}
