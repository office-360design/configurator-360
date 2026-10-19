// Test-only resolution: the original roof files import Three.js themselves.
// CI installs website dependencies, not a separate root dependency tree.
// Keep native source unchanged and resolve its Three.js from this test's package.
export async function resolve(specifier,context,nextResolve) {
  if (specifier==='three' && context.parentURL?.includes('/roof-configurator/')) {
    return nextResolve(specifier,{...context,parentURL:import.meta.url});
  }
  return nextResolve(specifier,context);
}
