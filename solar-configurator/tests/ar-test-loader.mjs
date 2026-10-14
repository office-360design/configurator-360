/** Offline regression fixture only; production retains its r169 import map. */
export async function resolve(specifier, context, next) {
  const base = new URL('../../window-configurator/src/client/lib/', import.meta.url);
  if (specifier === 'three') return { url: new URL('three.module.js', base).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(specifier.slice('three/addons/'.length), base).href, shortCircuit: true };
  return next(specifier, context);
}
