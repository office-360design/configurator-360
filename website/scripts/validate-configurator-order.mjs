import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const site=fileURLToPath(new URL('../',import.meta.url)),temp=mkdtempSync(join(tmpdir(),'configurator-order-'));
try{
  const bundled=join(site,'node_modules/typescript/bin/tsc');
  const command=existsSync(bundled)?process.execPath:'tsc';
  const args=[...(existsSync(bundled)?[bundled]:[]),'--target','ES2022','--module','commonjs','--moduleResolution','node','--skipLibCheck','--outDir',temp,'--noEmit','false','lib/configurators.ts','lib/configurators-localized.ts','lib/new-configurators.ts','lib/lite-products.ts','lib/i18n.ts'];
  const result=spawnSync(command,args,{cwd:site,encoding:'utf8'});if(result.status!==0)throw new Error(result.error?.message||result.stdout+result.stderr);
  writeFileSync(join(temp,'package.json'),'{"type":"commonjs"}');
  const require=createRequire(import.meta.url),{getLocalizedConfigurators}=require(join(temp,'configurators-localized.js'));
  const expected=['window','hall','fence','tiles','pergola','roof','solar','chair','cardbox','bookshelf'];
  for(const locale of ['en','ro','de','es','fr','it']){
    const entries=getLocalizedConfigurators(locale);assert.deepEqual(entries.map(x=>x.slug),expected);assert.deepEqual(entries.map(x=>x.index),expected.map((_,i)=>String(i+1).padStart(2,'0')));
    assert.equal(new Set(entries.map(x=>x.launchUrl)).size,10);
  }
  for(const file of ['site-header.tsx','site-footer.tsx','localized-home.tsx'])assert.match(readFileSync(join(site,'components',file),'utf8'),/getLocalizedConfigurators/);
  console.log('EN/RO/DE/ES/FR/IT website order, numbering, launch links and shared consumers passed.');
}finally{rmSync(temp,{recursive:true,force:true});}
