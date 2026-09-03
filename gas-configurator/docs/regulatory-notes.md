# Regulatory boundary for the gas prototype

Checked on 2026-09-03. This note records the product decisions behind the first
prototype; it is not legal or engineering advice.

## Sources reviewed

- User-supplied consolidated text of the Regulation on connection to the natural-gas
  distribution system, approved by ANRE Order 7/2022. The supplied copy is consolidated
  to 2024-03-21 and includes the amendment made by Order 136/2022.
- User-supplied `legi-norme-gaz.txt`, treated as a research index rather than an
  authoritative rule source. It contains at least one superseded/inconsistent reference
  to the connection regulation, so its entries must be verified individually.
- [Official ANRE technical-norms index](https://arhiva.anre.ro/ro/gaze-naturale/legislatie/reglementari-tehnice/norme-tehnice1387184362),
  which identifies Order 89/2018 as the technical norms for design, execution and
  operation of gas-supply systems and identifies Order 2/2023 as an amendment.
- [Official legislative portal entry for the Order 89/2018 norms](https://legislatie.just.ro/Public/DetaliiDocumentAfis/201310).
- [Official legislative portal entry for Order 2/2023](https://legislatie.just.ro/Public/DetaliiDocumentAfis/264378),
  the amendment reflected in the 2023-01-26 consolidation used by this prototype.
- [Official legislative portal entry for Order 7/2022](https://legislatie.just.ro/Public/DetaliiDocumentAfis/252209).

## Product consequences already encoded

Order 7/2022 is primarily a connection-process regulation, not a complete geometric
design rulebook. The supplied consolidation supports several important boundaries:

- Article 3 defines OEP and OEE as ANRE-authorized economic operators for design and
  execution. The prototype therefore never labels its output an approved design.
- Article 23 says the OSD establishes the technical connection solution while considering
  distribution capacity and operating regimes, the technical norms, safety, economic
  efficiency and environmental protection. Pipe geometry alone therefore cannot produce
  an official capacity or connection solution.
- Article 23 also makes placement part of the OSD solution. A route drawn by the user is
  consequently a screening proposal, even when the geometry itself is valid.
- ATR, survey/ground investigation, utility-owner information and authorized technical
  review are tracked as evidence states instead of being silently assumed.

The prototype follows those boundaries: route geometry, quantities and costs can be
explored, while throughput and official network capacity remain unresolved. A narrow
numeric rule pack is now available for screening, with each result linked to its rule ID,
pack version and official source.

## Implemented screening rules

Rule pack `RO-NTPEE-PE-PUBLIC-DOMAIN@2023-01-26.prototype-1` applies only to underground
PE distribution pipe in the public domain with design pressure up to and including 6 bar.
It is marked `requires-authorized-engineer-signoff` and implements:

1. `RO-NTPEE-075-COVER-001`: Article 75 minimum 0.90 m cover, measured from the upper
   generatrix of the pipe or protective sleeve. A reduction is blocked unless both OSD
   agreement and additional protection are declared; with both declarations it remains
   an exception warning, not a pass.
2. `RO-NTPEE-082-APPROVAL-001`: Article 82 requires the approval of the owner of the
   crossed installation or construction. A declared crossing is blocked until that
   approval is declared as documented.
3. `RO-NTPEE-082-ANGLE-001`: Article 82 normally requires a perpendicular crossing. A
   declared angle from 60 degrees up to, but not perpendicular to, 90 degrees is treated
   as an exceptional warning; below 60 degrees is blocked.
4. `RO-NTPEE-082-SEPARATION-001`: Article 82 normally requires the gas pipe to be at least
   0.20 m above the crossed installation. If that relation is not met, the result is blocked
   unless a protective sleeve is declared, in which case it remains an exceptional warning.

The crossing is manually declared at a route chainage and appears on both plan and profile.
It is not inferred from the basemap. Plan provenance (`missing`, utility-owner plan, or field
verified) remains an independent evidence result so plausible geometry cannot conceal weak
input data.

## Rules intentionally not encoded yet

The current pack does not cover the Article 75 connection-endpoint depth, Article 30/Table 1
horizontal clearances, trench-width/bedding construction rules, detailed sleeve dimensions,
or road, rail, water and protected-area crossings. Diameter, SDR and most material/pressure
choices remain prototype catalogue inputs.

Every additional numeric rule should follow the same registry contract:

1. jurisdiction and asset scope;
2. pressure/material/diameter/placement applicability conditions;
3. the exact source, article/table and consolidation date;
4. normal rule, exceptions and required evidence;
5. `pass`, `warning`, `blocked` or `not-evaluated` behavior;
6. sign-off by a Romanian ANRE-authorized gas designer and verifier.

## Recommended next implementation slice

Have a Romanian ANRE-authorized gas designer and verifier review the pack's applicability,
wording and exception behavior. After that review, add the Article 30/Table 1 horizontal
clearance matrix and the Article 194/196 trench construction rules before expanding into
special crossings.

After that foundation is signed off, add data adapters in this order:

1. surveyed or approved elevation profile;
2. geotechnical boreholes/polygons with provenance and confidence;
3. utility-owner plans and field-verification records;
4. road, rail, water and protected-area crossings;
5. OSD network and hydraulic inputs under the applicable data agreement.

Public basemaps are suitable for orientation only. They are not evidence that underground
utilities are absent, and soil/geology layers should be presented as screening data until
confirmed by project-specific investigation.
