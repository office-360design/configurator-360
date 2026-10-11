const COPY = Object.freeze({
  'en-US': Object.freeze({
    title: 'Nicolas chair', subtitle: 'Wood & upholstery material study', wood: 'Wood', upholstery: 'Upholstery',
    woodType: 'Wood type', woodColour: 'Wood colour', fabricType: 'Fabric type', fabricColour: 'Fabric colour',
    customColour: 'Custom colour', dimensions: 'Reference dimensions', width: 'Seat width', depth: 'Seat depth', height: 'Overall height',
    originalGeometry: 'Original procedural chair geometry — no third-party chair mesh.', qualityHint: 'Balanced and High show full surface detail.',
  }),
  'ro-RO': Object.freeze({
    title: 'Scaun Nicolas', subtitle: 'Studiu de materiale pentru lemn și tapițerie', wood: 'Lemn', upholstery: 'Tapițerie',
    woodType: 'Tip lemn', woodColour: 'Culoare lemn', fabricType: 'Tip material', fabricColour: 'Culoare tapițerie',
    customColour: 'Culoare personalizată', dimensions: 'Dimensiuni de referință', width: 'Lățime șezut', depth: 'Adâncime șezut', height: 'Înălțime totală',
    originalGeometry: 'Geometrie originală generată procedural — fără mesh extern pentru scaun.', qualityHint: 'Balanced și High afișează toate detaliile suprafețelor.',
  }),
  'de-DE': Object.freeze({
    title: 'Stuhl Nicolas', subtitle: 'Materialstudie für Holz und Polsterung', wood: 'Holz', upholstery: 'Polsterung',
    woodType: 'Holzart', woodColour: 'Holzfarbe', fabricType: 'Stoffart', fabricColour: 'Stofffarbe',
    customColour: 'Eigene Farbe', dimensions: 'Referenzmaße', width: 'Sitzbreite', depth: 'Sitztiefe', height: 'Gesamthöhe',
    originalGeometry: 'Originale prozedural erzeugte Stuhlgeometrie — kein externes Stuhl-Mesh.', qualityHint: 'Balanced und High zeigen die vollständigen Oberflächendetails.',
  }),
});

export function chairT(locale, key) {
  return COPY[locale]?.[key] ?? COPY['en-US'][key] ?? key;
}

export function formatDimension(mm, units = 'metric', locale = 'en-US') {
  if (units === 'imperial') {
    const inches = mm / 25.4;
    const feet = Math.floor(inches / 12);
    const rest = inches - feet * 12;
    return feet ? `${feet}′ ${rest.toFixed(1)}″` : `${rest.toFixed(1)}″`;
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(mm) + ' mm';
}
