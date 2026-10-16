# CLAUDE.md – Configurator fațade Cortizo

Context pentru Claude Code. Citește întâi acest fișier, apoi `docs/METODOLOGIE.md`.

## Ce este proiectul

Configurator de pereți cortină pentru **Concept Media S.R.L. (360design.ro)**, construit pe catalogul Cortizo **„Sistemas de fachadas y lucernarios”, versiunea 26.04.01 (04/2026)**, 1316 pagini, ~376 MB. Fișierul se numește `Catalog Pereti cortina 2026.pdf` și e în Google Drive-ul lui Alexandru Alexe. PDF-ul nu e în repo.

Proiectul face parte din linia **360Configurator** (configuratoare 3D pentru tâmplărie, pavaje, acoperișuri, garduri). Configuratorul primește o grilă de fațadă și scoate:
- montantul și traversa alese, cu verificarea la vânt;
- componentele de vitraj pe fiecare geam, din tabelele catalogului;
- verificările: suporți de sticlă, îmbinări, cleme, limitele geamului;
- ancorajele;
- lista de debitare pe bare și lista de accesorii.

**Sistemele acoperite** (toate cele din catalog):

| Cod motor | Sistem | Principiu |
|---|---|---|
| TP52 | TP 52 | presor + capac pe toate laturile |
| SG52 | SG 52 | cleme SG + profil U în geam, rost siliconat sau garnitură uscată |
| TPH52 | TPH 52 | presor pe orizontală, cleme pe verticală |
| TPV52 | TPV 52 | presor pe verticală, cleme pe orizontală |
| ST52 | ST 52 | geam lipit structural pe ramă proprie |
| SST52 | SST 52 | geam pe ramă cu ornament, fără silicon structural |
| SKY | Skylight – Veranda | acoperiș vitrat înclinat (căpriori + traverse siliconate) |

## Comenzi

```bash
npm test                    # 12 teste de regresie (node --test), fără dependențe
npm run build               # dist/configurator.html: o singură pagină cu date + motor + UI
npm run example             # rulează motorul pe exemplul fiecărui sistem
node scripts/example.mjs SG52
python3 scripts/make-map.py > web/map.html   # regenerează harta logică (SVG)
```

Node ≥ 20, ES modules, **zero dependențe npm**. Scripturile de extracție din `scripts/extract/` sunt Python 3 și au nevoie de `pdftotext` (poppler) și de PDF-ul catalogului.

## Structura

```
data/
  catalog/            date extrase automat din PDF (nu se editează de mână; se regenerează)
    profiles.json         168 profile: cod, categorie, kg/m, suprafață vopsire, Ix, Iy, pagini
    mullions.json         montanți pe familii + cămașă de armare + inerții combinate (pag. 27–30)
    transoms.json         traverse nivel 1/2, montantul compatibil, guler (pag. 29, 186)
    accessories.json      535 accesorii (pag. 113–136)
    glazing_tables.json   5.285 rânduri de vitraj TP/SG/TPH/TPV (format lung)
    glass_supports.json   capacitatea suporților de sticlă (pag. 250–251)
    ucw.json              Ucw după Ug pe sistem (pag. 12)
  rules/              reguli transcrise din paginile-desen (editabile, fiecare valoare cu pagina ei)
    common.json           statică, vânt ×1,5, îmbinări, ancoraje, înnădire, șuruburi, graficul de cleme, profil U
    tp52.json  sg52.json  tph52.json  tpv52.json  st52.json  sst52.json  skylight.json
  Configurator_pereti_cortina_Cortizo.xlsx   pasul 1: foaia de calcul inițială (aceleași date)
src/
  engine.js           motorul: createEngine(data).compute(project) – funcție pură
  core/               statics, clips, supports, glazing, roles, packing, util
  systems/index.js    definiția celor 7 sisteme: tipul de prindere pe fiecare direcție + de unde vin componentele
  load-node.js        încarcă data/ în Node
web/                  template.html + app.js (UI) + map.html (harta generată)
scripts/              build-web.mjs, example.mjs, make-map.py, extract/*.py
tests/                engine.test.js, examples.js (un proiect-exemplu pe sistem)
docs/                 METODOLOGIE.md, SURSE_CATALOG.md, IPOTEZE.md, ISTORIC_CONVERSATIE.md
dist/configurator.html  build-ul (publicat și ca artifact claude.ai)
```

## Modelul de intrare (project)

```js
{
  system: 'TP52' | 'SG52' | 'TPH52' | 'TPV52' | 'ST52' | 'SST52' | 'SKY',
  grid: { widths: [mm...], heights: [mm..., de sus în jos], anchorSpacing: mm },
  fields: [{ row, col, type: 'glass' | 'window' | 'panel' }],   // opțional; implicit tot e 'glass'
  loads: { windKPa, snowKPa?, slopeDeg? },                      // vânt CARACTERISTIC; zăpadă și pantă doar la SKY
  glass: { variant, innerPane?, totalMm, panesMm, outerPaneMm?, chamberMm?, ug? },
  options: { allowReinforcement, cap, barMm, kerfMm, clipFix, skyTransomJoint, drySilicone }
}
```

