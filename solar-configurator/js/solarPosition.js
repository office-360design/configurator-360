import { regionPresets } from './state.js?v=2';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const DAY_MS = 86400000;
const DEFAULT_TIME_ZONE = 'Europe/Bucharest';
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const normalizeDeg = (value) => ((value % 360) + 360) % 360;
const timesCache = new Map();

function parseDateParts(dateString) {
  const match = String(dateString || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}

function zonedParts(date, timeZone = DEFAULT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  return parts;
}

function timeZoneOffsetMs(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = zonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - date.getTime();
}

export function localDateTimeToUtc(dateString, decimalHour, timeZone = DEFAULT_TIME_ZONE) {
  const { year, month, day } = parseDateParts(dateString);
  const totalMinutes = clamp(Math.round((Number(decimalHour) || 0) * 60), 0, 1439);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let estimate = new Date(wallClockUtc);
  // Two passes handle DST boundaries while keeping the implementation API-free.
  for (let pass = 0; pass < 2; pass += 1) {
    estimate = new Date(wallClockUtc - timeZoneOffsetMs(estimate, timeZone));
  }
  return estimate;
}

function solarTerms(date) {
  const julianDay = date.getTime() / DAY_MS + 2440587.5;
  const t = (julianDay - 2451545.0) / 36525;
  const geomMeanLong = normalizeDeg(280.46646 + t * (36000.76983 + t * 0.0003032));
  const geomMeanAnomaly = normalizeDeg(357.52911 + t * (35999.05029 - 0.0001537 * t));
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const anomalyRad = geomMeanAnomaly * DEG;
  const equationCenter = Math.sin(anomalyRad) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * anomalyRad) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * anomalyRad) * 0.000289;
  const trueLongitude = geomMeanLong + equationCenter;
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const meanObliquity = 23 + (26 + ((21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60)) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(omega * DEG);
  const declination = Math.asin(Math.sin(obliquity * DEG) * Math.sin(apparentLongitude * DEG));
  const y = Math.tan((obliquity * DEG) / 2) ** 2;
  const longRad = geomMeanLong * DEG;
  const equationTime = 4 * RAD * (
    y * Math.sin(2 * longRad)
    - 2 * eccentricity * Math.sin(anomalyRad)
    + 4 * eccentricity * y * Math.sin(anomalyRad) * Math.cos(2 * longRad)
    - 0.5 * y * y * Math.sin(4 * longRad)
    - 1.25 * eccentricity * eccentricity * Math.sin(2 * anomalyRad)
  );
  return { declination, equationTime };
}

export function calculateSolarPosition(date, latitude, longitude) {
  const lat = clamp(Number(latitude) || 0, -89.9, 89.9) * DEG;
  const lon = clamp(Number(longitude) || 0, -180, 180);
  const { declination, equationTime } = solarTerms(date);
  const utcMinutes = date.getUTCHours() * 60
    + date.getUTCMinutes()
    + date.getUTCSeconds() / 60;
  let trueSolarMinutes = (utcMinutes + equationTime + 4 * lon) % 1440;
  if (trueSolarMinutes < 0) trueSolarMinutes += 1440;
  const hourAngleDeg = trueSolarMinutes / 4 < 0
    ? trueSolarMinutes / 4 + 180
    : trueSolarMinutes / 4 - 180;
  const hourAngle = hourAngleDeg * DEG;
  const sinElevation = Math.sin(lat) * Math.sin(declination)
    + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = Math.asin(clamp(sinElevation, -1, 1));
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat),
  ) * RAD + 180;

  return {
    elevationDeg: elevation * RAD,
    azimuthDeg: normalizeDeg(azimuth),
    hourAngleDeg,
    equationTimeMinutes: equationTime,
    declinationDeg: declination * RAD,
    isDaylight: elevation * RAD > -0.833,
  };
}

export function getActiveLocation(state) {
  if (state?.locationMode === 'exact'
    && Number.isFinite(Number(state.locationLat))
    && Number.isFinite(Number(state.locationLon))) {
    const baseLat = Number(state.locationLat);
    const baseLon = Number(state.locationLon);
    const northM = Number(state.environmentLocalNorthM) || 0;
    const eastM = Number(state.environmentLocalEastM) || 0;
    // Keep the small Phase 2 local-position adjustment geodetically meaningful.
    // This means the same adjusted house point is used for real sun geometry and
    // the Phase 3 PVGIS lookup without having to move the map pin itself.
    const metersPerDegreeLat = 111320;
    const latitude = baseLat + northM / metersPerDegreeLat;
    const lonScale = Math.max(0.01, Math.cos(latitude * Math.PI / 180));
    const longitude = baseLon + eastM / (metersPerDegreeLat * lonScale);
    return {
      mode: 'exact',
      lat: latitude,
      lon: longitude,
      label: state.locationLabel || `${baseLat.toFixed(4)}, ${baseLon.toFixed(4)}`,
      timeZone: state.locationTimeZone || DEFAULT_TIME_ZONE,
      localEastM: eastM,
      localNorthM: northM,
    };
  }
  const region = regionPresets[state?.region] || regionPresets.muntenia;
  return {
    mode: 'region',
    lat: region.lat,
    lon: region.lon,
    label: `${region.city} reference`,
    timeZone: state?.locationTimeZone || DEFAULT_TIME_ZONE,
  };
}

