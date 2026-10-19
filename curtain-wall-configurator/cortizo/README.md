# Configurator fațade Cortizo

Configurator de pereți cortină pentru cele 7 sisteme Cortizo din catalogul 2026: TP 52, SG 52, TPH 52, TPV 52, ST 52, SST 52 și Lucernario – Veranda. Datele sunt extrase din catalog, motorul de calcul e scris în JavaScript fără dependențe, iar interfața web e o singură pagină.

```bash
npm test        # teste
npm run build   # → dist/configurator.html (se deschide direct în browser)
npm run example # rezultatul pe exemplul fiecărui sistem
```

Pentru context complet (și pentru Claude Code), vezi:
- [CLAUDE.md](CLAUDE.md): structura proiectului, regulile de lucru, backlogul;
- [docs/METODOLOGIE.md](docs/METODOLOGIE.md): calculul pe fiecare sistem și ce îl deosebește;
- [docs/SURSE_CATALOG.md](docs/SURSE_CATALOG.md): unde e fiecare informație în catalog;
- [docs/IPOTEZE.md](docs/IPOTEZE.md): ce trebuie confirmat.

Rezultatele sunt o predimensionare și o listă de materiale. Nu înlocuiesc calculul static al proiectantului.
