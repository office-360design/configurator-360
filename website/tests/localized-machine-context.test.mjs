import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {localizedMachineContext} from '../scripts/localized-machine-context.mjs';
import {configurators} from '../scripts/static-routes.mjs';

test('localized context is generated from the same current page metadata', async () => {
  const root = new URL('../outputs/release-site/',import.meta.url).pathname;
  // URL pathname must be decoded for workspace paths containing spaces.
  for (const [locale,host] of [['ro','www.360configurator.ro'],['de','www.360konfigurator.de']]) {
    const text=await localizedMachineContext(decodeURIComponent(root),locale,`https://${host}`,configurators);
    assert.equal((text.match(/\/configurators\//g)||[]).length,10);
    assert.doesNotMatch(text,/https:\/\/www\.360configurator\.com/);
    assert.match(text,locale==='ro'?/versiuni lite/:/Lite-Versionen/);
    assert.match(text,locale==='ro'?/evaluarea tehnică/:/technischen Prüfung/);
    assert.equal(await readFile(new URL(`../outputs/release-site/llms-${locale}.txt`,import.meta.url),'utf8'),text);
  }
});
