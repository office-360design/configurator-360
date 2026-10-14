// Chair's production import map uses these exact vendored files (Three r160).
export async function resolve(specifier, context, next) {
  const base = new URL('../lib/', import.meta.url);
  if (specifier === 'three') return { url: new URL('three.module.js', base).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(specifier.slice(13), base).href, shortCircuit: true };
  return next(specifier, context);
}
