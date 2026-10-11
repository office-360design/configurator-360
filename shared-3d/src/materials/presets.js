// Material identities describe the visible surface, not the component underneath it.
// Values are calibrated starting points, not manufacturer-certified finish measurements.
export const MATERIAL_PRESETS = Object.freeze({
  'aluminium.powderCoated': Object.freeze({
    type: 'standard', color: '#383e42', metalness: 0, roughness: 0.58, envMapIntensity: 0.72,
    // Subtle fine-grain coating. It should read clean in a full product view
    // and become visible only at close range under grazing light.
    textureSet: 'powder.fine', texture: 'powder', normalStrength: 0.16, tile: [0.035, 0.035],
  }),
  'aluminium.bare': Object.freeze({
    type: 'standard', color: '#d6dade', metalness: 1, roughness: 0.3, envMapIntensity: 1.12,
    textureSet: 'aluminium.brushed', texture: 'brushed', normalStrength: 0.07, tile: [0.8, 0.025],
  }),
  'aluminium.anodized': Object.freeze({
    type: 'standard', color: '#bfc5ca', metalness: 0.85, roughness: 0.43, envMapIntensity: 0.96,
    textureSet: 'aluminium.brushed', texture: 'brushed', normalStrength: 0.05, tile: [0.8, 0.025],
  }),
  // Visual polymer categories, not supplier-certified formulations or finishes.
  // No clearcoat/transmission layers: these opaque parts use the standard PBR pass.
  'plastic.rigid': Object.freeze({
    type: 'standard', color: '#34383d', metalness: 0, roughness: 0.46, envMapIntensity: 0.72,
    texture: 'polymer.molded', normalStrength: 0.055, tile: Object.freeze([0.016, 0.016]),
  }),
  'plastic.thermalBreak': Object.freeze({
    type: 'standard', color: '#41474e', metalness: 0, roughness: 0.78, envMapIntensity: 0.55,
    texture: 'polymer.molded', normalStrength: 0.09, tile: Object.freeze([0.024, 0.024]),
  }),
  'plastic.foam': Object.freeze({
    type: 'standard', color: '#9aa1a8', metalness: 0, roughness: 0.95, envMapIntensity: 0.35,
    texture: 'polymer.cellular', normalStrength: 0.085, tile: Object.freeze([0.025, 0.025]),
  }),
  'rubber.epdm': Object.freeze({
    type: 'standard', color: '#20242a', metalness: 0, roughness: 0.83, envMapIntensity: 0.65,
    texture: 'rubber.fine', normalStrength: 0.045, tile: Object.freeze([0.012, 0.012]),
  }),
  // Accessory appearance categories, not claims about a supplier's composition.
  'rubber.softTouch': Object.freeze({
    type: 'standard', color: '#242a2e', metalness: 0, roughness: 0.78, envMapIntensity: 0.5,
    texture: 'rubber.fine', normalStrength: 0.045, tile: Object.freeze([0.012, 0.012]),
  }),
  'steel.brushed': Object.freeze({
    type: 'standard', color: '#98a4a9', metalness: 1, roughness: 0.34, envMapIntensity: 0.85,
    textureSet: 'aluminium.brushed', texture: 'brushed', normalStrength: 0.045,
    tile: Object.freeze([0.25, 0.025]),
  }),
  'fabric.screen': Object.freeze({
    type: 'standard', color: '#67757d', metalness: 0, roughness: 0.9, envMapIntensity: 0.45,
    texture: 'fabric.woven', normalStrength: 0.18, tile: Object.freeze([0.012, 0.012]),
    transparent: true, opacity: 0.78, depthWrite: false,
    // Compensation for mean weave coverage keeps Low/detail opacity comparable.
    lowOpacity: 0.733,
  }),
  'plastic.diffuser': Object.freeze({
    type: 'standard', color: '#f5f4ed', metalness: 0, roughness: 0.38, envMapIntensity: 0.5,
    // Cheap opaque approximation for small light covers, not refractive glass.
    emissive: '#000000', emissiveIntensity: 1,
  }),
  'glass.clear': Object.freeze({
    type: 'glass', color: '#ffffff', metalness: 0, roughness: 0.045, envMapIntensity: 1,
    ior: 1.5, transmission: 0.96, thickness: 0.006,
  }),
  // Visual architectural glazing, not a manufacturer-certified IGU optical model.
  // Keep glass.clear unchanged for other configurators and existing saved variants.
  'glass.architectural': Object.freeze({
    type: 'glass', color: '#ffffff', metalness: 0, roughness: 0.025, envMapIntensity: 1,
    ior: 1.5, transmission: 1, thickness: 0.006,
    attenuationColor: '#ecf6f2', attenuationDistance: 2, lowOpacity: 0.18, fog: false,
  }),
  'wood.deck': Object.freeze({
    type: 'standard', color: '#ffffff', metalness: 0, roughness: 0.76, envMapIntensity: 0.28,
    texture: 'oak', textureSet: 'wood.deck', normalStrength: 0.12, assetNormalStrength: 0.14,
    tile: [2.4, 0.24], assetTile: [1.5, 1.5],
  }),
  'wood.oak': Object.freeze({
    type: 'standard', color: '#ffffff', metalness: 0, roughness: 0.76, envMapIntensity: 0.28,
    texture: 'oak', normalStrength: 0.12, tile: [2.4, 0.24],
  }),
});
