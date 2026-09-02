# Regulatory boundary for the gas prototype

Checked on 2026-09-02. This note records the product decisions behind the first
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

The first slice follows those boundaries: route geometry, quantities and costs can be
explored, while throughput, numeric compliance and official network capacity remain
unresolved.

## Rules intentionally not encoded yet

No numeric depth, clearance, crossing, protective-sleeve or material/pressure rule is
currently represented as a regulatory pass/fail result. The visible pipe diameter, SDR,
cover, trench and material choices are prototype catalogue inputs only.

Before any numeric rule is enabled, it should be entered into a versioned rule registry
with:

1. jurisdiction and asset scope;
2. pressure/material/diameter/placement applicability conditions;
3. the exact source, article/table and consolidation date;
4. normal rule, exceptions and required evidence;
5. `pass`, `warning`, `blocked` or `not-evaluated` behavior;
6. sign-off by a Romanian ANRE-authorized gas designer and verifier.

## Recommended next implementation slice

Build the regulatory matrix and rule-engine contract before adding automatic terrain or
soil integrations. Start with a narrow scenario - an underground PE distribution
connection in the public domain - and validate cover plus one utility crossing end to
end. This establishes the evidence/citation pattern that every later rule and geospatial
layer must follow.

After that foundation is signed off, add data adapters in this order:

1. surveyed or approved elevation profile;
2. geotechnical boreholes/polygons with provenance and confidence;
3. utility-owner plans and field-verification records;
4. road, rail, water and protected-area crossings;
5. OSD network and hydraulic inputs under the applicable data agreement.

Public basemaps are suitable for orientation only. They are not evidence that underground
utilities are absent, and soil/geology layers should be presented as screening data until
confirmed by project-specific investigation.
