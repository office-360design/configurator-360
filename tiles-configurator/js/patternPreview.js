import {stoneAppearance} from './stoneAppearance.js';
import {COLORS,TILES,layout,normalize} from './model.js';

// Use the real layout engine so thumbnails show the actual supported bonds,
// proportions and orientation, including the chosen checkerboard colours.
export function patternPreview(state,pattern){
  const tile=TILES[state.tile]||TILES.parket;
  const size=Math.max(1,tile.length*4);
  const sample=normalize({...state,shape:'rectangle',length:size,width:size,pattern,houseEnabled:false});
  const scale=120/size;
  const stones=layout(sample).map(piece=>{
    const palette=COLORS[piece.accent?sample.accent:sample.color];
    const color=stoneAppearance(piece,palette).base;
    if(piece.outline)return `<polygon points="${piece.outline.map(p=>`${(p.x*scale).toFixed(3)},${(p.z*scale).toFixed(3)}`).join(' ')}" fill="${color}" stroke="#e8e3d9" stroke-width="1"/>`;
    const x=(piece.x-piece.l/2)*scale,y=(piece.z-piece.w/2)*scale;
    return `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${(piece.l*scale).toFixed(3)}" height="${(piece.w*scale).toFixed(3)}" fill="${color}" stroke="#e8e3d9" stroke-width="1"/>`;
  }).join('');
  return `<svg class="pattern-preview" viewBox="0 0 120 120" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#e8e3d9"/>${stones}</svg>`;
}