Exemple complete în `tests/examples.js`. Ieșirea are forma `{ system, geometry, loads, mullion, transom, axes, lines, fields, checks, cuts, accessories, notes, ucw, totals }`.

## Reguli de lucru pe acest proiect

1. **Fiecare valoare din catalog are pagina ei.** În JSON se pune în `_page`/`page`; în cod, ca comentariu. Fără pagină, valoarea nu intră.
2. **Nu inventa valori.** Ce nu e în catalog se marchează explicit **ipoteză**, cu `_note` în JSON, și se adaugă în `docs/IPOTEZE.md`. Utilizatorul trebuie să le poată confirma cu Cortizo.
3. **`data/catalog/` se regenerează, nu se editează.** Corecturile manuale merg în `data/rules/`.
4. **Motorul rămâne o funcție pură**, fără DOM și fără I/O. UI-ul e în `web/app.js`. Build-ul concatenează modulele (vezi `scripts/build-web.mjs`). Nu folosi nume de funcții duplicate între module, pentru că bundle-ul le pune în același scope.
5. **Limba:** interfața, documentația și mesajele motorului (checks, notes) sunt în **română**; identificatorii din cod sunt în engleză. Denumirile din catalog se afișează **doar în engleză** (`desc_en`); nu se preia niciun text în spaniolă (`desc_es`, `colour_es` rămân doar în date, pentru extracție). Numele sistemului de acoperiș e „Skylight – Veranda”; „Lucernario – Veranda” e doar cheia din tabelele extrase (`tableName`).
6. **Orice schimbare de calcul primește un test** în `tests/engine.test.js`, cu valoarea așteptată și pagina sursă.
7. **Rezultatul e predimensionare.** Mesajele nu trebuie să sugereze că înlocuiesc calculul static al proiectantului.

## Cum adaugi sau modifici un sistem

- **Diferențele dintre sisteme stau în două locuri:**
  - `src/systems/index.js`: `edges` (`pressure` / `clip` / `frame` / `silicone` pe `v` și `h`) și `roles()`, adică de unde vin componentele (tabelul de vitraj, combinații de tabele sau reguli);
  - `data/rules/<sistem>.json`: deduceri, limite, fereastră, ramă, cuplaj.
- **Partea comună** (statică, suporți, îmbinări, ancoraje, debitare, cleme) e în `src/engine.js` și `src/core/`.
- **Rolurile componentelor** (`mullionGasket`, `supportStd`, `clipDouble` …) sunt mapate din numele componentelor în `src/core/roles.js`.

## Integrarea în 360Configurator (făcută)

Proiectul stă în repo-ul `configurator-360`, în `curtain-wall-configurator/cortizo/`, și e motorul configuratorului 3D de pereți cortină (singurul producător din configurator):
- **`../js/cortizo.js`** e adaptorul. Încarcă datele, face proiectul din grila configuratorului (rândurile sunt de jos în sus acolo și de sus în jos aici) și produce modelul pentru 3D și desene.
- **`../js/cortizoUi.js`** face interfața:
  - controalele;
  - elevația cu stările;
  - verificările;
  - debitarea și accesoriile;
  - comparația sistemelor;
  - harta logică.
- **Testele adaptorului** sunt în `../tests/cortizo.test.mjs`. `npm run check:curtain-wall` din rădăcina repo-ului rulează și testele de aici.
- **Motorul, datele și regulile** rămân aici, nemodificate. Orice schimbare de calcul se face tot aici, cu regulile de mai sus.

## Unde am rămas (backlog, în ordinea propusă)

1. **Calibrarea consumurilor** (garnituri, cale, pipete, profil U) pe o fațadă ofertată real. Sunt reguli de lucru, marcate în `docs/IPOTEZE.md`.
2. **Prețuri:** de adăugat `data/prices.json`, cu preț pe kg profil, vopsire pe m², accesorii și sticlă pe m². Catalogul nu are prețuri.
3. **Confirmări de la Cortizo:**
   - capacitatea suportului COR-9942 la SST;
   - deducerea verticală a cuplajului COR-9971;
   - deducerea presorului și a capacului vertical;
   - lungimea profilului U.
4. **Racorduri perimetrale** (pornire, coronament, lateral, trecere de planșeu), colțuri și fațade poligonale, uși.
5. **Integrarea în 360Configurator:** vizualizarea 3D e făcută (vezi mai sus); rămân exportul PDF de ofertă și prețurile. Pentru integrarea cu Odoo: produse după cod Cortizo, BOM, ofertă.
6. **Clientul vizat:** de stabilit dacă configuratorul e pentru un producător (ex. QFort, Craiova) sau pentru clientul final. De asta depinde cât de tehnice rămân verificările în interfață.

Istoricul deciziilor din conversația în care s-a construit proiectul e în `docs/ISTORIC_CONVERSATIE.md`.
