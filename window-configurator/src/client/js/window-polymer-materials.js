import { getProfileCatalogEntry, isDrainageCapProfile } from './profile-catalog.js';

// Render-only mapping: NEVER rewrite materialKey, profileId, dimensions, catalog
// records, visibility/filter groups or manufacturing metadata. Known accessories
// take precedence over legacy drawing colours (e.g. 275701 was labelled as a seal).
const rigid = Object.freeze({ id: 'plastic.rigid' });
const thermal = Object.freeze({ id: 'plastic.thermalBreak', colorKey: 'iso' });
const foam = Object.freeze({ id: 'plastic.foam', colorKey: 'foam' });
const seal = Object.freeze({ id: 'rubber.epdm', colorKey: 'epdm' });
const central = Object.freeze({ id: 'rubber.epdm', colorKey: 'centralSeal' });
const drainage = Object.freeze({ id: 'plastic.rigid', inheritExteriorColor: true });
export const WINDOW_POLYMER_BY_PROFILE = Object.freeze({
    '275701': rigid, '288319': rigid, '208694': drainage,
    '200988': foam, '245442': foam,
    '224068': central, '224069': central,
    '245472': seal, '224063': seal, '224378': seal, '224379': seal, '224350': seal,
});

export function getWindowPolymerSurface(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const catalog = getProfileCatalogEntry(profile);
    if (catalog && Object.hasOwn(WINDOW_POLYMER_BY_PROFILE, catalog.id)) {
        return WINDOW_POLYMER_BY_PROFILE[catalog.id];
    }
    if (isDrainageCapProfile(profile)) return drainage;
    // Thermal-break / foam subshapes can inherit an aluminium parent ID. Their
    // explicit material classification must still win over that parent record.
    if (profile.materialKey === 'iso') return thermal;
    if (profile.materialKey === 'foam') return foam;
    if (profile.materialKey === 'centralSeal') return central;
    if (profile.materialKey === 'epdm') return seal;
    if (profile.materialKey === 'plastic') return rigid;
    if (profile.materialKey === 'rubber') return seal;
    // Do not infer a polymer just from a dark colour, numeric prefix, or the
    // word "cap". Unknown materials and customer aluminium remain untouched.
    return null;
}
