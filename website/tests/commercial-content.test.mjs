import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const variants = [
  {locale:'en', prefix:'', host:'www.360configurator.com', category:'3D Product Configurator Software for Manufacturers', cost:'Product Configurator Cost and Implementation', intro:'These answers explain the implementation model.'},
  {locale:'ro', prefix:'ro/', host:'www.360configurator.ro', category:'Dezvoltare configuratoare 3D pentru producători', cost:'Costuri și implementare configuratoare 3D', intro:'Răspunsurile explică modelul de implementare.'},
  {locale:'de', prefix:'de/', host:'www.360konfigurator.de', category:'3D-Produktkonfigurator für Hersteller', cost:'Produktkonfigurator Kosten und Umsetzung', intro:'Diese Antworten erläutern das Implementierungsmodell.'},
];
const products = ['pergola','roof','window','hall','solar','fence','chair','cardbox','bookshelf','tiles'];
const text = html => html.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'");
async function page(prefix, route='') {
  const html=await readFile(new URL(`../outputs/exported-pages/${prefix}${route}index.html`,import.meta.url),'utf8');
  return {html, visible:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')};
}

for (const {locale,prefix,host,category,cost,intro} of variants) {
  test(`${locale}: commercial copy, metadata and proof are in the initial HTML`, async()=>{
    const {html,visible}=await page(prefix);
    assert.ok(html.includes(`<title>${category} — 360Configurator</title>`));
    assert.equal((visible.match(/<h1\b/g)||[]).length,1);
    assert.match(html,new RegExp(`rel="canonical" href="https://${host.replaceAll('.','\\.')}/?"`));
    assert.match(visible,/Spotlight 2024/);
    assert.match(visible,/https:\/\/www\.howtoweb\.co\/meet-the-40-eastern-european-startups-competing-for-the-spotlight\//);
    assert.ok(visible.includes('href="/pricing#cost-breakdown"'));
    assert.ok(visible.includes('href="/configurators/roof#roof-technical-example"'));
    assert.match(html,/webgl-stage-placeholder/);
    assert.doesNotMatch(html,/modulepreload[^>]+\/chunks\/webgl-stage-/);
    const about=await page(prefix,'about/');
    assert.match(about.visible,/Spotlight 2024/);
  });

  test(`${locale}: cost guide is static and all 20 FAQ answers match JSON-LD exactly`, async()=>{
    const {html,visible}=await page(prefix,'pricing/');
    assert.ok(html.includes(`<title>${cost} — 360Configurator</title>`));
    assert.equal((visible.match(/<h1\b/g)||[]).length,1);
    const costs=visible.match(/<section\b[^>]*id="cost-breakdown"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    assert.ok(costs);
    assert.equal((costs.match(/<article\b/g)||[]).length,3);
    assert.doesNotMatch(costs,/<script|<canvas|<img|<iframe/);
    assert.ok(costs.includes('href="/contact?project=pricing"'));
    assert.ok(costs.includes('href="/configurators/roof#roof-technical-example"'));
    assert.equal(text(visible).split(intro).length-1,1,'FAQ introduction must appear once');
    const faqSection=visible.match(/<section class="pricing-faq"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    assert.ok(faqSection);
    const details=[...faqSection.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)];
    assert.equal(details.length,20,'preserve the existing D20 question selector');
    const graph=JSON.parse(html.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]);
    const faq=graph['@graph'].find(node=>node['@type']==='FAQPage');
    assert.equal(faq.mainEntity.length,details.length);
    details.forEach(([,item],index)=>{
      const answer=text(item.match(/<p>([\s\S]*?)<\/p>/)[1]);
      assert.equal(answer,faq.mainEntity[index].acceptedAnswer.text);
      assert.ok(text(item).includes(faq.mainEntity[index].name));
    });
    assert.doesNotMatch(visible,/Before a proposal is issued|Vor der Angebotserstellung werden|Înainte de ofertă, documentăm/);
    const suffix=locale==='en'?'':`-${locale}`;
    const full=await readFile(new URL(`../outputs/release-site/llms-full${suffix}.txt`,import.meta.url),'utf8');
    assert.ok(full.includes(`https://${host}/pricing#cost-breakdown`));
    for (const [,heading] of costs.matchAll(/<h3>([\s\S]*?)<\/h3>/g)) assert.ok(full.includes(text(heading)));
  });

  test(`${locale}: all product pages retain contact context and link to the cost guide`, async()=>{
    for (const product of products) {
      const {visible}=await page(prefix,`configurators/${product}/`);
      const brief=visible.match(/<section\b[^>]*class="[^"]*project-brief[^"]*"[^>]*>([\s\S]*?)<\/section>/)?.[1];
      assert.ok(brief,product);
      assert.ok(brief.includes(`href="/contact?project=${product}"`),product);
      assert.ok(brief.includes('href="/pricing#cost-breakdown"'),product);
      assert.equal((brief.match(/<details\b/g)||[]).length,3,product);
      assert.equal((brief.match(/<p>/g)||[]).length,6,`${product} needs product-specific preparation guidance`);
    }
  });
}
