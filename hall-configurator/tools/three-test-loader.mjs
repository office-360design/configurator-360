/** Geometry-test adapter only; production keeps its existing pinned CDN imports. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return {
    url: new URL('../../window-configurator/src/client/lib/three.module.js', import.meta.url).href,
    shortCircuit: true,
  };
  return nextResolve(specifier, context);
}