function dateStringFromParts(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getTodayInTimeZone(timeZone = DEFAULT_TIME_ZONE) {
  const parts = zonedParts(new Date(), timeZone);
  return dateStringFromParts(parts.year, parts.month, parts.day);
}

export function getSeasonPresetDate(currentDate, season) {
  const { year } = parseDateParts(currentDate);
  const monthDays = {
    spring: [3, 20],
    summer: [6, 21],
    autumn: [9, 22],
    winter: [12, 21],
  };
  const pair = monthDays[season];
  if (!pair) return currentDate;
  return dateStringFromParts(year, pair[0], pair[1]);
}

export function getSeasonForDate(dateString) {
  const { month, day } = parseDateParts(dateString);
  const ordinal = month * 100 + day;
  if (ordinal >= 320 && ordinal < 621) return 'spring';
  if (ordinal >= 621 && ordinal < 922) return 'summer';
  if (ordinal >= 922 && ordinal < 1221) return 'autumn';
  return 'winter';
}

export function formatAzimuth(azimuth) {
  const normalized = normalizeDeg(Number(azimuth) || 0);
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(normalized / 45) % 8;
  return `${Math.round(normalized)}° ${directions[index]}`;
}

function formatTime(date, timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function localHour(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = zonedParts(date, timeZone);
  return parts.hour + parts.minute / 60 + parts.second / 3600;
}

export function getSunTimes(state) {
  const location = getActiveLocation(state);
  const dateString = state?.simulationDate || getTodayInTimeZone(location.timeZone);
  const cacheKey = `${dateString}|${location.lat.toFixed(5)}|${location.lon.toFixed(5)}|${location.timeZone}`;
  if (timesCache.has(cacheKey)) return timesCache.get(cacheKey);

  const { year, month, day } = parseDateParts(dateString);
  const localNoon = localDateTimeToUtc(dateString, 12, location.timeZone);
  const { declination, equationTime } = solarTerms(localNoon);
  const lat = clamp(location.lat, -89.9, 89.9) * DEG;
  const zenith = 90.833 * DEG;
  const cosHourAngle = (Math.cos(zenith) / (Math.cos(lat) * Math.cos(declination)))
    - Math.tan(lat) * Math.tan(declination);

  let result;
  if (cosHourAngle > 1) {
    result = { sunrise: null, sunset: null, solarNoon: null, sunriseHour: 24, sunsetHour: 0, daylightHours: 0 };
  } else if (cosHourAngle < -1) {
    result = { sunrise: null, sunset: null, solarNoon: null, sunriseHour: 0, sunsetHour: 24, daylightHours: 24 };
  } else {
    const hourAngleDeg = Math.acos(clamp(cosHourAngle, -1, 1)) * RAD;
    const solarNoonUtcMinutes = 720 - 4 * location.lon - equationTime;
    const midnightUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
    const solarNoon = new Date(midnightUtc + solarNoonUtcMinutes * 60000);
    const sunrise = new Date(midnightUtc + (solarNoonUtcMinutes - 4 * hourAngleDeg) * 60000);
    const sunset = new Date(midnightUtc + (solarNoonUtcMinutes + 4 * hourAngleDeg) * 60000);
    result = {
      sunrise,
      sunset,
      solarNoon,
      sunriseHour: localHour(sunrise, location.timeZone),
      sunsetHour: localHour(sunset, location.timeZone),
      daylightHours: (sunset.getTime() - sunrise.getTime()) / 3600000,
    };
  }

  const enriched = {
    ...result,
    dateString,
    location,
    sunriseLabel: result.sunrise ? formatTime(result.sunrise, location.timeZone) : '—',
    sunsetLabel: result.sunset ? formatTime(result.sunset, location.timeZone) : '—',
    solarNoonLabel: result.solarNoon ? formatTime(result.solarNoon, location.timeZone) : '—',
  };
  timesCache.set(cacheKey, enriched);
  if (timesCache.size > 80) timesCache.delete(timesCache.keys().next().value);
  return enriched;
}

export function getSolarContext(state, hour = state?.simulationHour ?? 12) {
  const location = getActiveLocation(state);
  const dateString = state?.simulationDate || getTodayInTimeZone(location.timeZone);
  const localHourValue = clamp(Number(hour) || 0, 0, 23.9833);
  const instant = localDateTimeToUtc(dateString, localHourValue, location.timeZone);
  const position = calculateSolarPosition(instant, location.lat, location.lon);
  const times = getSunTimes({ ...state, simulationDate: dateString });
  return {
    ...position,
    instant,
    dateString,
    hour: localHourValue,
    location,
    times,
  };
}

export function getSunPathSamples(state, stepMinutes = 15) {
  const times = getSunTimes(state);
  if (!times.sunrise || !times.sunset) return [];
  const start = Math.max(0, times.sunriseHour - 0.1);
  const end = Math.min(24, times.sunsetHour + 0.1);
  const step = Math.max(5, Number(stepMinutes) || 15) / 60;
  const samples = [];
  for (let hour = start; hour <= end + 1e-6; hour += step) {
    const context = getSolarContext(state, Math.min(23.9833, hour));
    samples.push({ hour, elevationDeg: context.elevationDeg, azimuthDeg: context.azimuthDeg });
  }
  return samples;
}

export function nearestRegionKey(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'muntenia';
  let bestKey = 'muntenia';
  let bestDistance = Infinity;
  Object.entries(regionPresets).forEach(([key, region]) => {
    const latDelta = lat - region.lat;
    const lonDelta = (lon - region.lon) * Math.cos(((lat + region.lat) / 2) * DEG);
    const distance = latDelta * latDelta + lonDelta * lonDelta;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestKey = key;
    }
  });
  return bestKey;
}
