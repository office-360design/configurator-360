// Test-only resolution: use the same bundled r160 runtime and GLB exporter as production.
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../../src/client/lib/three.module.js', import.meta.url).href, shortCircuit:true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../../src/client/lib/'+specifier.slice('three/addons/'.length), import.meta.url).href, shortCircuit:true };
  return next(specifier,context);
}
