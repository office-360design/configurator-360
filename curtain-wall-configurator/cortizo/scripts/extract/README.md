# Extracția datelor din catalog

Scripturile au fost rulate o singură dată pe catalogul v26.04.01. Ele rămân aici pentru o versiune nouă a catalogului.

Cerințe: Python 3, `pdftotext` (poppler-utils), `pdfplumber` (opțional).

```bash
W=work; mkdir -p $W/txt $W/out
pdftotext -layout "Catalog Pereti cortina 2026.pdf" $W/txt/all.txt   # ~60 s
python3 profiles.py $W      # → out/profiles_raw.json (pag. 13–26 lista, 33–112 Ix/Iy)
python3 acc.py $W           # → out/acc_raw.json (pag. 114–136)
python3 build_data.py $W    # → out/data.json (profile, montanți, traverse, vitraje, suporți, Ucw)
python3 heads.py $W 600 700 # util: listează titlurile și formulele de debitare de pe un interval de pagini
```

Apoi `data/catalog/*.json` se generează din `out/data.json`; transformarea e în istoricul proiectului. **Atenție:** paginile `PAGES` din `build_data.py` (tabelele de vitraj) și legendele lor (`LEG`) sunt specifice versiunii 26.04.01.
