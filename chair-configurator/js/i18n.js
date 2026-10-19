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
  'es-ES': Object.freeze({
    title: 'Silla Nicolas', subtitle: 'Estudio de materiales de madera y tapicería', wood: 'Madera', upholstery: 'Tapicería',
    woodType: 'Tipo de madera', woodColour: 'Color de la madera', fabricType: 'Tipo de tejido', fabricColour: 'Color del tejido',
    customColour: 'Color personalizado', dimensions: 'Dimensiones de referencia', width: 'Ancho del asiento', depth: 'Fondo del asiento', height: 'Altura total',
    originalGeometry: 'Geometría original de la silla generada proceduralmente, sin malla de terceros.', qualityHint: 'Balanced y High muestran todo el detalle de las superficies.',
  }),
  'fr-FR': Object.freeze({
    title: 'Chaise Nicolas', subtitle: 'Étude de matériaux bois et garnissage', wood: 'Bois', upholstery: 'Garnissage',
    woodType: 'Essence de bois', woodColour: 'Couleur du bois', fabricType: 'Type de tissu', fabricColour: 'Couleur du tissu',
    customColour: 'Couleur personnalisée', dimensions: 'Dimensions de référence', width: 'Largeur d’assise', depth: 'Profondeur d’assise', height: 'Hauteur totale',
    originalGeometry: 'Géométrie de chaise originale générée de façon procédurale — aucun maillage tiers.', qualityHint: 'Balanced et High affichent tous les détails des surfaces.',
  }),
  'it-IT': Object.freeze({
    title: 'Sedia Nicolas', subtitle: 'Studio dei materiali per legno e imbottitura', wood: 'Legno', upholstery: 'Imbottitura',
    woodType: 'Tipo di legno', woodColour: 'Colore del legno', fabricType: 'Tipo di tessuto', fabricColour: 'Colore del tessuto',
    customColour: 'Colore personalizzato', dimensions: 'Dimensioni di riferimento', width: 'Larghezza seduta', depth: 'Profondità seduta', height: 'Altezza totale',
    originalGeometry: 'Geometria originale della sedia generata proceduralmente — nessuna mesh di terzi.', qualityHint: 'Balanced e High mostrano tutti i dettagli delle superfici.',
  }),
});

export const CHAIR_COPY = COPY;
export const CHAIR_LOCALES = Object.freeze(Object.keys(COPY));

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
