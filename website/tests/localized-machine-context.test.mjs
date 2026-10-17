import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {localizedMachineContext,localizedFullContext,sectionText} from '../scripts/localized-machine-context.mjs';
import {configurators} from '../scripts/static-routes.mjs';

test('localized context is generated from the same current page metadata', async () => {
  const root = new URL('../outputs/release-site/',import.meta.url).pathname;
  // URL pathname must be decoded for workspace paths containing spaces.
  const lite={en:/lite versions/,ro:/versiuni lite/,de:/Lite-Versionen/,es:/versiones lite/,fr:/versions lite/,it:/versioni lite/};
  const review={en:/technical review/,ro:/evaluarea tehnică/,de:/technischen Prüfung/,es:/revisión técnica/,fr:/revue technique/,it:/revisione tecnica/};
  for (const [locale,host] of [['en','www.360configurator.com'],['ro','www.360configurator.ro'],['de','www.360konfigurator.de'],['es','www.360configurador.es'],['fr','www.360configurateur.fr'],['it','www.360configuratore.it']]) {
    const text=await localizedMachineContext(decodeURIComponent(root),locale,`https://${host}`,configurators);
    assert.equal((text.match(/\/configurators\//g)||[]).length,10);
    if (locale!=='en') assert.doesNotMatch(text,/https:\/\/www\.360configurator\.com/);
    assert.match(text,lite[locale]);
    assert.match(text,review[locale]);
    const suffix=locale==='en'?'':`-${locale}`;
    assert.equal(await readFile(new URL(`../outputs/release-site/llms${suffix}.txt`,import.meta.url),'utf8'),text);
    const full=await localizedFullContext(decodeURIComponent(root),locale,`https://${host}`,configurators);
    assert.ok(full.length>text.length*3,'full context must contain substantive detail, not duplicate the summary');
    assert.equal(await readFile(new URL(`../outputs/release-site/llms-full${suffix}.txt`,import.meta.url),'utf8'),full);
    assert.match(full,/218/);
    assert.match(full,/97[.,]27/);
    assert.match(full,/photo\/2D|foto\/2D|Foto\/2D/);
    assert.doesNotMatch(full,/<script|__VINEXT|data-rsc|Loading preview/);
    if (locale!=='en') assert.doesNotMatch(full,/https:\/\/www\.360configurator\.com/);
  }
});

test('machine text keeps headings, units and table boundaries, not scripts or UI glyphs', () => {
  const text=sectionText('<h2>Roof &amp; BOM</h2><p>97.27 m&#178;<span aria-hidden="true">↗</span></p><table><tr><th>Panels</th><td>218</td></tr></table><script>privateCode()</script>');
  assert.match(text,/### Roof & BOM/);
  assert.match(text,/97.27 m²/);
  assert.match(text,/\| Panels \| 218 \|/);
  assert.doesNotMatch(text,/privateCode|↗|<[^>]+>/);
});
