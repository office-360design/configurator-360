// `npm ci --prefix curtain-wall-configurator` installs the exact production pin.
const installed = new URL('../node_modules/three/', import.meta.url);
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('build/three.module.js', installed).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('examples/jsm/' + specifier.slice(13), installed).href, shortCircuit: true };
  return next(specifier, context);
}
