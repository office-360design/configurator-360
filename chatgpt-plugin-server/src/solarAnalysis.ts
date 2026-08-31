import { ConfigurationError } from './adapters.js';
import type { JsonObject } from './catalog.js';

const PVGIS_ENDPOINT = 'https://aks.360configurator.com/api/solar/pvgis';
const MODULES: Record<string, { watts: number; priceRon: number }> = {
  standard475: { watts: 475, priceRon: 500 }, compact450: { watts: 450, priceRon: 480 }, premium490: { watts: 490, priceRon: 540 },
};
const REGION_YIELDS: Record<string, number> = { dobrogea: 1400, muntenia: 1290, moldova: 1160, transylvania: 1170, northwest: 1090 };

function number(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }

function regionalAnnual(state: JsonObject, kwp: number) {
  const yieldPerKwp = REGION_YIELDS[String(state.region)] || REGION_YIELDS.muntenia;
  const pitchFactor = Math.max(0.78, 1 - Math.abs(number(state.pitch, 30) - 30) * 0.004);
  const side = String(state.roofSide);
  const orientationFactor = side === 'best' || side === 'south' ? 1 : side === 'east' || side === 'west' ? 0.88 : 0.82;
  return kwp * yieldPerKwp * pitchFactor * orientationFactor;
}

function monthlyProduction(data: JsonObject) {
  const output = data.outputs as JsonObject | undefined;
  const monthly = output?.monthly as JsonObject | undefined;
  const rows = monthly?.fixed as unknown[] | undefined;
  const values = Array(12).fill(0);
  if (!Array.isArray(rows)) return values;
  rows.forEach((row, index) => {
    const item = row as JsonObject;
    const month = Math.max(1, Math.min(12, Math.round(number(item.month, index + 1))));
    values[month - 1] = number(item.E_m);
  });
  return values;
}

async function exactPvgis(state: JsonObject, kwp: number) {
  const lat = number(state.locationLat, NaN); const lon = number(state.locationLon, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new ConfigurationError('Exact-site analysis needs confirmed latitude and longitude.', 'locationLat');
  const side = String(state.roofSide);
  const aspect = side === 'east' ? -90 : side === 'west' ? 90 : 0;
  const query = new URLSearchParams({ tool: 'PVcalc', lat: lat.toFixed(6), lon: lon.toFixed(6), outputformat: 'json', pvtechchoice: 'crystSi2025', mountingplace: 'free', loss: '14', angle: String(Math.round(number(state.pitch, 30))), aspect: String(aspect), peakpower: kwp.toFixed(4), usehorizon: '1', raddatabase: 'PVGIS-SARAH3' });
  const response = await fetch(`${PVGIS_ENDPOINT}?${query}`, { signal: AbortSignal.timeout(25_000), headers: { Accept: 'application/json' } });
  const data = await response.json() as JsonObject;
  if (!response.ok) throw new ConfigurationError(`PVGIS exact-site analysis is unavailable: ${String(data.error || data.message || response.status)}.`, 'locationLat');
  const output = data.outputs as JsonObject | undefined;
  const totals = output?.totals as JsonObject | undefined;
  const fixed = totals?.fixed as JsonObject | undefined;
  const annualKWh = number(fixed?.E_y, NaN);
  if (!Number.isFinite(annualKWh) || annualKWh <= 0) throw new ConfigurationError('PVGIS did not return annual production for this site.', 'locationLat');
  return { annualKWh, monthlyKWh: monthlyProduction(data), source: 'PVGIS exact site with terrain horizon', coordinates: { lat, lon } };
}

export async function analyzeSolar(state: JsonObject, runExactSiteAnalysis = false) {
  const module = MODULES[String(state.modulePreset)] || MODULES.standard475;
  const panels = Math.max(1, Math.round(number(state.panelCount, 1)));
  const nominalPowerKwp = panels * module.watts / 1000;
  const annualConsumptionKWh = number(state.monthlyBillRon) / Math.max(0.05, number(state.energyTariffRon, 1.3)) * 12;
  const production = runExactSiteAnalysis && state.locationMode === 'exact'
    ? await exactPvgis(state, nominalPowerKwp)
    : { annualKWh: regionalAnnual(state, nominalPowerKwp), monthlyKWh: [], source: 'Regional calibrated estimate', coordinates: null };
  const dailyConsumption = annualConsumptionKWh / 365;
  const automaticBattery = Math.max(dailyConsumption * 0.48, nominalPowerKwp * 0.7);
  const batteryKWh = state.batteryEnabled ? (state.batteryAutoSize ? automaticBattery <= 5 ? 5 : automaticBattery <= 10 ? 10 : automaticBattery <= 15 ? 15 : 20 : Math.max(2, number(state.batteryCapacityKWh, 5))) : 0;
  const inverter = Math.round(2200 + 340 * Math.min(12, Math.max(1, nominalPowerKwp)) + (state.gridConnection === 'three' ? 900 : 0));
  const preVat = panels * (module.priceRon + number(state.mountingPricePerPanelRon)) + inverter + nominalPowerKwp * number(state.installationPricePerKwpRon) + number(state.paperworkPriceRon) + batteryKWh * number(state.batteryPricePerKWhRon);
  return {
    configuredPanels: panels, nominalPowerKwp: Number(nominalPowerKwp.toFixed(3)), annualProductionKWh: Math.round(production.annualKWh), monthlyProductionKWh: production.monthlyKWh.map(Math.round), productionSource: production.source, exactCoordinates: production.coordinates,
    estimatedAnnualConsumptionKWh: Math.round(annualConsumptionKWh), annualEnergyCoveragePct: annualConsumptionKWh > 0 ? Number(Math.min(100, production.annualKWh / annualConsumptionKWh * 100).toFixed(1)) : null,
    batteryCapacityKWh: batteryKWh, indicativeSystemPriceRon: Math.round(preVat * (1 + number(state.vatRate, 0.21))),
    caveats: ['Roof fit is verified by the live 3D configurator; this analysis uses the requested panel count.', 'Annual energy coverage is not self-sufficiency: hourly consumption, battery dispatch, shading and export rules affect the actual result.', 'This is an indicative production and cost estimate, not an engineering yield guarantee or commercial quotation.'],
  };
}
