const NTPEE_SOURCE_HREF = 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/201310';

export const REGULATORY_RULE_PACK = Object.freeze({
  id: 'RO-NTPEE-PE-PUBLIC-DOMAIN',
  version: '2023-01-26.prototype-1',
  jurisdiction: 'RO',
  title: 'NTPEE — Order 89/2018, amended by Order 2/2023',
  consolidationDate: '2023-01-26',
  checkedOn: '2026-09-03',
  verificationStatus: 'requires-authorized-engineer-signoff',
  scope: Object.freeze({
    asset: 'gas-distribution-pipe',
    placement: 'public-domain',
    installation: 'underground',
    materials: Object.freeze(['pe100', 'pe100rc']),
    maximumDesignPressureBar: 6,
    exclusions: Object.freeze([
      'connection-endpoint-specific depth',
      'roads, railways, waterways and protected-area crossings',
      'full Table 1 horizontal clearances',
    ]),
  }),
  source: Object.freeze({
    label: 'Official consolidated NTPEE text',
    href: NTPEE_SOURCE_HREF,
  }),
});

export const REGULATORY_RULES = Object.freeze({
  minimumCover: Object.freeze({
    id: 'RO-NTPEE-075-COVER-001',
    packId: REGULATORY_RULE_PACK.id,
    packVersion: REGULATORY_RULE_PACK.version,
    article: 'Art. 75',
    titleKey: 'validation.cover.title',
    minimumM: 0.9,
    measurementBasis: 'pipe-or-protective-sleeve-top-generatrix',
    sourceLabel: 'NTPEE · Art. 75',
    sourceHref: NTPEE_SOURCE_HREF,
    exception: Object.freeze({
      requiresOsdAgreement: true,
      requiresAdditionalProtection: true,
    }),
  }),
  crossingAngle: Object.freeze({
    id: 'RO-NTPEE-082-ANGLE-001',
    packId: REGULATORY_RULE_PACK.id,
    packVersion: REGULATORY_RULE_PACK.version,
    article: 'Art. 82(1)(a), (2)',
    titleKey: 'validation.crossingAngle.title',
    normalAngleDeg: 90,
    normalToleranceDeg: 0.5,
    exceptionalMinimumAngleDeg: 60,
    sourceLabel: 'NTPEE · Art. 82(1)(a), (2)',
    sourceHref: NTPEE_SOURCE_HREF,
  }),
  crossingOwnerApproval: Object.freeze({
    id: 'RO-NTPEE-082-APPROVAL-001',
    packId: REGULATORY_RULE_PACK.id,
    packVersion: REGULATORY_RULE_PACK.version,
    article: 'Art. 82(1)',
    titleKey: 'validation.crossingApproval.title',
    requiredEvidence: 'crossed-utility-owner-approval',
    sourceLabel: 'NTPEE · Art. 82(1)',
    sourceHref: NTPEE_SOURCE_HREF,
  }),
  crossingVerticalSeparation: Object.freeze({
    id: 'RO-NTPEE-082-SEPARATION-001',
    packId: REGULATORY_RULE_PACK.id,
    packVersion: REGULATORY_RULE_PACK.version,
    article: 'Art. 82(1)(b), (2)',
    titleKey: 'validation.crossingClearance.title',
    normalMinimumM: 0.2,
    normalGasPosition: 'above',
    exceptionalProtection: 'protective-sleeve',
    sourceLabel: 'NTPEE · Art. 82(1)(b), (2)',
    sourceHref: NTPEE_SOURCE_HREF,
  }),
});
