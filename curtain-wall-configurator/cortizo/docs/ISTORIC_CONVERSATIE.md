# Istoricul conversației (claude.ai, 15–16 octombrie 2026)

Proiectul a fost construit într-o singură conversație cu Claude, în proiectul QFort din claude.ai.

## 1. Pornirea
- **Cererea:** Alexandru avea catalogul Cortizo de 376 MB și voia să construiască un configurator de pereți cortină.
- **Accesul la fișier:** catalogul era în Google Drive, dar conectorul nu putea citi un PDF atât de mare. L-a încărcat direct în conversație.
- **Ce s-a construit întâi:** o explicație generală despre cum se construiește un configurator. Ea a dat cele trei straturi (datele din catalog, regulile de verificare, ieșirile) și formula de verificare a montantului.

## 2. Pasul 1 – structurarea datelor
- **Catalogul:** 1316 pagini, text extractibil în majoritate.
- **Ce s-a extras:** 168 de profile, 535 de accesorii, montanți cu cămăși și inerții combinate, traverse, 5.285 de rânduri din tabelele de vitraj, capacitățile suporților de sticlă, îmbinări, ancoraje, debitări TP 52, tabelul Ucw și testele pe sistem.
- **Rezultat:** fișierul `data/Configurator_pereti_cortina_Cortizo.xlsx`, cu 14 foi și un exemplu de calcul cu formule.
- **Verificare:** exemplul (q 1 kN/m², modul 1,5 m, L 3,5 m) dă Ix,nec = 279,1 cm⁴ → COR-9804. O sticlă de 32 mm cu 154 kg cere 4 suporți standard 999041.

## 3. Pasul 2 – motorul pe grilă (TP 52) și harta logică
- **Ce s-a construit:** un prototip web cu harta logică și calculul pe grilă pentru TP 52.
- **Ce acoperă:** Ix pe fiecare ax, traversa, suporții, îmbinarea, ancorele, debitarea pe bare cu First-Fit și accesoriile.
- **Ce a rămas neclar:** consumurile de accesorii au fost marcate ca estimări.

## 4. Pasul 3 – toate sistemele (această versiune)
- **Ce s-a cerut:** toate sistemele, câte un configurator pentru fiecare, metodologia pe sistem și ce le deosebește, totul utilizabil din Claude Code în VS Code.
- **Ce s-a citit în plus din catalog:**
  - SG: profilul U, poziționatoarele, limitele geamului, graficul de cleme, etanșarea;
  - TPH/TPV: combinarea tabelelor și ferestrele;
  - ST: rama, siliconul structural, suporții după grosime, cuplajul;
  - SST: rama, tabelul de vitraj de la pag. 1113, calele;
  - Lucernar: tabelele de vitraj 1233–1235, panta 7°–40°, îmbinarea de la streașină COR-9912, debitările de la pag. 1278, fereastra de acoperiș.
- **Decizia de arhitectură:** un singur motor comun, iar sistemele diferă doar prin **tipul de prindere pe fiecare direcție** (presor / cleme / ramă / silicon) și prin sursa componentelor.
- **Ce s-a livrat:**
  - acest proiect;
  - pagina web publicată, care conține configuratorul, metodologia și harta logică;
  - 12 teste.

## Întrebări rămase deschise
- **Cui e destinat configuratorul:** producătorului (QFort) sau clientului final?
- **Prețurile:** lista de prețuri Cortizo și prețurile sticlei.
- **Confirmările de la Cortizo:** vezi `IPOTEZE.md`.
