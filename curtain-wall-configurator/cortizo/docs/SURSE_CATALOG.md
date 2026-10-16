# Unde e fiecare informație în catalog

Catalog: Cortizo „Sistemas de fachadas y lucernarios”, v26.04.01 (04/2026), 1316 pagini. Paginile sunt numerele din PDF.

| Capitol | Pagini | Ce conține | Folosit în proiect |
|---|---|---|---|
| Informații generale | 4–12 | prezentare sisteme, comparație Ucw | `catalog/ucw.json` (pag. 12) |
| 1. Lista profilelor | 13–26 | cod, greutate, suprafață, pagina desenului | `catalog/profiles.json` |
| Tabele de familie | 27–32 | montanți + cămăși, traverse, presoare, capace, inerții combinate | `catalog/mullions.json`, `catalog/transoms.json` |
| 2. Profile la scară | 33–112 | Ix, Iy pe fiecare profil | `catalog/profiles.json` |
| 3. Lista accesoriilor | 113–136 | cod, descriere, culoare, tip | `catalog/accessories.json` |
| 4. Fișe accesorii | 137–180 | desene | – |
| 5. Structura portantă | 181–252 | îmbinări (183–211), înnădire (212), ancoraje (214–243), consolă (244–247), suporți sticlă (250–251) | `rules/common.json`, `catalog/glass_supports.json` |
| 6. Prelucrări cu ștanța | 253–288 | producție | – |
| 7. TP 52 | 289–564 | caracteristici 291, teste 299–301, vitraje 305–321, secțiuni 323–376, debitări 379, zonă oarbă 388, fereastră 391–437 | `rules/tp52.json`, `catalog/glazing_tables.json` |
| 8. SG 52 | 565–756 | caracteristici 567–571, teste 575–577, vitraje 579–607, profil U 669–670, dimensiuni max. 671–674, cleme 678–679, etanșare 682, traversă poligonală 683, fereastră 684–734 | `rules/sg52.json` |
| 9. TPH 52 / TPV 52 | 757–984 | teste 767–773, vitraje 775–818, fabricare 887–901, ferestre 902–910 | `rules/tph52.json`, `rules/tpv52.json` |
| 10. ST 52 | 985–1098 | teste 993–995, fabricare 1027–1035 (cuplaj, suport, ramă, suporți sticlă, cleme), fereastră 1036–1038 | `rules/st52.json` |
| 11. SST 52 | 1099–1218 | teste 1107–1109, vitraj 1113, fabricare 1145–1153, fereastră 1154–1162 | `rules/sst52.json` |
| 12. Lucernario – Veranda | 1219–1304 | caracteristici 1221–1225, test 1229, vitraje 1233–1237, secțiuni 1241–1268, îmbinare înclinată 1271–1272, ghidaj perete 1275, capac înclinat 1276–1278, fereastră de acoperiș 1279–1298 | `rules/skylight.json` |
| 13. Întreținere | 1305–1316 | – | – |

## Tabele de vitraj extrase automat

| Sistem | Variantă | Pagini |
|---|---|---|
| TP 52 | Standard nivel 1 / nivel 2 / High Insulation / RC3 | 305, 306, 311, 315 |
| SG 52 | Siliconat nivel 1 / nivel 2 | 582–584, 586 |
| SG 52 | Garnitură uscată nivel 1 / nivel 2 | 597–599, 601 |
| TPH 52 | Standard nivel 1 / nivel 2 | 777–779, 783 |
| TPH 52 | Garnitură uscată nivel 1 / nivel 2 | 795–797, 801 |
| TPV 52 | Standard | 785–787 |

**Transcrise manual din desen:**
- SST 52: pag. 1113;
- Lucernar: pag. 1233, 1234, 1235;
- suporții ST: pag. 1029.

**Neprocesate:**
- tabelele TP 52 cu reductor și cele speciale (307–310, 316–321);
- SG 52 monolitic, poziții, poligonal (587–594, 603–607);
- variantele TPH/TPV suplimentare (780–782, 788–818).

## Cum s-a făcut extracția

1. `pdftotext -layout` pe tot PDF-ul (~60 s), apoi parsere pe text: `scripts/extract/profiles.py`, `acc.py`, `glaz.py`, `build_data.py`.
2. Paginile care sunt doar desen (caracteristici, fabricare ST/SST/TPH, lucernar) au fost randate și citite vizual. Valorile au fost transcrise în `data/rules/*.json`, cu pagina.
3. Verificări prin sondaj: rânduri de vitraj comparate cu paginile randate (305, 583, 783, 785), inerții (pag. 35), accesorii (pag. 135).
