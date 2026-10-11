// Test-only resolution: use the same bundled r160 runtime and GLB exporter as production.
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../../src/client/lib/three.module.js', import.meta.url).href, shortCircuit:true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../../src/client/lib/'+specifier.slice('three/addons/'.length), import.meta.url).href, shortCircuit:true };
  // The production static build copies these sibling libraries into the
  // client root. Resolve the same imports from source when testing controllers.
  if (context.parentURL && specifier.startsWith('.')) {
    const resolved = new URL(specifier, context.parentURL);
    for (const name of ['shared-3d', 'shared-ui']) {
      const copiedPrefix = new URL(`../../src/client/${name}/`, import.meta.url).href;
      if (resolved.href.startsWith(copiedPrefix)) {
        return { url: new URL(`../../../${name}/${resolved.href.slice(copiedPrefix.length)}`, import.meta.url).href, shortCircuit: true };
      }
    }
  }
  return next(specifier,context);
}
