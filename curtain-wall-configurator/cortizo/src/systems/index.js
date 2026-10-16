// Definițiile celor 7 sisteme. Partea comună e în engine.js; aici stă doar ce diferă.
// edges: tipul de prindere pe fiecare direcție:
//   pressure = presor + capac (TP)   clip = cleme SG + profil U + rost etanș   frame = ramă proprie (ST/SST)
import { rolesFrom, mergeRoles } from '../core/roles.js';

const tableRoles = (ctx, system, variant, inner, mm) => rolesFrom(ctx.glz.get(system, variant, inner, mm));

export const SYSTEMS = {
  TP52: {
    id: 'TP52', name: 'TP 52', rules: 'tp52', edges: { v: 'pressure', h: 'pressure' },
    usesInnerPane: false, panelFrame: true, window: 'awning_window',
    roles: (ctx, f) => tableRoles(ctx, 'TP 52', f.variant, '', f.glassMm),
  },
  SG52: {
    id: 'SG52', name: 'SG 52', rules: 'sg52', edges: { v: 'clip', h: 'clip' },
    usesInnerPane: true, uProfile: true, window: 'awning_window',
    roles: (ctx, f) => tableRoles(ctx, 'SG 52', f.variant, f.innerPane, f.glassMm),
  },
  TPH52: {
    id: 'TPH52', name: 'TPH 52', rules: 'tph52', edges: { v: 'clip', h: 'pressure' },
    usesInnerPane: true, uProfile: true, panelFrame: true, window: 'awning_window',
    // tabelul TPH dă garnitura de montant, izolatorul, clemele, șurubul și garnitura de fund;
    // suporții, calele, garnitura de traversă și șurubul presorului orizontal vin din TP 52 (pag. 305).
    roles: (ctx, f) => mergeRoles(
      tableRoles(ctx, 'TPH 52', f.variant, f.innerPane, f.glassMm),
      tableRoles(ctx, 'TP 52', 'Standard – nivel 1', '', f.glassMm)),
  },
  TPV52: {
    id: 'TPV52', name: 'TPV 52', rules: 'tpv52', edges: { v: 'pressure', h: 'clip' },
    usesInnerPane: true, uProfile: true, panelFrame: true, window: 'awning_window',
    // tabelul TPV dă garnitura de montant, izolatorul, șurubul presorului și pipeta;
    // pe orizontală (cleme) restul vine din SG 52 cu aceeași foaie interioară.
    roles: (ctx, f) => mergeRoles(
      tableRoles(ctx, 'TPV 52', f.variant, f.innerPane, f.glassMm),
      tableRoles(ctx, 'SG 52', 'Standard siliconat – nivel 1', f.innerPane, f.glassMm)),
  },
  ST52: {
    id: 'ST52', name: 'ST 52', rules: 'st52', edges: { v: 'frame', h: 'frame' },
    usesInnerPane: false, frame: 'structural', window: 'awning_window',
    roles: (ctx) => ({ mullionGasket: '999003', transomGasket: '999000', supportCross: [], _assumed: true }),
  },
  SST52: {
    id: 'SST52', name: 'SST 52', rules: 'sst52', edges: { v: 'frame', h: 'frame' },
    usesInnerPane: false, frame: 'mechanical', window: 'awning_window',
    roles: (ctx, f) => {
      const t = ctx.rules.sst52.glazing_table.rows.find((r) => r[0] === f.glassMm);
      return { mullionGasket: '999003', transomGasket: '999000', sashGasket: t && t[1], reducer: t && t[2], block: '999037', supportCross: [] };
    },
  },
  SKY: {
    id: 'SKY', name: 'Lucernario – Veranda', rules: 'skylight', edges: { v: 'pressure', h: 'silicone' },
    usesInnerPane: false, sloped: true, window: 'roof_window',
    roles: (ctx, f) => {
      const tb = ctx.rules.skylight.glazing_tables.roof;
      const row = tb.rows.find((r) => r[0] === f.glassMm);
      if (!row) return { supportCross: [] };
      const o = Object.fromEntries(tb.columns.map((c, i) => [c, row[i]]));
      return { mullionGasket: o.mullion_gasket_AB, pressureGasket: o.pressure_gasket_CD, rpt: o.mullion_supplement_S1, pressureScrew: o.mullion_screw_T1,
        transomGasket: o.transom_gasket_EF, backer: o.sealing_backer_K, rptTransom: o.transom_supplement_S2, supportStd: o.tray_M1, supportCross: [] };
    },
  },
};

export const SYSTEM_LIST = Object.values(SYSTEMS).map((s) => ({ id: s.id, name: s.name }));
