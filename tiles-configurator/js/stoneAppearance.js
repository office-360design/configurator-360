// Hash nominal stone positions, never array indices: clipping/filtering a row
// must not recolour its neighbours or create periodic palette stripes.
function mix(value){
  value=Math.imul(value^(value>>>16),0x7feb352d);
  value=Math.imul(value^(value>>>15),0x846ca68b);
  return (value^(value>>>16))>>>0;
}
export function stoneAppearance(stone,palette){
  const polygon=stone.polygon||stone.fragments?.[0];
  const x=stone.shadeX??stone.x??polygon.reduce((sum,p)=>sum+p.x,0)/polygon.length;
  const z=stone.shadeZ??stone.z??polygon.reduce((sum,p)=>sum+p.z,0)/polygon.length;
  const seed=mix(mix(Math.round(x*100000))^Math.imul(Math.round(z*100000),0x9e3779b1));
  return {base:Array.isArray(palette)?palette[seed%palette.length]:palette,
    brightness:.96+(mix(seed^0x68bc21eb)/4294967296)*.08};
}
