import { ConfigurationError } from './adapters.js';

export type SolarLocationCandidate = {
  candidate: number;
  label: string;
  latitude: number;
  longitude: number;
  type: string;
  houseNumber: string;
  exactAddressMatch: boolean;
};

function normalizeHouseNumber(value: unknown) {
  return String(value || '').toLocaleLowerCase('ro-RO').replace(/[^0-9a-z]/g, '');
}

export function queryConfirmsHouseNumber(query: string, houseNumber: unknown) {
  const normalized = normalizeHouseNumber(houseNumber);
  if (!normalized) return false;
  return query.toLocaleLowerCase('ro-RO')
    .split(/[\s,;]+/)
    .map(normalizeHouseNumber)
    .includes(normalized);
}

export function directSolarLocationSelection(candidates: SolarLocationCandidate[]) {
  const match = candidates.find(candidate => candidate.exactAddressMatch);
  if (!match) return null;
  return {
    locationMode: 'exact',
    exactLocationConsent: true,
    locationLat: match.latitude,
    locationLon: match.longitude,
    locationLabel: match.label,
  };
}

export async function searchSolarLocations(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 3) throw new ConfigurationError('Please provide at least three characters for the location search.', 'query');
  const params = new URLSearchParams({ q: trimmed, format: 'jsonv2', addressdetails: '1', limit: '5', countrycodes: 'ro' });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/json', 'User-Agent': '360Configurator-ChatGPT-MCP/1.0 (https://360configurator.com)' },
  });
  if (!response.ok) throw new ConfigurationError(`Address search is temporarily unavailable (HTTP ${response.status}).`, 'query');
  const rows = await response.json() as Array<Record<string, unknown>>;
  return rows.map((row, index) => {
    const address = row.address && typeof row.address === 'object' ? row.address as Record<string, unknown> : {};
    const houseNumber = String(address.house_number || '');
    return {
      candidate: index + 1,
      label: String(row.display_name || ''),
      latitude: Number(row.lat),
      longitude: Number(row.lon),
      type: String(row.type || ''),
      houseNumber,
      exactAddressMatch: queryConfirmsHouseNumber(trimmed, houseNumber),
    };
  })
    .filter(item => item.label && Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
}
