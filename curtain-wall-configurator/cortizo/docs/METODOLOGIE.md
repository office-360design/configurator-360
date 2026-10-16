# Metodologia de calcul pe sisteme

Sursa tuturor valorilor: catalogul Cortizo „Sistemas de fachadas y lucernarios”, versiunea 26.04.01 (04/2026), 1316 pagini. Numerele „pag.” sunt paginile din PDF. Unde catalogul nu dă o valoare, am scris explicit **ipoteză** și ce trebuie confirmat.

Configuratorul face o **predimensionare** și o **listă de materiale**. Nu înlocuiește calculul static al proiectantului: catalogul dă capacități de serviciu, fără coeficienți de siguranță (pag. 218, 228, 247).

---

## 1. Ce au toate sistemele în comun

Toate cele șapte sisteme folosesc **aceeași structură portantă**: montanți de 65–250 mm (16 mm pe structură existentă), traverse de 40,5–255,5 mm, aliaj EN AW 6063 T5, lățime vizibilă 52 mm, rost între geamuri 22 mm (pag. 8–11). Diferă doar **cum se prinde sticla** de această structură.

De aceea motorul e împărțit în două:

- o **parte comună** (src/engine.js, src/core/), aceeași pentru toate sistemele;
- o **parte specifică**, definită de tipul de prindere pe fiecare direcție (src/systems/index.js + data/rules/*.json).

### 1.1 Geometria

Intrări: lățimile modulelor (distanța între axele montanților, de la stânga), înălțimile rândurilor (distanța între axele traverselor, de sus în jos) și distanța între ancoraje (deschiderea montantului, de obicei înălțimea de etaj).

Din ele rezultă:
- **axele montanților** j = 0…n, fiecare cu lățimea de influență b = (lățimea din stânga + lățimea din dreapta) / 2; montanții de margine au jumătate de modul;
- **liniile de traverse** k = 0…r, fiecare cu înălțimea de influență h = (rândul de deasupra + rândul de dedesubt) / 2;
- **câmpurile** (rând × coloană), fiecare de tip: geam fix, fereastră proiectantă sau panou opac.

### 1.2 Montantul (statică la vânt)

Montantul e tratat ca grindă simplu rezemată între două ancoraje, cu încărcare uniformă din vânt:

```
Ix,nec = 5 · q · b · L⁴ / (384 · E · f)
```

- q = presiunea caracteristică a vântului [kN/m²] (verificare de serviciu, SLS);
- b = lățimea de influență a axului [mm], L = distanța între ancoraje [mm];
- E = 70.000 N/mm²;
- f = săgeata admisă = min(L/200; 15 mm). **Ipoteză** uzuală EN 13830, de confirmat cu proiectantul.

Se calculează Ix,nec pe fiecare ax, se ia maximul și se alege **un singur tip de montant pentru toată fațada**: cel mai puțin adânc cu Ix ≥ Ix,nec. Dacă utilizatorul permite, se acceptă și un montant mai puțin adânc cu **cămașă de armare**, folosind inerția combinată din tabelele de familie (pag. 27–28, 30). Ix din catalog este inerția pentru încovoierea din vânt (axa puternică).

### 1.3 Traversa

Traversa se ia **de aceeași adâncime ca montantul** (descrierea ei din catalog e „Travesaño para N mm”), ca să rămână la fața interioară a montantului (pag. 8). Se verifică la vânt cu aceeași formulă: deschiderea e lățimea modulului, lățimea de influență e h. Gulerul de îmbinare vine din tabelul de la pag. 186.

Traversele de **nivel 2** se folosesc doar unde un montant se oprește pe o traversă continuă; nu se aplică la ST 52 și SST 52 (pag. 191–193).

### 1.4 Sticla pe fiecare câmp

1. **Dimensiunea sticlei** = axa minus deducerea sistemului (L−22 × H−22 la majoritatea, L−60 × H−60 la SST).
2. **Greutatea** = 2,5 kg/m² pentru fiecare mm de sticlă (fără camere) × suprafață.
3. **Componentele** (garnituri, suporți, cale, izolator RPT, șuruburi, pipete, cleme) se iau din **tabelul de vitraj** al sistemului, după grosimea pachetului de sticlă. La SG/TPH/TPV tabelele sunt separate și după grosimea foii interioare (3+3, 4+4, 5+5, 6+6, 8+8).
4. **Suporții de sticlă**: se încearcă în ordine 2 suporți standard → 4 standard → 2 pentru sarcini mari → 4 pentru sarcini mari → suport în cruce, comparând greutatea cu capacitatea pe traversă (pag. 250–251). Suporții stau la L/10 de capete.

### 1.5 Îmbinarea montant–traversă

După cel mai greu geam (pag. 183–190):

| Îmbinare | Sarcină verticală max. |
|---|---|
| Frontal, șuruburi + opritor anti-rotire 999032 | 225 kg |
| Lateral, opritor COR-9953 | 300 kg |
| Sarcini mari, opritor COR-9910 | 400 kg |

Peste 400 kg nu există soluție standard.

### 1.6 Ancoraje

Pe fiecare montant și fiecare deschidere:
- reacțiunea verticală = jumătate din greutatea geamurilor vecine + traversele + montantul, împărțite la numărul de deschideri;
- reacțiunea orizontală = q · b · L.

Se aleg 1, 2 sau 3 ancore 999183 (250/400/600 kg vertical, 4,5/7/10 kN orizontal, pag. 218). Montanții se înnădesc la ancoraje cu un manșon din cămașa lor, de 400 mm, cu rost de 1 mm/m + 1 mm (pag. 212).

### 1.7 Debitare și listă de materiale

Fiecare profil primește lungimile de tăiere din formulele sistemului. Apoi se face o optimizare First-Fit Decreasing pe bare de 6,5 m (lungime și tăietură configurabile). Rezultă bucăți, metri, bare, pierdere, kg și suprafață de vopsit.

Accesoriile se calculează pe bucată, pe nod sau pe metru liniar. Șuruburile de presor și de cuplaj sunt primul la 30 mm de capăt, apoi la maximum 250 mm (pag. 897–899, 1027).

**Ipoteză:** consumurile de garnituri (perimetrul geamului), numărul de cale și de pipete sunt reguli de lucru, de calibrat pe un proiect real.

### 1.8 Pasul clemelor (sistemele fără presor)

Pentru SG, TPH, TPV, ST și SST, graficul de la pag. 678 (repetat la 891, 1035, 1153) dă **pasul maxim între cleme** în funcție de:
- **sucțiunea de calcul**: vântul nominal × 1,5, conform notei din catalog;
- **suprafața geamului**.

| Zonă din grafic | Pas maxim |
|---|---|
| Sub 1000 Pa sau zonele cele mai mici | 500 mm |
| Benzi intermediare | 400 / 350 / 300 / 250 mm |
| Banda cea mai mare | 200 mm |
| Peste 3000 Pa sau peste 6 m² | nepermis |

Fiecare latură are minimum 2 cleme. Pe orizontală, prima clemă e la 30 mm după suport. Pe verticală, clemele de capăt sunt la 70 mm de axă (pag. 679).

---

## 2. Ce e specific fiecărui sistem

Motorul descrie fiecare sistem prin **tipul de prindere pe fiecare direcție**:

| Sistem | Verticală (montanți) | Orizontală (traverse) | Rost exterior | Sticlă max. | Sticlă = | Apă / vânt (test) |
|---|---|---|---|---|---|---|
| TP 52 | presor + capac | presor + capac | capac | 64 mm | L−22 × H−22 | RE1350 / 2000 Pa |
| SG 52 | cleme + profil U | cleme + profil U | silicon 22 mm sau garnitură uscată | 64 mm | L−22 × H−22 | RE1500 / 2000 Pa |
| TPH 52 | cleme + profil U | presor + capac | silicon pe verticală | 64 mm | L−22 × H−22 | RE1500 / 2000 Pa |
| TPV 52 | presor + capac | cleme + profil U | silicon pe orizontală | 64 mm | L−22 × H−22 | RE1500 / 2000 Pa |
| ST 52 | ramă lipită structural | ramă lipită structural | rost deschis + EPDM | 38 mm | L−22 × H−22 | RE750 / 2000 Pa |
| SST 52 | ramă cu ornament | ramă cu ornament | rost deschis + EPDM | 28 mm | L−60 × H−60 | RE750 / 1200 Pa |
| Lucernar | presor + capac (căpriori) | silicon pe garnitură de fund | silicon pe traverse | 50 mm | L−22 × H−22 | fereastră: 4 / E2100 / C5 |

### 2.1 TP 52 – presor și capac pe toate laturile

**Principiu.** Sticla e strânsă pe toate patru laturile de un presor continuu, înșurubat în canalul montantului și traversei. Presorul e acoperit de un capac. Este referința pentru celelalte sisteme (pag. 9).

**Calcul specific.**
- **Debitări (pag. 379):** traversă L−22, izolator RPT L−22, presor orizontal L−58, capac orizontal L−53, sticlă L−22 × H−22. Presorul și capacul vertical merg pe lungimea deschiderii; **ipoteză:** fără deducere, desenul nu o dă.
- **Componente din tabelul de vitraj** (pag. 305–315), după grosimea pachetului: garnitură montant (1), garnitură traversă (2), reductor de falț (3, doar la sticlă subțire), suport standard / sarcini mari / în cruce (4a/4b/4c), cală (5), izolator RPT (6), șurub presor (7), pipetă (8).
- **Variante:** standard nivel 1 și 2, High Insulation, RC3. La RC3 se cere sticlă P5A de minimum 4+4 pe ambele fețe și plăci de siguranță 999848/49/50.
- **Șuruburi de presor:** primul la 30 mm, apoi la maximum 250 mm.
- **Pipete:** la capetele traverselor, pentru drenajul în cascadă pe 3 niveluri.

**Ce îl deosebește.** E singurul sistem în care **presorul preia sucțiunea vântului pe toate laturile**. De aceea nu are verificare de cleme, iar dimensiunea sticlei e limitată doar de suporți și de îmbinare. Are **fereastră proiectantă** (pag. 393: toc COR-9977, cercevea COR-9975, sticlă L−85 × H−84, max. 80 kg) și **ramă pentru zone oarbe** (pag. 388: COR-9949 H−52, COR-9950 L−22).

### 2.2 SG 52 – structural glazing cu cleme

**Principiu.** La exterior nu se vede aluminiu. În camera geamului termoizolant se lipește din fabrica de sticlă un **profil U (COR-9956)**. Clemele SG, înșurubate în structură, intră în acest profil și țin geamul. Rostul de 22 mm dintre geamuri se umple cu silicon pe o garnitură de fund sau cu o garnitură uscată (pag. 9, 669–682).

**Calcul specific.**
- **Pasul clemelor** din graficul de cleme (secțiunea 1.8).
  - Clemă **dublă** (6a) pe rosturile dintre două geamuri; clemă **simplă** (6b) pe marginea fațadei.
  - Un șurub (7) la fiecare clemă.
  - Mărimea clemei (10 / 16 / 20 mm) urmează grosimea foii interioare: 3+3 și 4+4 → 10 mm, 5+5 și 6+6 → 16 mm, 8+8 → 20 mm.
- **Profilul U** pe fiecare latură a geamului (pag. 669–670).
  - O bucată dacă latura ≤ 1800 mm, altfel două, la 10 mm una de alta.
  - Se fixează cu poziționatoare 999073/74/75 după cameră (16/18/20 mm), la maximum 300 mm și la 30 mm de margine. Poziționatoarele se scot după uscarea siliconului.
  - **Ipoteză:** lungimea bucății = latura − 60 mm.
- **Limitele geamului:**
  - Camera trebuie să fie de 16, 18 sau 20 mm.
  - Sticla are minimum 500 × 300 mm.
  - Varianta siliconată: maximum 4,5 m pe latură și lățime + înălțime ≤ 6,5 m (pag. 671).
  - Varianta cu garnitură uscată: lățimea maximă depinde de grosimea foii exterioare și de siliconul profilului U (pag. 672–674):

    | Foaie exterioară | SG-500 | SG-550 | IG-25 HM Plus |
    |---|---|---|---|
    | 6 mm | 2,8 m | 3,75 m | 1,9 m |
    | 8 mm | 2,4 m | 3,1 m | 1,6 m |
    | 10 mm | 1,9 m | 2,45 m | – |
    | 12 mm | 1,5 m | 2,1 m | – |

  - Toate aceste limite sunt calculate pentru 1500 Pa; peste această valoare Cortizo cere un studiu specific.
- **Lipitura siliconului:** e ≥ 6 mm (8 mm la foaie exterioară de 12 mm) la varianta siliconată; ≥ 10 mm (15 mm) la cea cu garnitură uscată.
- **Etanșare:** silicon DC 791 / 756 SMS sau Sikasil WS-605 S pe garnitura de fund 999012/13 (pag. 682). Motorul socotește doar rosturile dintre geamuri; cele perimetrale țin de detaliile de racord.
- **Montaj:** geamurile se montează de jos în sus (pag. 680).

**Ce îl deosebește.**
- **Producătorul de sticlă intră în lanț:** profilul U și siliconul lui se aplică la fabricarea geamului, deci configuratorul trebuie să-i dea o fișă cu laturile și numărul de poziționatoare.
- **Vântul nu mai e preluat de presor, ci de cleme,** de unde verificarea de cleme și limitele de dimensiune ale geamului.
- **Nu există pipete.**

### 2.3 TPH 52 – presor pe orizontală, cleme pe verticală

**Principiu.** Sistem mixt (pag. 9):
- pe **traverse** e ca TP 52: presor, capac, garnitură de presor;
- pe **montanți** e ca SG 52: cleme, profil U, rost vertical siliconat.

Rezultatul vizual sunt **linii orizontale** pe fațadă.

**Calcul specific.**
- **Componentele vin din două tabele.** Tabelul TPH (pag. 777–801) dă garnitura de montant, izolatorul, clemele 3a/3b, șurubul și garnitura de fund. Suporții, calele, garnitura de traversă și șurubul presorului orizontal se iau din tabelul principal TP 52, pentru că pe orizontală sticla stă pe presor.
- **Debitări orizontale** ca la TP 52: presor L−58, capac L−53.
- **Profilul U** doar pe laturile verticale ale geamului, cu clemele pe montanți.
- **Limitele de dimensiune ale geamului** sunt cele de la SG, fiindcă profilul U e lipit la fel.
- **Fereastra proiectantă** (pag. 904) adaugă profilul U 770287 L−25, cu sticla L−59 × H−84.

**Ce îl deosebește.** Fiind o combinație, configuratorul folosește **două tabele de vitraj** și aplică verificarea de cleme **doar pe o direcție**.

### 2.4 TPV 52 – presor pe verticală, cleme pe orizontală

**Principiu.** Inversul lui TPH (pag. 9). Presorul și capacul sunt pe **montanți**, clemele pe **laturile orizontale**, iar rosturile orizontale se siliconează. Rezultatul vizual sunt **linii verticale**.

**Calcul specific.**
- **Componentele vin din două tabele.** Tabelul TPV (pag. 785–787) dă doar garnitura de montant, izolatorul, șurubul presorului și pipeta. Pentru orizontală (suporți, cale, cleme 6a/6b, șurub, garnitură de fund) se ia tabelul SG 52 cu aceeași foaie interioară, pentru că acolo sticla e prinsă ca la SG.
- **Presorul vertical COR-9914** are o prelucrare proprie (pag. 897).
- **Profilul U** doar pe laturile orizontale.
- **Pipete** la traversa de jos, ca la TP, pentru că drenajul vertical rămâne prin canalul montantului.
- **Fereastra** (pag. 907) adaugă profilul U 770287 H−25, cu sticla L−85 × H−58.

**Ce îl deosebește.** Clemele țin **marginea de jos și de sus** a geamului. De aceea **suportul de sticlă și clemele se află pe aceeași latură**, iar prima clemă se pune la 30 mm după suport.

### 2.5 ST 52 – geam lipit structural pe ramă proprie

**Principiu.** Fiecare geam e **lipit cu silicon structural** (SIKA SG500 sau DC 993) pe o ramă proprie COR-9982, tăiată la 45°. Rama gata lipită se agață pe structură:
- de suporții COR-9942 de pe traverse;
- de clemele 999030, pe trei laturi.

Pe structură se înșurubează un profil de cuplare COR-9971. Rostul rămâne deschis; etanșarea o face o garnitură EPDM perimetrală pe fiecare modul. Fix și ferestre arată identic (pag. 11, 1027–1035).

**Calcul specific.**
- **Ramă:** COR-9982 2 × (L−22) + 2 × (H−22), cu 4 colțuri. Colțurile sunt fie echere de injecție 222085, fie echere de asamblare COR-3160 tăiate la 41,4 mm.
- **Sticlă:** L−22 × H−22.
- **Platbandă pentru siliconul structural:** COR-7298 pe perimetrul ramei, întreruptă 100 mm la fiecare suport. Siliconul trebuie să acopere cel puțin 75 % din grosimea foii exterioare.
- **Suportul de sticlă** se alege **după grosimea totală a geamului**, nu după tabelul de vitraj (pag. 1029):

  | Grosime sticlă | Suport | Rezistență de calcul pe bucată |
  |---|---|---|
  | 6 mm | 999204 | 1750 N |
  | 12 mm | 999201 | 1000 N |
  | 28 mm | 999196 | 575 N |
  | 38 mm | 999191 | 400 N |

  Se pun 2 bucăți la Lv/10, iar capacitatea e 2 × N / g.
- **Suport pe traversă:** COR-9942 de 100 mm, 2 pe geam, la L/10 (pag. 1028).
- **Cuplaj:** COR-9971 pe conturul fiecărui modul, L−28,5. Șuruburile 999107 sunt la 30 mm de capete, apoi la maximum 250 mm, minimum 2 pe tronson (pag. 1027). **Ipoteză:** am luat aceeași deducere pe verticală (H−28,5).
- **Cleme 999030** pe trei laturi (fără cea de jos), cu pasul din graficul de cleme (pag. 1035).
- **Garnituri de ramă** 999172 și 999173, consum 2L+2H. **Ipoteză:** preluat de la fereastra ST (pag. 1038).
- **Garniturile structurii** (999003 / 999000) sunt **ipoteze** preluate de la nota SST (pag. 1113).
- **Grosime maximă 38 mm.**

**Ce îl deosebește.**
- **Structura nu atinge sticla.** Încărcarea trece prin silicon în ramă, apoi prin cleme și suporți în structură.
- **Nu folosește tabele de vitraj.**
- **Lucrul greu se mută în atelier:** lipirea structurală, care cere teste de aderență pe anodizare (pag. 1029).
- **Are cele mai multe kilograme de aluminiu pe metru pătrat,** din cauza ramei și a cuplajului.

### 2.6 SST 52 – geam pe ramă cu ornament, fără silicon structural

**Principiu.** Ca ST 52, dar geamul e ținut **mecanic** de un ornament exterior al ramei COR-9983. Nu e nevoie de silicon structural (pag. 11, 1145–1153).

**Calcul specific.**
- **Ramă:** COR-9983 2 × (L−22) + 2 × (H−22), la 45°. Colțurile au echer 222085 sau COR-3160, plus 960023, 247205 și 2 știfturi 246802.
- **Sticlă:** L−60 × H−60. Geamul intră în falțul ramei, deci e cu 38 mm mai mic decât la ST.
- **Tabelul de vitraj** (pag. 1113) dă garnitura de geam și reductorul după grosime:

  | Grosime | Reductor |
  |---|---|
  | 6–10 mm | COR-9946 |
  | 12–16 mm | COR-9945 |
  | 18–22 mm | COR-9944 |
  | 24–28 mm | – |

  Grosime maximă 28 mm.
- **Cale** 999037 de 3 mm: 2 de sprijin (C1) la L/10, plus cele perimetrale (C2) și de siguranță (C3) (pag. 1147).
- **Garnituri de ramă:** 999172, 999173, 240137 (exterior), consum 2L+2H.
- **Cuplaj, suport pe traversă și cleme:** ca la ST 52.
- **Capacitatea suportului:** catalogul nu dă capacitatea suportului COR-9942 pentru SST. Configuratorul marchează câmpurile cu atenționare până la confirmarea Cortizo.

**Ce îl deosebește.**
- **Nu are silicon structural,** deci nici testele de aderență.
- **Sticla e mai mică** (L−60 în loc de L−22), iar grosimea maximă e cea mai mică (28 mm).
- **Rezistența la vânt testată e mai mică:** 1200 Pa, față de 2000 Pa la celelalte.

### 2.7 Lucernario – Veranda (acoperiș vitrat)

**Principiu.** Aceeași structură montant–traversă, dar înclinată.
- **Căpriorii** (montanții pe pantă) au presor și capac, ca la TP.
- **Pe traversele din acoperiș** rostul se etanșează cu **silicon pe garnitura de fund** (K = 999012/13). Astfel nu există un capac orizontal care să oprească apa, iar apa curge liber spre streașină. Ca alternativă există un set de capac înclinat COR-9935 (pag. 1276–1278).
- **Montanți:** doar de la 130 la 250 mm (COR-9804…9810).
- **Pantă:** între 7° (12 %) și 40° (84 %) (pag. 1271).

**Calcul specific.**
- **Încărcări pe pantă α:**
  - perpendicular pe acoperiș (pentru încovoiere): q⊥ = w + s · cos²α + g · cosα, unde w = vântul, s = zăpada pe proiecția orizontală, g = greutatea sticlei pe m²;
  - în lungul pantei (pentru tăvițele de sprijin M1): q∥ = (g + s · cosα) · sinα.
- **Statica căpriorului și a traversei:** aceeași formulă ca la fațadă, dar cu q⊥ și cu deschiderea măsurată în lungul pantei.
- **Tabelele de vitraj** (pag. 1233–1235) sunt transcrise în data/rules/skylight.json: perete vertical, acoperiș, acoperiș cu fereastră. Grosimile sunt de 26–38 mm.
- **Debitări (pag. 1278):** traversă L−22, izolator L−22 (L−91 când izolația depășește înălțimea sticlei), presor L−87, capac L−86 (cu setul de capac înclinat), sticlă L−22 × H−22.
- **Îmbinarea de la streașină** (căprior pe montant lateral) folosește cămașa COR-9912 (pag. 1271–1272). Cu A din tabel (103–206 mm după montant) și β = 90° − α:

  ```
  L1 = A / cos(β/2)
  L2 = L1 + 200 / tan(90° − β/2)
  ```

- **Fereastra de acoperiș** (pag. 1286): toc COR-9835 (L−25 / H−22), cercevea COR-9825 (L−92,2 / H−89,2), capac exterior COR-9826 (L−38,4 / H−35,4), reductor COR-9945 (L−210 / H−219), sticlă L−192 × H−189.
- **Pipete:** cel puțin una la 8 m sau la 8 traverse (pag. 1223).
- **Ancorajul** nu se face cu ancorele 999183, ci cu ghidaj la perete COR-9830/31/32 și pe montanți laterali (pag. 1275). Configuratorul calculează reacțiunile, dar lasă alegerea proiectantului.

**Ce îl deosebește.**
- **Singurul sistem cu zăpadă** și cu **descompunerea greutății** după pantă.
- **Singurul care schimbă tipul de etanșare pe orizontală** din motive de scurgere a apei.
- **Singurul care are un calcul de îmbinare geometrică** (streașina).
- **Pereții verticali ai verandei** se configurează separat, ca fațadă TP 52 (tabelul de la pag. 1233).

---

## 3. Ce nu face încă motorul (backlog)

1. **Racordurile perimetrale** (pornire, coronament, lateral, trecere de planșeu) nu sunt incluse. Catalogul le dă ca desene (pag. 551–564, 747–756 etc.).
2. **Colțurile și fațadele poligonale** nu sunt tratate. Montanții de colț și poligonali sunt în date (pag. 28), dar nu și logica lor. Pentru SG, traversele poligonale au deduceri proprii (pag. 683).
3. **Ușile** (Millennium Plus și 2000) nu sunt tratate. Trimit la alte cataloage.
4. **Feroneria ferestrelor** nu e completă. Configuratorul pune doar pachetul de bază; cremoanele, închiderile perimetrale și motorizarea au tabele proprii (pag. 405–509).
5. **Prețurile** lipsesc. Catalogul nu are prețuri; trebuie adăugată lista Cortizo (kg profil, vopsire pe dm², accesorii) și prețurile sticlei.
6. **Câteva valori sunt ipoteze de confirmat cu Cortizo:**
   - deducerea verticală a cuplajului COR-9971;
   - capacitatea suportului COR-9942 la SST;
   - consumurile de garnituri;
   - presorul și capacul vertical fără deducere;
   - lungimea profilului U (latura − 60 mm).
