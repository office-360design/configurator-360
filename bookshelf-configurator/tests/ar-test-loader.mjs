/** Offline tests resolve only Three.js to the repository's r160 fixture.
 * Bookshelf production remains pinned to r169 in its import map. */
export async function resolve(specifier, context, next) {
  const base = new URL('../../window-configurator/src/client/lib/', import.meta.url);
  if (specifier === 'three') return { url: new URL('three.module.js', base).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(specifier.slice('three/addons/'.length), base).href, shortCircuit: true };
  return next(specifier, context);
}
