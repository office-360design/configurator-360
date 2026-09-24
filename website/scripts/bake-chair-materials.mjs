// Bake the production providers, not substitute textures. Run only when their
// source changes. Browsers fetch the selected maps instead of generating 1K wood.
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { registerChairMaterials } from '../../chair-configurator/js/materials.js';

const providers=new Map(),presets=new Map();
registerChairMaterials({textures:{providers,register:(id,fn)=>providers.set(id,fn)},presets,register:(id,value)=>presets.set(id,value)});
const root=new URL('../public/lite-assets/chair/',import.meta.url);
await mkdir(root,{recursive:true});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),data.length+8);return out;}
function png(data,sourceSize,size){
  const rows=Buffer.alloc(size*(size*4+1)),factor=sourceSize/size;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<4;c++){
    let total=0;for(let dy=0;dy<factor;dy++)for(let dx=0;dx<factor;dx++)total+=data[((y*factor+dy)*sourceSize+x*factor+dx)*4+c];
    rows[y*(size*4+1)+1+x*4+c]=Math.round(total/(factor*factor));
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const manifest={};
for(const id of ['wood.furniture.oak','wood.furniture.beech','wood.furniture.ash','fabric.upholstery.linen','fabric.upholstery.velvet']){
  const spec=presets.get(id),pixels=providers.get(spec.texture)(),size=Math.min(pixels.size,512);
  manifest[id]=spec;
  for(const role of ['color','normal','roughness'])await writeFile(new URL(`${spec.texture}-${role}.png`,root),png(pixels[role],pixels.size,size));
  console.log(`${id}: production maps ${pixels.size}px -> ${size}px`);
}
await writeFile(new URL('presets.json',root),JSON.stringify(manifest,null,2)+'\n');
