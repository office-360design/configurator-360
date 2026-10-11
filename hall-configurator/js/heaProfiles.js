// HEA reference data used only by the read-only Steel structure information panel.
// The selected row does NOT alter hall geometry. Future engineering criteria can
// update state.selectedHeaProfile to switch the displayed reference row.
export const HEA_PROFILES = Object.freeze({
  'HEA 100': { theoreticalWeight: '16.7', commercialWeight: '17.1', h1: '96',  b: '100', s: '5.0', t: '8.0',  h2: '80',  h3: '56',  F: '21.24', Wx: '72.76',  Wy: '26.7' },
  'HEA 120': { theoreticalWeight: '19.9', commercialWeight: '20.4', h1: '114', b: '120', s: '5.0', t: '8.0',  h2: '98',  h3: '74',  F: '25.34', Wx: '106.3',  Wy: '38.4' },
  'HEA 140': { theoreticalWeight: '24.7', commercialWeight: '25.3', h1: '133', b: '140', s: '5.5', t: '8.5',  h2: '116', h3: '92',  F: '31.42', Wx: '155.4',  Wy: '55.6' },
  'HEA 160': { theoreticalWeight: '30.4', commercialWeight: '31.2', h1: '152', b: '160', s: '6.0', t: '9.0',  h2: '134', h3: '104', F: '38.77', Wx: '220.1',  Wy: '76.9' },
  'HEA 180': { theoreticalWeight: '35.5', commercialWeight: '36.4', h1: '171', b: '180', s: '6.0', t: '9.5',  h2: '152', h3: '122', F: '45.25', Wx: '293.6',  Wy: '102.7' },
  'HEA 200': { theoreticalWeight: '42.3', commercialWeight: '43.0', h1: '190', b: '200', s: '6.5', t: '10.0', h2: '170', h3: '134', F: '53.83', Wx: '388.6',  Wy: '133.6' },
  'HEA 220': { theoreticalWeight: '50.5', commercialWeight: '52.0', h1: '210', b: '220', s: '7.0', t: '11.0', h2: '188', h3: '152', F: '64.34', Wx: '515.2',  Wy: '177.7' },
  'HEA 240': { theoreticalWeight: '60.3', commercialWeight: '62.0', h1: '230', b: '240', s: '7.5', t: '12.0', h2: '206', h3: '164', F: '76.84', Wx: '675.1',  Wy: '230.7' },
  'HEA 260': { theoreticalWeight: '68.2', commercialWeight: '70.0', h1: '250', b: '260', s: '7.5', t: '12.5', h2: '225', h3: '177', F: '86.82', Wx: '836.4',  Wy: '282.1' },
  'HEA 280': { theoreticalWeight: '76.4', commercialWeight: '78.0', h1: '270', b: '280', s: '8.0', t: '13.0', h2: '244', h3: '196', F: '97.26', Wx: '1013.0', Wy: '340.2' },
});

export function getHeaProfile(name) {
  return HEA_PROFILES[name] ?? HEA_PROFILES['HEA 220'];
}
