// Pasul maxim între cleme (SG, TPH, TPV, ST, SST) după graficul din catalog (pag. 678 / 891 / 1035 / 1153)
// și numărul de cleme pe o latură (pag. 679).

function xOnLine(line, y) {
  // linia e o polilinie (m², Pa); întoarce x pentru un y dat, sau Infinity dacă y e sub capătul ei
  for (let i = 0; i < line.length - 1; i++) {
    const [x1, y1] = line[i], [x2, y2] = line[i + 1];
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    if (y >= lo && y <= hi) {
      if (y1 === y2) return x1; // segment orizontal: frontiera începe la x1
      return x1 + ((y - y1) * (x2 - x1)) / (y2 - y1);
    }
  }
  return Infinity;
}

/**
 * @param {number} suctionPa sucțiunea de CALCUL (nominală × 1,5) [Pa]
 * @param {number} areaM2 suprafața geamului [m²]
 * @param {object} chart common.clip_chart
 * @returns {{pitch:number|null, reason?:{key:string, params:object}}} motivul e un mesaj (src/messages.js)
 */
export function clipPitch(suctionPa, areaM2, chart) {
  if (suctionPa > chart.max_suction_Pa) return { pitch: null, reason: { key: 'clip.overSuction', params: { pa: chart.max_suction_Pa } } };
  if (areaM2 > chart.max_area_m2) return { pitch: null, reason: { key: 'clip.overArea', params: { m2: chart.max_area_m2 } } };
  const y = Math.max(suctionPa, 0), x = areaM2;
  const L = chart.lines;
  if (y <= 1000 || x <= xOnLine(L.L1, y)) return { pitch: 500 };
  if (x <= xOnLine(L.L2, y)) return { pitch: 400 };
  if (x <= xOnLine(L.L3, y)) return { pitch: y > 2000 ? 300 : 350 };
  if (x <= xOnLine(L.L4, y)) return { pitch: y < 1500 ? 300 : 250 };
  if (x <= xOnLine(L.L5, y)) return { pitch: 200 };
  return { pitch: null, reason: { key: 'clip.outsideChart', params: {} } };
}

/** Numărul de cleme pe o latură: minim 2, distribuite egal, respectând pasul maxim. */
export function clipsOnEdge(usableMm, pitch, min = 2) {
  if (!pitch) return min;
  return Math.max(min, Math.ceil(Math.max(usableMm, 0) / pitch) + 1);
}

/** Lungimea utilă pe o latură orizontală de sticlă (pag. 679): prima clemă la 30 mm după suport (suport la L/10). */
export function usableHorizontal(glassW) {
  return glassW < 1400 ? glassW - 2 * (glassW / 10 + 30) : glassW - 2 * (glassW / 20);
}
/** Pe verticală clemele de capăt sunt la 70 mm de axa modulării. */
export function usableVertical(axisLen) { return axisLen - 2 * 70; }
