export type SolarPosition = {
  azimuthDeg: number;
  elevationDeg: number;
  sunriseHour: number;
  sunsetHour: number;
};

const rad = (value: number) => (value * Math.PI) / 180;
const deg = (value: number) => (value * 180) / Math.PI;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Lightweight NOAA-style solar position for the interactive preview. */
export function calculateSolarPosition(
  dateString: string,
  hour: number,
  latitude: number,
): SolarPosition {
  const date = new Date(`${dateString || "2026-06-21"}T12:00:00Z`);
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86400000);
  const declination = rad(23.44) * Math.sin(rad((360 / 365) * (day - 81)));
  const lat = rad(clamp(latitude, -85, 85));
  const hourAngle = rad((hour - 12) * 15);
  const elevation = Math.asin(
    Math.sin(lat) * Math.sin(declination) +
      Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle),
  );
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat),
  );
  const daylightAngle = Math.acos(
    clamp(-Math.tan(lat) * Math.tan(declination), -1, 1),
  );
  const daylightHours = deg(daylightAngle) / 15;
  return {
    azimuthDeg: (deg(azimuth) + 180 + 360) % 360,
    elevationDeg: deg(elevation),
    sunriseHour: 12 - daylightHours,
    sunsetHour: 12 + daylightHours,
  };
}

export function solarDirection(
  dateString: string,
  hour: number,
  latitude: number,
  roofFrontBearing: number,
  radius = 12,
) {
  const position = calculateSolarPosition(dateString, hour, latitude);
  const relativeAzimuth = rad(position.azimuthDeg - roofFrontBearing);
  const elevation = rad(Math.max(-4, position.elevationDeg));
  const horizontal = Math.cos(elevation) * radius;
  return {
    ...position,
    x: Math.sin(relativeAzimuth) * horizontal,
    y: Math.sin(elevation) * radius,
    z: -Math.cos(relativeAzimuth) * horizontal,
  };
}
