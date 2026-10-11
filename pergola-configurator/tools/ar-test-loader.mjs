/** Offline geometry tests only. Production uses the pergola's locked Three.js.
 * Set PERGOLA_AR_OFFLINE=1 to use the repository's r160 fixture, never ship it.
 */
export async function resolve(specifier, context, next) {
  if (process.env.PERGOLA_AR_OFFLINE === '1') {
    const base = new URL('../../window-configurator/src/client/lib/', import.meta.url);
    if (specifier === 'three') return { url: new URL('three.module.js', base).href, shortCircuit: true };
    if (specifier === 'three/addons/exporters/GLTFExporter.js') return { url: new URL('exporters/GLTFExporter.js', base).href, shortCircuit: true };
    if (specifier === 'three/addons/loaders/GLTFLoader.js') return {
      url: 'data:text/javascript,export class GLTFLoader { loadAsync(){throw new Error("Asset loading is not part of the offline geometry fixture");} }', shortCircuit: true,
    };
  }
  return next(specifier, context);
}
