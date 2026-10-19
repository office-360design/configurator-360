// Real bundled JPG, tile materials and editor. No inference or cloud writes.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright';
const {validateAsset}=createRequire(import.meta.url)('../../firebase-share-backend/functions/hall-ar-core.cjs');
const root=fileURLToPath(new URL('../../',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({
 ...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),
 args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
let releasePhoto;
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const gate=new Promise(resolve=>{releasePhoto=resolve;});
 let photoRequests=0;
 await page.route('**/textures/tetra-nova-gray.jpg*',async route=>{
  photoRequests++;await gate;await route.continue();
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/tiles-configurator/index.html`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.TILES_CONFIGURATOR_API?.restoreState({version:1,tile:'tetraNova',color:'striatedGrey',length:2.4,width:1.8}),null,{timeout:30000});
 const before=await page.evaluate(()=>({state:TILES_CONFIGURATOR_API.getPavingState(),estimate:TILES_CONFIGURATOR_API.getEstimate()}));
 releasePhoto();
 const inspected=await page.evaluate(async()=>{
  const m=await import('/tiles-configurator/js/striatedStone.js'),THREE=await import('three');
  const image=await m.loadStriatedStone();let mismatches=0;
  const previews=[];
  for(let variant=0;variant<m.STRIATED_VARIANTS;variant++){
   const texture=m.createStriatedStoneTexture(THREE,variant),actual=texture.image;
   const c=document.createElement('canvas');c.width=actual.width;c.height=actual.height;
   c.getContext('2d').drawImage(image,...m.STRIATED_FACE_CROPS[variant],0,0,c.width,c.height);
   const expected=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
   const pixels=actual.getContext('2d').getImageData(0,0,c.width,c.height).data;
   for(let i=0;i<pixels.length;i++)if(pixels[i]!==expected[i])mismatches++;
   previews.push(m.striatedStoneURL(variant));texture.dispose();
  }
  return {width:image.naturalWidth,height:image.naturalHeight,mismatches,previews};
 });
 assert.equal(photoRequests,1);assert.equal(inspected.width,2048);assert.equal(inspected.height,1349);
 assert.equal(inspected.mismatches,0);assert.equal(new Set(inspected.previews).size,12);
 const after=await page.evaluate(()=>({state:TILES_CONFIGURATOR_API.getPavingState(),estimate:TILES_CONFIGURATOR_API.getEstimate()}));
 assert.deepEqual(after,before,'Loading a finish must keep geometry and quantities');
 assert.match(await page.locator('[data-key="color"][data-color="striatedGrey"]').getAttribute('style'),/data:image\/png/);
 await page.waitForTimeout(600);
 await page.screenshot({path:path.join(os.tmpdir(),'tiles-photo-finish-preview.png')});
 await page.evaluate(previews=>{
  const board=document.createElement('div');board.id='face-proof';
  board.style='position:fixed;inset:0;z-index:99999;background:#eee;padding:24px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;overflow:auto';
  previews.forEach((url,i)=>{const item=document.createElement('div');item.innerHTML='<span>Face '+(i+1)+'</span><img src="'+url+'" style="display:block;width:100%;aspect-ratio:1.5;image-rendering:auto">';board.append(item);});
  document.body.append(board);
 },inspected.previews);
 await page.screenshot({path:path.join(os.tmpdir(),'tiles-photo-face-crops.png')});
 await page.evaluate(()=>document.getElementById('face-proof').remove());
 if(!process.env.TILES_SKIP_AR_EXPORT){
  const exported=await page.evaluate(async()=>{
   const {createTilesFirebaseARAsset}=await import('/tiles-configurator/js/ar/exportTiles.js?v=tiles-photo-finish-1');
   const output={};
   for(const format of ['glb','usdz']){
    const result=await createTilesFirebaseARAsset(TILES_CONFIGURATOR_API.captureState(),format);
    output[format]=Array.from(new Uint8Array(await result.blob.arrayBuffer()));
   }
   return output;
  });
  for(const [format,bytes]of Object.entries(exported)){
   assert.equal(validateAsset(format,Buffer.from(bytes)).format,format);
   console.log(`Validated photo ${format}: ${bytes.length} bytes`);
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: one JPG load, 12 exact face crops, unchanged 3D design/quantities, previews and no browser errors.');
}finally{
 releasePhoto?.();await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
