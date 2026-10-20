# Ipoteze și valori de confirmat

Fiecare punct de aici e o valoare pe care catalogul nu o dă explicit. Când o confirmați (cu Cortizo sau pe un proiect real), actualizați `data/rules/*.json` și ștergeți rândul de aici.

## Calcul

| # | Ipoteză | Unde | De ce |
|---|---|---|---|
| 1 | Săgeata admisă a montantului și traversei: L/200, max. 15 mm | `rules/common.json → deflection` | Uzual EN 13830; catalogul nu dă criteriul. |
| 2 | Verificarea de săgeată se face la vântul caracteristic; clemele, la vânt × 1,5 | `common.json → wind` | Coeficientul 1,5 e în nota de la pag. 678; restul e practică curentă. |
| 3 | Montantul e grindă simplu rezemată între ancoraje | `src/core/statics.js` | Predimensionare; montanții continui peste reazeme ar da valori mai mici. |
| 4 | Un singur tip de montant pe toată fațada (cel mai solicitat ax) | `src/engine.js` | Practică de producție; se poate schimba pe ax. |
| 5 | Ancoraje: reacțiune verticală = greutate / nr. deschideri; orizontală = q · b · L | `src/engine.js` | Simplificare; montantul agățat sus și rezemat jos poate schimba repartiția. |
| 6 | Lucernar: q⊥ = w + s·cos²α + g·cosα; pe tăvițe doar (g + s·cosα)·sinα | `src/engine.js` | Descompunere standard; catalogul nu dă metoda. |

## Debitare

| # | Ipoteză | Unde |
|---|---|---|
| 7 | Presorul și capacul **vertical** se taie pe lungimea deschiderii, fără deducere | `src/engine.js` |
| 8 | Izolatorul RPT vertical, la fel | `src/engine.js` |
| 9 | Cuplajul COR-9971 pe verticală: H − 28,5 (pe orizontală L − 28,5 e din catalog, pag. 1027) | `rules/st52.json`, `rules/sst52.json` |
| 10 | Profilul U COR-9956: latura geamului − 60 mm (2 bucăți: cu 10 mm între ele) | `src/engine.js → clipSystemBOM` |
| 11 | Montanții se înnădesc la fiecare ancoraj | `src/engine.js` |

## Consumuri

| # | Ipoteză | Unde |
|---|---|---|
| 12 | Garnitura de montant: 2 × înălțimea geamului; de traversă: 2 × lățimea; garnitura de presor: pe laturile cu presor | `src/engine.js` |
| 13 | 2 cale de sprijin pe geam | `src/engine.js` |
| 14 | 2 pipete pe fiecare geam din rândul de jos | `src/engine.js` |
| 15 | Cleme: număr = max(2, ⌈lungime utilă / pas⌉ + 1); lungimea utilă după pag. 679 | `src/core/clips.js` |
| 16 | ST 52: garniturile structurii 999003 / 999000 și garniturile de ramă 999172 / 999173 (preluate de la SST pag. 1113 și fereastra ST pag. 1038) | `src/systems/index.js`, `rules/st52.json` |
| 17 | Fereastra de acoperiș: 3 bucăți 254111 (catalogul spune 2 sau 3 după dimensiune) | `rules/skylight.json` |
| 18 | Rosturile perimetrale (racord la clădire) nu sunt în listă | `src/engine.js → notes` |

## Lipsesc din catalog

| # | Ce lipsește | Efect în configurator |
|---|---|---|
| 19 | Capacitatea suportului COR-9942 la SST 52 | câmpurile SST sunt marcate „atenție” |
| 20 | Prețurile | etapa de ofertă nu e implementată |
| 21 | Gama exactă a graficului de cleme sub 0,25 m² | sub 0,25 m² se aplică pasul de 500 mm |

## Grafic digitizat

Graficul de cleme (pag. 678) e digitizat vizual în `rules/common.json → clip_chart.lines`. Precizia e de ±0,1 m² / ±50 Pa la frontierele benzilor.
