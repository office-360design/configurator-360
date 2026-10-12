import { buildRoofModel } from "../js/roofFactory.js?v=geometry-14";

// The legacy factory exposes a model, not its material builder. Capture the
// coated-steel finish from a small cloned input; own every retained resource.
// No legacy scene, application state or animation loop is instantiated.
export function createCoatedFinish() {
  const sample = buildRoofModel({
    roofType: "gable",
    length: 2,
    depth: 2,
    wallHeight: 2,
    pitch: 30,
    overhang: 0.1,
    covering: "generic",
    roofColor: "#ffffff",
    technicalEdges: false,
  });
  const materials = new Set(),
    geometries = new Set(),
    sourceTextures = new Set();
  let source;
  sample.group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of list.filter(Boolean)) {
      materials.add(material);
      if (material.isMeshPhysicalMaterial && material.map) source ||= material;
      for (const value of Object.values(material))
        if (value?.isTexture) sourceTextures.add(value);
    }
  });
  if (!source) throw Error("previewUnavailable");
  const template = source.clone(),
    textures = new Set();
  for (const key of [
    "map",
    "normalMap",
    "roughnessMap",
    "bumpMap",
    "metalnessMap",
  ]) {
    if (source[key]) {
      template[key] = source[key].clone();
      textures.add(template[key]);
    }
  }
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  sourceTextures.forEach((t) => t.dispose());
  sample.group.clear();
  return {
    material(part) {
      const m = template.clone();
      m.color.set(part.colour);
      m.emissive.set(part.colour);
      return m;
    },
    dispose() {
      template.dispose();
      textures.forEach((t) => t.dispose());
    },
  };
}
