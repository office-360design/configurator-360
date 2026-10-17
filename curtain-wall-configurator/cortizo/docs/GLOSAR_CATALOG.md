# Glosar ES / EN din catalogul Cortizo

Termenii spaniol–englez folosiți de catalogul **„Sistemas de fachadas y lucernarios / Façades & Skylight systems” v26.04.01** (04/2026), cu pagina din PDF unde apar. Pe el se sprijină textele motorului (`src/messages.js`), etichetele configuratorului și harta logică (`scripts/map_text.py`): engleza și spaniola iau termenii de aici, iar româna, germana, franceza și italiana sunt traduse din engleză.

„NOT IN CATALOGUE” înseamnă că termenul nu apare în text; atunci s-a ales o formulare neutră, în stilul catalogului.

## Alegeri făcute în configurator

- „Pressure plate” nu apare corect scris în catalog; se folosește **pressure section / presor** (cel mai frecvent).
- Garniturile din tabelele de vitraj sunt **rubber / goma** (Mullion rubber, Transom rubber, Pressure rubber, Bottom sealing rubber); garnitura uscată rămâne **SG dry gasket / junta seca SG**, ca în catalog.
- Lucernarul nu are „rafter”: elementele înclinate sunt **inclined mullion / montante inclinado**.
- „Nivel” din variantele de vitraj este **nivelul de drenaj al traversei** (first / second level), nu o clasă a vitrajului.
- Camisa apare și ca „Reinforcement profile”, și ca „Cover”; configuratorul folosește **reinforcement profile**, ca „cover” să rămână doar pentru tapeta.
- Rolul de fereastră notat în reguli „ramă exterioară” (COR-9968) este în catalog *Thermal break for SG-52 projecting window opening / Rotura marco*; se afișează **frame thermal break / rotura marco**.

## Erori de tipar observate în catalog

- Pag. 778 (tabelul TPH 52): referința clemei simple apare ca **9990025** (probabil 999025, „SG 10 mm single clip”). Datele extrase păstrează valoarea din catalog, deci piesa nu are descriere în lista de accesorii. De confirmat cu Cortizo.
- Pag. 1030: suportul e tipărit „Cor-9994” în loc de COR-9942.
- Alte greșeli de tipar (de ex. „Rebat profile reducer”, „MAXIMUN CAPACITIES”, „EMSAMBLAJE”) sunt marcate [sic] mai jos.

---


## General finding: "goma"/"rubber" vs "junta"/"gasket"

- **Glazing tables** (TP 305-321, SG 581-603, TPH/TPV 777-812, SST 1113) use **"Goma de montante / Mullion rubber"**, **"Goma de travesaño / Transom rubber"**, **"Goma de presor / Pressure rubber"**, **"Goma de fondo de sellado / Bottom sealing rubber"**, and "Goma hoja / Sash rubber" (1113).
- **The accessory list** (112-135) describes the same parts as *gaskets*: 999000 "Goma de 3 mm / 3 mm gasket", 999012 "Goma fondo de sellado / Bottom sealing gasket". Its type column reads "Juntas / Gaskets".
- Other places use "Junta" / "gasket": "Junta montante / Mullion gasket" (312-313), "Junta poligonal / Polygonal gasket" (312), "JUNTAS/GASKETS" (316-320), "Juntas en montante y travesaño / Mullion and Transom gaskets" (1287).
- Overall counts (ES+EN lines): "gasket" 247, "rubber" 148; "junta" 244 (many of them in the repeated legal disclaimer), "goma" 175. In the glazing tables "rubber" wins. Everywhere else "gasket" wins.

## 1. Main framing members

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| mullion [montant] | Montante | Mullion | 17-19 (COR-98xx "Montante de 150 mm / 150 mm mullion"), everywhere | Used about 370-400 times; this is the only term. |
| transom [traversă] | Travesaño | Transom | 20-21 ("Travesaño para 105 mm / Transom for 105 mm mullion"), everywhere | The only term. "Travesaño 2º nivel / 2º level transom" (21); "travesaño de segundo nivel / second level transom" (191-194). |
| rafter on skylight [căprior] | Montante inclinado | Inclined mullion | 1271-1274 ("UNIÓN MONTANTE INCLINADO / INCLINED MULLION JOINT PROFILE") | No "rafter"/"cabio" anywhere. The skylight calls its sloped members "montante". Page 1274 heading: "Ángulo de corte en el montante inclinado / Lateral mullion cutting angle" [sic, the EN is wrong]. |
| lateral (side) mullion of skylight | Montante lateral | Lateral mullion | 1271, 1273 ("Ángulo de corte en el montante lateral / Lateral mullion cutting angle") | |

## 2. Reinforcement sleeve and splice

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| reinforcement sleeve inside mullion [cămașă de armare] | Camisa (e.g. "Camisa para 150 mm") | Reinforcement profile ("Reinforcement profile for 150 mm") | 22-23, 27-28, 63-70 | Most frequent EN. Family heading: "MONTANTES Y CAMISAS / MULLION AND REINFORCEMENT PROFILE" (27-28). |
| same, other EN renderings | Camisa / camisa de refuerzo / camisas de refuerzo interior | Cover (212, 214-220, 1272); insert profile (247); interior reinforcement covers (567); reinforcement profile (216 note) | 212, 214-220, 247, 567, 1272 | In fabrication drawings "CAMISA/COVER" is usual. Watch out: "cover" is also the EN word for "tapeta". Ex. 247: "camisa de refuerzo (L=1000 mm) en la cámara interior del montante / insert profile (L=1000 mm) in the inside chamber of the mullions". |
| mullion splice sleeve 400 mm [manșon de înnădire] | Camisa (400 mm piece) | Cover | 212 | The catalogue has no separate "manguito/sleeve" term. The 400 mm piece on 212 is labelled "CAMISA/COVER", with 999031, 999087 and "Silicona/Silicone". |
| splice/insert piece in anchoring context | mecha ("la longitud de la mecha") | bit ("the length of the bit"); drill ("Unión con mecha Cor-9912 / Joint profile with drill") | 216-218, 1275 | Literal mistranslations. Ex. 216: "* Para alturas inferiores a 3 m la longitud de la mecha se puede reducir hasta 250 mm. / * For heights under 3 m the length of the bit can be shortened to 250 mm". |
| mullion continuation piece | Pieza de continuidad de montantes | Mullion continuation piece | 127 (999031) | Also "piezas de continuidad / continuity pieces" (567, 1223). |

## 3. Mullion splice / expansion gap

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| mullion splice [înnădire montant] | Unión y enmechado de montantes | Mullions union | 212 | Page heading. |
| expansion gap | Junta dilatación | Expansion gasket | 214, 215 | Labelled "JUNTA DILATACIÓN/ EXPANSION GASKET". The gap rule is given as "(1 mm / 1 m perfil/profile) + 1 mm" (212, 214, 215). |

## 4. Pressure plate and covers

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| pressure plate [presor] | Presor | Pressure section (most frequent, about 31 times, in profile lists: COR-9914 "Presor / Pressure section"); also "pressure" ("L presor/pressure", 379-386), "pressure device" (381, 384-385, 1223), "pressure piece" (312-313), "presure plates" [sic] (387), "pressure profile" (2 times) | 23, 31, 71-74, 379-387, 897 | "Pressure plate" is never spelled correctly; the only occurrence is the typo "presure plates" on 387. |
| machined pressure section | Presor mecanizado | Pressure section machined | 23 (COR-9913) | 380: "COR-9913 (Perfil mecanizado)". |
| cover cap [capac] | Tapeta | Cover (profile list: "Tapeta de 14 mm / 14 mm cover"); End plate (fabrication: "L tapeta/end plate", 379, 381-382, 891-892) | 16-17, 24, 76-82, 379-382 | "Cover" is most frequent overall (but it also translates "camisa"). "End plate" is the norm in fabrication/cutting drawings. |
| 14 mm cover | Tapeta de 14 mm | 14 mm cover | 16 (COR-9142), 76 | |
| 19 mm cover | Tapeta de 19 mm | 19 mm cover | 17 (COR-9143), 76 | |
| H cover | Tapeta en H | H shaped cover | 16 (COR-9133), 76 | Its pressure section: "Presor tapeta en H / H cover pressure" (19, COR-9827). |
| 100 mm vertical cover | Tapeta vertical de 100 mm | 100 mm vertical cover | 17 (COR-9183), 77 | |
| "aircraft wing" cover (TPH) | Tapeta de ala de avión | Fin cover | 17 (COR-9198), 78 | Pressure section: "Presor para ala de avión / Pressure section for fin" (23, COR-9920). |
| flat pressure-cover | Presor-tapeta plana | Flat pressure-cover | 23 (COR-9923) | |
| RC3 pressure section | Presor RC3 | Pressure section RC3 | 20 (COR-9848), 386-387 | |
| inclined cover / its pressure | Tapeta para presor inclinado; Presor para tapeta inclinada | Cover for inclined pressure section; Pressure section for inclined cover | 24 (COR-9935), 23 (COR-9919) | Also "Tapeta inclinada / Inclined cover" (31). |

## 5. Pressure plate screws and pitch

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| pressure plate screw [șurub presor] | Tornillo fijación de presor | Pressure section fixing screws | 321 ("Tornillo fijación de presor/ Pressure section fixing screws: 999089") | In the glazing tables the column is simply "Tornillo / Screw" (7). Drawings 384-385 show "Ø5.5 DIN 7981*" and "Ø5.5 → Tq=5N·m". |
| pitch "first at 30 mm, then max 250 mm" | (no sentence; dimensions only) | (no sentence; dimensions only) | 380, 897 ("MECANIZADO PRESOR VERTICAL / VERTICAL PRESSURE MACHINING"); 381-382 | Shown only as drawing dimensions "30.0 … ≤ 250 … ≤ 250 … 30.0". There is NO written rule. Related heading: "MECANIZADO PRESORES / PRESSURE DEVICE MACHINING" (384-385). |
| machined profile every 250 mm | Perfil mecanizado cada 250 mm | Machined profile every 250 mm | 75 (COR-9924) | Observations line of the flat pressure-cover. |

## 6. Glazing-table components

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| mullion gasket | Goma de montante | Mullion rubber | 305-315, 581, 596, 777, 1113 | Also "Junta montante / Mullion gasket" (312-313). |
| transom gasket | Goma de travesaño | Transom rubber | 305-315, 581, 596, 777 | |
| pressure gasket | Goma de presor | Pressure rubber | 305-315, 780, 798 | Ref 999000, which the accessory list calls "Goma de 3 mm / 3 mm gasket". |
| recessed reducer | Reductor de galce | Recessed reducer (tables 305-308); glazing space reducer (profile list COR-9944…9948, 24-25); Rebat profile reducer [sic] (SST 1113); Opening glazing space reducer (606) | 24-25, 305-310, 390, 606, 1113 | "Recessed reducer" appears once as a phrase in the tables. "Glazing space reducer" is most frequent (11 times). Section heading 390: "REDUCTORES DE GALCE / RECESSED REDUCER". |
| glass support (generic) | Apoyavidrios | Glass support (tables); glazing support (accessory list, "18 mm glazing support") | 127-134, 250-251, 305 ff. | "glazing support" 148 times (mostly lists); "glass support" 84 times (tables/text). Accessory type column: "Asiento vidrio / Glazing wedge". |
| glass support standard / heavy / cross | 4a (normal), 4b (grandes cargas), 4c (en cruz) | 4a (normal), 4b (heavy loads), 4c (cross) | 305, 308, 315 (SG: 3a/3b/3c, 581, 596) | Quote: "(*) Seleccionar el apoyavidrios adecuado entre 4a (normal), 4b (grandes cargas) ó 4c (en cruz) / Choose the adequate glass support between 4a (normal), 4b (heavy loads) or 4c (cross)". |
| heavy-loads glass support | Apoyavidrios grandes cargas de 32 mm | 32 mm heavy loading glazing support | 127 (999047) | |
| cross glass support centre / left / right | Apoyavidrios en cruz central / izquierdo / derecho | central cross glazing support / left cross glazing support / right cross glazing support | 131, 134 (999154…, 999354…, 999454…) | The table sub-columns are ES-only: "Central / Izquierda / Derecha" (582, 597). Page 251 has "Central/Central, Izquierdo/Left, Derecho/Right". |
| wedge / setting block | Calzo | Wedge | 305, 581 ("Calzo (4) / Wedge"), 1147 | "wedge" 233 times. The same refs (999062…) are "Calzo para apoyavidrios de 26 mm / 26 mm glazing support packer" in the accessory list. "setting block" is NOT IN CATALOGUE. |
| thermal break insulator RPT | R.P.T. | Thermal bridge break (TP tables 305-315); Thermal bridge (SG/TPH tables 581, 777) | 305-315, 581, 596, 777 | The parts are "Aislante base de 12 mm / 12 mm base insulation", "Aislante apilable de 6 mm / 6 mm stackable insulation" (19-20). Also "L perfil RPT/Thermal bridge profile" (379, 1278), "Rotura marco / Frame thermal break" (606), "Perfiles de rotura de puente térmico (R.P.T.) / Thermal bridge break profiles" (567). |
| drainage pipette | Pipeta | Pipette | 305, 213, 380 | 213 heading: "INSTALACIÓN DE PIPETA DE DRENAJE / DRAINAGE PIPETTE INSTALLATION". Parts: "Pipeta de 20-34 mm / 20-34 mm pipette" (127). |
| clip SG (a)/(b) | Grapa SG (6) with sub-columns (6a), (6b) | SG clip | 581-582, 596-597 | In table 582, 6a = 999021 "Grapa doble SG 10 mm / SG 10 mm double clip" and 6b = 999025 "Grapa sencilla SG 10 mm / SG 10 mm single clip". The table never says in words what a/b mean. TPH/TPV tables just say "Grapa / Clip". |
| screw | Tornillo | Screw | 305 ("Tornillo/Screw (7)"), 581 | |
| sealing back gasket (goma de fondo) | Goma de fondo de sellado | Bottom sealing rubber (tables 581, 777); Bottom sealing gasket (list 999012); Lower sealing gasket (606); sealing rubber (682) | 126, 581, 606, 682, 777 | |
| dry gasket SG | Junta seca SG | SG Dry gasket | 596, 795, 811 | Parts: 999119 "Junta exterior seca SG-52 / SG-52 dry external gasket"; 999219 "Junta exterior seca 9,5 mm SG-52". |
| RC3 pressure screw | Tornillo (7) (999851); Tornillo Pletina (810610) | Screw (7); Sheet screw | 315, 386-387 | NOT IN CATALOGUE as an "RC3 pressure screw" term. 999851 is listed as "DIN 7982 ∅5,5x70 screw" (135). 387: "Posicionar los presores COR-9848 y taladrar montante y travesaño con broca Ø4.5 mm antes de atornillar / Position the presure plates COR-9848 and drill…". RC3 plates: "Pletina de seguridad en L derecha RC3 / RC3 right L safety plate", "…en T RC3 / RC3 T safety plate" (315). |
| total cleat (gasket corner) | Escuadra total | Total cleat | 305, 581, 777 | Accessory list: "Escuadra de encuentro 9.5 - 3 mm / Meeting cleat 9.50 - 3 mm" (999015). |

## 7. Glazing-variant headings (exact)

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| "Standard – level 1" | (no heading) | (no heading) | 305 (TP), 581 (SG), 777/785 (TPH/TPV) | NOT IN CATALOGUE. The first table of each system has no title (TP 305, SG 581) or only "Acristalamiento TPH 52 / Glazing TPH 52" (777) and "Acristalamiento TPV 52 Glazing TPV 52" (785). "Standard" appears only as "APOYAVIDRIOS ESTÁNDAR / STANDARD GLASS SUPPORT" (250) and "Solución estándar / Standard solution" (568). |
| "level 2" | Tabla de acristalamiento TP 52 (2º nivel); Acristalamiento SG 52 (2º nivel); Acristalamiento TPH 52 (2º nivel) | Glazing table TP 52 (2nd level); SG 52 GLAZING (2nd level); Glazing TPH 52 (2nd level) | 306, 585-586, 783-784, 791-792 | "Nivel" means the drainage level of the transom (first/second/third level transom, 568, 1222: "Primer nivel / First level", "Segundo nivel / Second level", "Tercer nivel / Third level"). It is not a glazing grade. "1º nivel / level 1" as a table title does not exist. |
| High Insulation | Tabla de acristalamiento TP 52 Gran Aislamiento | Glazing table TP 52 High Insulation | 311 | |
| RC3 | ACRISTALAMIENTO TP52 (RC3) | TP52 GLAZING (RC3) | 315 | 386: "MECANIZADO PRESOR VERTICAL TP52 (RC3) / TP52 (RC3) VERTICAL PRESSURE MACHINING". |
| with reducer | Tabla de acristalamiento TP 52 con reductor | Glazing table TP 52 with reducer | 307 | |
| polygonal / monolithic | Tabla de acristalamiento TP 52 (poligonal); Acristalamiento SG 52 (monolítico) | Glazing table TP 52 (polygonal); SG 52 GLAZING (monolithic) | 309-310, 587-589, 593-594 | |
| "SG siliconed" | (no heading; table 581 is untitled) | (none) | 581 | NOT IN CATALOGUE as a heading. The solution is named "SOLUCIÓN SELLADO EXTERIOR / OUTSIDE SEALING SOLUTION" (671) and "vidrios sellados exteriormente / glasses with outside sealing" (669). |
| "without silicone (dry gasket)" | Acristalamiento SG-52 Sin Sellado - Opción de Junta Seca | SG-52 Glazing Without Sealing - Dry Gasket Option | 596 | Same pattern on 600-601 "… - (2º nivel) / … - (2nd level)", 602-603 "(Monolítico) / (Monolithic)", 795/798 TPH-52, 803/806 TPV-52, 801-802/809-810 "(2º nivel)", 811 "(monolítico)" (the EN also says "monolítico" [sic]). 812: "Acristalamiento TPH 52 / TPV 52 sin sellado - junta seca (monolítico) / Glazing TPH 52/TPV 52 - Dry Gasket- (monolithic)". Fabrication: "SOLUCIÓN JUNTA SECA / DRY GASKET SOLUTION" (672-674). |

## 8. Mullion–transom joints

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| front assembly with screws + anti-rotation stop | Método de montaje frontal: Tornillos y tope antigiro | Front assembly method: Screws and anti-rotation cap | 183 | Max load "CARGA VERTICAL MÁXIMA / MAXIMUM VERTICAL LOAD = 225 kg". Joint heading 186: "UNIÓN DE TRAVESAÑO CON TORNILLOS Y TOPE ANTIGIRO / TRANSOM WITH SCREWS AND ANTI-ROTATION CAP JOINT PROFILE". |
| anti-rotation stop part (999032) | Antivuelco automático | Automatic anti-roll | 127, 174 | "Tope antigiro" is used only in headings; the part itself is "antivuelco". 567: "antivuelco automático / automatic rollover". 272: "TOPE ANTIGIRO FIJACIÓN TRAVESAÑO / TRANSOM FIXATION ANTI-ROTATION CAP". |
| side assembly with stop COR-9953 | Método de montaje lateral: Tornillos y tope Cor-9953 | Lateral assembly method: Screws and cap Cor-9953 | 184, 187-188 | 300 kg. 187: "UNIÓN DE TRAVESAÑO CON TORNILLOS Y TOPE COR-9953 / TRANSOM WITH SCREWS AND COR-9953 CAP JOINT PROFILE". The profile list calls COR-9953 "Antivuelco de grandes cargas / Heavy load anti-roll" (25). |
| heavy loads stop COR-9910 | Método de montaje lateral: Tornillos y tope grandes cargas; TOPE GRANDES CARGAS | Lateral assembly method: Screws and heavy loads cap; HEAVY LOADS CAP | 185, 189-190 | 400 kg. Profile list: "Tope grandes cargas / Heavy load block" (23). 189: "UNIÓN DE TRAVESAÑO CON TORNILLOS Y TOPE PARA GRANDES CARGAS / TRANSOM WITH SCREWS AND HEAVY LOADS CAP JOINT PROFILE". |
| collar COR-9853 (transom expansion collar) | Collarín dilatación travesaño COR-9853 (ref 999147); "COLLARÍN" in drawings | Transom expansion collar COR-9853; "COLLAR" in drawings | 131, 157, 186-187 | COR-9853 is the transom ("Travesaño para 105 mm / Transom for 105 mm mullion", 20). Its collar is 999147. Table on 186: "Ref. Travesaño / Transom ref." with "Ref. Collarín / Collar ref.". |
| transom screw | Tornillo especial fijación travesaño | Special screw for transom fixing | 129 (999086) | |
| after cross-cutting | Después de realizar el retestado | After cut-crossing | 186-187 | "retestado" = "cut-crossing" / "cross-cutting" / "cross-cut". |

## 9. Anchors

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| floor–ceiling anchor (999183) | Anclaje suelo - techo | Floor-ceiling anchor | 132, 174 | Section headings use "ANCLAJE SUELO - TECHO / FLOOR - ROOF ANCHORING" (216, 218-219). "techo" is translated as both "ceiling" and "roof". 216: "Sólo en el caso de anclaje suelo - techo fijo / Only in case of fixed floor - ceiling anchoring". |
| anchoring plate 999183 | Placa de anclaje | Anchoring plate | 216 | "FIJACIÓN DE LA PLACA DE ANCLAJE / FIXATION OF ANCHORING PLATE (999183)". "Cada una de las placas de anclaje se fijará a la camisa mediante 2 tornillos 810835 / Each of the anchoring plates will be fastened with 2 screws 810835." |
| number of anchors per mullion | Uds./Units (999183) per Montante/Camisa | Uds./Units | 216 ("TABLA DE ACCESORIOS / ACCESSORIES TABLE"), 218 | Given only as a table: 1, 2 or 3 per mullion by depth. 218: "CAPACIDADES MÁXIMAS / MAXIMUN [sic] CAPACITIES", "Reacción vertical (por peso) / Vertical reaction (weight)", "Reacción horizontal (por viento) / Horizontal reaction (wind)". |
| anchor variants | Anclaje suelo - techo fijo / deslizante; Anclaje frente forjado fijo / deslizante; Anclaje sobre forjado fijo / deslizante | Floor - roof anchoring / Floor - sliding roof anchoring; Fixed / Sliding slab front anchoring; Fixed / Sliding slab anchoring | 219-235 | Also "ANCLAJE FIJO / FIXED POINT", "ANCLAJE DESLIZANTE / ROLLER POINT" (247). |
| span between anchors | — | — | — | NOT IN CATALOGUE. |

## 10. Glass supports: capacity and setting blocks

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| capacity table heading | APOYAVIDRIOS ESTÁNDAR; APOYAVIDRIOS PARA GRANDES CARGAS; APOYAVIDRIOS EN CRUZ PARA GRANDES CARGAS; APOYAVIDRIOS PARA ST-52 | STANDARD GLASS SUPPORT; GLASS SUPPORT FOR HEAVY LOADS; GLASS SUPPORT IN THE FORM OF A CROSS FOR HEAVY LOADS; GLASS SUPPORT FOR ST-52 | 250-251 | Under the heading "ACRISTALAMIENTOS EN SISTEMAS DE FACHADA / FACADE SYSTEMS GLAZING". |
| weight on supports | Peso max. sobre travesaño (kg); Con 2 apoyos de vidrio / Con 4 apoyos de vidrio | Max. weight on transom (kg); With 2 glass supports / With 4 glass supports | 250-251 | |
| ST 52 support resistance | VALORES RESISTENCIA APOYAVIDRIOS; Resistencia máx. de diseño (*) [N]; * Valores por pieza | GLASS SUPPORT RESISTANCE VALUES; Design max. resistance (*); * Values per piece | 1029 (image) | |
| supports at L/10 | Se colocan 1 ó 2 apoyos de vidrio en cada extremo a L/10. | 1 or 2 glass supports must be placed on each edge at L/10. | 250-251 | |
| setting block at L/10 | La distancia entre el eje de los calzos y el borde del vidrio, será aprox. L/10 (L = longitud de vidrio.) | The distance between the axis of the wedges and the edge of the glass, will be approx. L/10 (L = glass length) | 518, 1147 | 1147: "NOMENCLATURA DE LOS CALZOS / NAME OF THE WEDGES: C1 = CALZO DE APOYO / SUPPORT WEDGE; C2 = CALZO PERIMETRAL / PERIMETER WEDGE; C3 = CALZO DE SEGURIDAD / SECURITY WEDGE". |

## 11. SG clips and the U profile

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| clip | Grapa | Clip | 610 ff. | Clip types (610): "Grapa doble / Double clip", "Grapa sencilla / Simple clip" (the list says "single clip"), "Grapa poligonal v.1 / Polygonal clip v.1", "v.2". |
| clip pitch chart vs suction and glass area | SEPARACIÓN MÁXIMA ENTRE LAS GRAPAS; Succión del viento [Pa]; Superficie del vidrio [m²]; Paso … mm | MAXIMUM ALLOWANCE BETWEEN CLIPS (610) / MAXIMUM SEPARATION BETWEEN CLIPS (678, 891, 1035); Wind suction [Pa]; Glass surface [m²]; Passage … mm | 610, 678, 891, 1035 | Pitch = "Paso / Passage". "El paso máximo nunca excederá de 500mm / The maximum passage will never exceed 500mm." (610). Section heading 610: "POSICIONAMIENTO Y NÚMERO DE GRAPAS / POSITIONING AND NUMBER OF CLIPS". |
| min 2 clips per edge | NÚMERO MÍNIMO DE GRAPAS: Todas las aristas llevarán como mínimo dos grapas, aunque el paso entre ellas sea inferior al indicado en la tabla de posicionamiento de grapas | MINIMUM NUMBER OF CLIPS: All the edges must have at least 2 clips, even if the passage between them is lower thean [sic] the indicated in the clip positioning table | 610, 678, 891, 1035 | |
| clip placement rules | La primera grapa irá colocada 30 mm después del apoyavidrios…; Las grapas de los extremos se colocarán a 70mm de los ejes de la modulación | The first clip will be placed 30 mm after the glass support…; The of clips the edges [sic] will be placed at 70 mm from the modulation axis | 611, 679, 892 | 891 heading: "SEPARACIÓN ENTRE LA GRAPA Y EL APOYAVIDRIOS / SEPARATION BETWEEN CLIP AND GLASS SUPPORT". |
| double clip on joints vs single clip at façade edge | — | — | — | NOT IN CATALOGUE as a written rule. Only the two parts exist (999018-21/999215-16 double, 999022-25/999226-27 single) and the table columns (6a)/(6b). |
| positioners for the U profile | Posicionador (999073/4/5) | Positioner | 608-609, 669-670 | "Es una pieza puntual de 100mm de longitud… / It is an exceptional piece of 100mm length…". 669: "POSICIONADORES - SEPARACIÓN MÁXIMA Y DISTANCIA A BORDE / POSITIONERS - MAXIMUM SEPARATION AND DISTANCE TO EDGE" = 30 mm / 300 mm. 670: "LOS POSICIONADORES SE RETIRARÁN CUANDO LA SILICONA ESTÉ SECA / THE POSITIONERS MUST BE REMOVED ONLY WHEN THE SILICONE IS DRY". |
| U profile | Perfil-U; Perfil U para sistema SG (COR-9956); perfil intercalario | U-profile; SG system U profile; intermediate profile / insert profile / inserts profiles | 25, 608, 669-670 | 608: "En la cámara del vidrio colocaremos el perfil-U COR-9956… / The U-profile COR-9956… must be placed in the glass chamber". 670: "COLOCACIÓN DEL PERFIL COR-9956 EN EL INTERCALARIO DEL VIDRIO / PLACEMENT OF PROFILE COR-9956 IN THE GLASS INSERT". |
| U profile glued in the chamber by the glass manufacturer | — | — | 608, 669-670 | NOT IN CATALOGUE that the glass manufacturer does it. The catalogue only says it is positioned "durante el proceso de fabricación del mismo [vidrio] / during the manufacturing process" (608) under "FABRICACIÓN DE VIDRIOS CON CÁMARA / FABRICATION OF GLASS WITH CHAMBER", sealed with "SIKA SIKASIL IG-25/IG-25 HMPLUS O DOW CORNING DC 3362" (670). "No utilizar butilo para pegar el separador al vidrio / Do not use butyl to glue the glass separator" (669). |
| U profile only with 16/18/20 mm chambers | Las cámaras permitidas son de 16, 18 y 20mm. | The allowed chambers are of 16, 18 and 20 mm. | 567 | SG general features. Positioner table on 670: "Cámara vidrio / Glass chamber". |
| SG glass minimum 500 × 300 mm | La modulación mínima del vidrio permitida por el sistema es de 500x300mm (Lh x Lv); Dim. mín. vidrio: 500mm x 300 mm | The minimum modulation of the glass allowed by the system is 500x300mm (Lh x Lv); Min. Dim. glass: 500mm x 300 mm (Lh x Lv) | 608, 669 | |
| max glass size for gluing the U profile (4.5 m per side, W+H ≤ 6.5 m) | DIMENSIONES MÁXIMAS - VIDRIO (SOLUCIÓN SELLADO EXTERIOR); Altura del vidrio / Anchura del vidrio | MAXIMUM DIMENSIONS - GLASS (OUTSIDE SEALING SOLUTION); Glass height / Glass width [m] | 669 ("PERFIL EN "U" Y DIMENSIONES MÁXIMAS DEL VIDRIO / "U" PROFILE AND MAXIMUM DIMENSIONS OF GLASS"), 671 | The 4.5 m limit appears only as chart axes (0…4.5 m). **"W+H ≤ 6.5 m" is NOT IN CATALOGUE text**; it would have to be read off the chart curve. Monolithic: "La modulación máxima permitida es de 2000x3000mm / The maximum modulation allowed is 2000x3000mm" (612, 677). |
| dry gasket max size by silicone and outer pane | DIMENSIONES MÁXIMAS - VIDRIO (SOLUCIÓN JUNTA SECA); Diagrama para vidrio exterior de 6 mm; Zona no permitida SG-500 / SG-550 / IG-25 HM Plus (ó similar) | MAXIMUM DIMENSIONS - GLASS (DRY GASKET SOLUTION); Diagram for outside glass of 6 mm; Area not allowed SG-500 / SG-550 / IG-25 (or similar) | 672-674 | These are maximum glass dimensions, not a maximum dry-gasket "width". Min silicone thickness: "El espesor "e" nunca será inferior a 6 mm. (ò 8 mm.), para vidrios sellados exteriormente, y 10 mm. (ó 15 mm.) para vidrios con solución de junta seca" (669). |
| values for 1500 Pa, beyond that specific study | IMPORTANTE: La carga de viento con la que se ha calculado es de 1500 Pa. Para otras cargas de viento superiores, deberá realizarse un estudio específico. | IMPORTANT: It has been calculated for a 1500 Pa windload. For higher windloads, a specific study must be carried out. | 671-674 | |
| glasses always installed bottom to top | SIEMPRE SE COLOCARÁN LOS VIDRIOS DE ABAJO HACIA ARRIBA. | GLASSES MUST ALWAYS BE PLACED FROM BOTTOM TO TOP. | 680 | Steps 680-681: "1.- Posicionar el vidrio inferior sobre los calzos… / 1.- Position the bottom glass on the wedges…". |

## 12. Silicones and joints

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| structural silicone | Silicona estructural | Structural silicone (also "structural sillicone" [sic], 11) | 11, 349-365, 612, 638-648 | 612/677: "SIKA Sikasil SG-500 ó Dow Corning DC-993". Bead: "cordón de silicona / silicone bead". |
| sealing silicone (DC 791 / 756 SMS / Sikasil WS-605 S) | SELLADO DE ESTANQUEIDAD ENTRE CRISTALES; 2.- Sellado con silicona | WATERTIGHTNESS SEALING BETWEEN GLASSES; 2.- Silicone sealing | 682 | Products printed: "DOW CORNING 791 / 756 SMS", "SIKASIL WS-605 S (o similar)". There is no single noun like "silicona de sellado". |
| joint of 22 mm between glasses | Llaga entre vidrios de 22mm tanto en horizontal como en vertical | Allowance between glasses of 22mm both horizontal and vertical | 567 (SG), 1221 | Joint between glasses = "fosa entre vidrios / separation between glasses" (570); "fosa vertical / vertical pit" (611). |
| perimeter joints solved with connection details (start, coping, lateral) | Detalle(s) de arranque; Detalle(s) de Coronación; Encuentro Lateral con Fachada Ventilada; Detalles de Paso de Forjado | Start-up details; Coronation details; Lateral meeting with ventilated facade; Slab details | 557, 752, 980, 1094, 1214, 1302-1304 | Section titles only. No sentence says perimeter joints are solved with these details. "Coping" is NOT IN CATALOGUE; it uses "Coronation". |
| mitre sealing | Sellado ingletes con mastic neutro sin disolventes | Mitre area sealing with neutral mastic without solvents | 675-676, 1031, 1276, 1279 | |

## 13. ST 52

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| glass frame COR-9982 | Bastidor para fijos ST-52 | Frame for ST-52 system fixed lights | 26, 85, 1029-1035 | "Bastidor" = "frame". |
| cut at 45° | Corte a 45º | Cut at 45º | 1031, 1033, 1043, 1045 | 1031/1033: "Se debe incorporar la pletina para el sellado estructural (Cor-7298) antes de proceder a ingletar. Corte a 45º / The plate for structural sealing (Cor-7298) must be included before mitre. Cut at 45º". Elsewhere: "Corte de perfiles a 45º / Cut profiles at 45º" (258-263). |
| structural sealing plate COR-7298 | Pletina sellado estructural (Cor-7298); pletina para el sellado estructural; pletina de sellado | Structural sealing plate (Cor-7298); plate for structural sealing; sealing plate | 1029-1031, 1033, 442/518 | The profile list names COR-7298 "Pletina Canal Cortizo / Cortizo Groove operating rod" (16). |
| interrupted 100 mm at supports | Interrumpir en 100 mm. la pletina de sellado Cor-7298 para situar y fijar el soporte Cor-9994 | Interrupt sealing plate Cor-7298 at 100 mm. and fix support Cor-9994 | 1030 | The support is printed "Cor-9994" here, but it is "COR-9942" on 1028/1146. Probably a catalogue typo. |
| injection cleat | Escuadras de inyección (heading); Escuadra inyección (222085) | Mechanical cleats (headings); Injection corner cleat (list) | 1031-1032, 115 | 1031: "MONTAJE COR-9982 CON ESCUADRAS DE INYECCIÓN / COR-9982 ASSEMBLY WITH MECHANICAL CLEATS". |
| assembly cleat | Escuadras de ensamblar | Assembly cleats | 1033-1034 | "MONTAJE COR-9982 CON ESCUADRAS DE ENSAMBLAR / COR-9982 ASSEMBLY WITH ASSEMBLY CLEATS"; "INGLETE PERFILES - ESCUADRAS DE ENSAMBLAR / MITRE AREA PROFILES - ASSEMBLY CLEATS". |
| assembly cleat 41.4 mm | COR-3160 Perfil cortado a 41,40 mm; Perfil cortado a medida de tubular | Profile cut at 41.40 mm; Profile cut at tubular measure | 1033-1034 | COR-3160 = "Perfil para escuadra de ensamblar de 13,60 mm / Profile for assembly cleat - 13.60 mm" (16). |
| coupling COR-9971 | Acople para montante (ST-52 - SST-52) | Mullion coupling (ST-52 - SST-52) | 26, 1027, 1145 | 1027: "ESQUEMA FIJACIÓN ACOPLE COR-9971 / COR-9971 ATTACHMENT FIXATION SCHEME". |
| coupling screws at 30 mm from ends, max 250 mm | Separación fijaciones Cor-9971 (30.0 / ≤ 250) | COR-9971 fixations separation | 1027, 1145 | The values are dimensions only. Note: "Todos los tramos de perfil Cor-9971 llevarán como mínimo dos tornillos referencia 999107 / All sections of profile Cor-9971 will have at least to [sic] screws ref. 999107". |
| transom support at L/10 | ESQUEMA COLOCACIÓN SOPORTE COR-9942 (L/10, 100 mm); Longitud de corte COR-9942 = 100 mm | COR-9942 SUPPORT PLACEMENT SCHEME; Cut length COR-9942 = 100 mm | 1028, 1146 | COR-9942 in the list: "Cuelgue bastidor ST-52 - SST-52 / ST-52 - SST-52 frame hook" (24). Headings 1030/1148: "MONTAJE SOPORTES VIDRIO / GLASS SUPPORTS ASSEMBLY". |
| clips 999030 on three sides | Las grapas (999030) se colocarán guiadas en el perfil COR-9982 antes de cerrar el inglete… en todos los laterales excepto en el lateral inferior | Clips (999030) will be placed in profile COR-9982 before closing the mitre area… in all the laterals except the bottom lateral | 1035 | Part: "Grapa fijación ST-52 y SST-52 / ST-52 & SST-52 fixing clip" (127). Heading: "COLOCACIÓN DE LAS GRAPAS / CLIPS PLACEMENT". |
| frame gasket | Junta perimetral ST52 - SST52 (999173); Junta labio ST52 - SST52 (999172) | ST52 - SST52 perimetral gasket; ST52 - SST52 lip gasket | 131, 1030, 1113, 1147 | |
| ST glass support | Apoyavidrios ST-52 de 37 mm (999196) | 37 mm ST-52 glazing support | 132, 1029-1030 | 1029: ""X" Debe cubrir al menos el 75% del espesor de la luna exterior / "X" must cover at least the 75% of the thickness of the outside glass". |

## 14. SST 52

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| frame COR-9983 | Bastidor para fijos SST-52 | Frame for SST-52 system fixed lights | 26, 86, 1147-1148 | 1148: "Lb: ancho bastidor / frame width (COR-9983)", "Hb: alto bastidor / frame height". |
| "with outer trim" | — | — | — | NOT IN CATALOGUE for COR-9983. The trim words elsewhere are "embellecedor / trim" (8-11) and "tapeta embellecedora / trim cover" (82 mm pressure, 9-10). |
| glass gasket + reducer table | Espesor del vidrio / (1) / (2); "Goma hoja (1)"; "Reductor de galce (2)" | Glass thickness; "Sash rubber (1)"; "Rebat profile reducer (2)" [sic] | 1113 (image) | (1) = 250097/242701/240134 (list: "Junta interior de acristalamiento 7 / 5 / 3 mm / 7 / 5 / 3 mm inner glazing gasket"); (2) = COR-9946/9945/9944. Outside seal 240137 = "Junta exterior de sellado / Sealing outer gasket". |
| support COR-9942 | Soporte COR-9942 | COR-9942 support | 1146 | Same as ST. |
| outer sealing | SELLADO exterior | Outside SEALING | 1147 | |

## 15. Skylight (Lucernario - Veranda)

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| system name | Lucernario - Veranda | Skylight - Veranda | 1221-1304 | |
| slope range | INCLINACIÓN EN CUBIERTA (90-βº); pendiente mínima 7º (12%) … máxima 40º (84%) | INCLINATION ON COVER (90-βº); minimum slope 7º (12%) … maximum 40º (84%) | 1271 | Intermediate values printed: 8,5º (15%), 10º (18%), 20º (36,5%), 30º (58%). Sections: "Variable de 50° a 83° / Variable from 50° to 83°" (βº, 1249-1265). |
| snow | SOBRECARGA DE NIEVE; Sn = sobrecarga de nieve | SNOW EXCESS LOAD; snow excess loading | 1289-1290, 1293 | Only in the roof-window hardware: "PESO DE HOJA = PESO PROPIO + SOBRECARGA DE NIEVE (kg.) / SASH WEIGHT = OWN WEIGHT + SNOW EXCESS LOAD (kg.)". |
| eaves joint with sleeve COR-9912 (L1, L2) | UNIÓN MONTANTE INCLINADO; Camisa (COR-9912); CAMISA MONTANTE LATERAL; CAMISA MONTANTE INCLINADO; L1 = A / cos (β/2), L2 = L1 + 200 / tg (90-β/2) | INCLINED MULLION JOINT PROFILE; Cover (COR-9912); LATERAL MULLION COVER; INCLINED MULLION COVER | 1271-1272 | "Eaves" is NOT IN CATALOGUE. COR-9912 = "Camisa para montante de ángulos variables / Reinforcement profile for variable angle mullion" (23). 1272: "La camisa Cor-9912 está disponible en barras de 6,5 m de longitud / Cover Cor-9912 is available in bars of 6.5 m length". |
| wall guide COR-9830/31/32 | Guía anclaje montante a muro (9830); Perfil cuelgue anclaje montante a muro (9831); Perfil viga apoyo anclaje montante a muro (9832); Anclaje a muro | Anchoring guide for mullion to wall; Hanging profile for anchoring mullion to wall; Support beam profile for anchoring mullion to wall; Anchoring to wall | 19, 102-103, 1275 | 1275: "Se obtiene por corte y mecanizado del perfil Cor-9830 / It is obtained through machining and cutting of profile Cor-9830". |
| inclined cover set | Juego de tapas para presor inclinado (999935); EMSAMBLAJE [sic] DEL JUEGO DE TAPAS PARA PRESOR INCLINADO | Cover set for inclined pressure; COVER SET FOR INCLINED PRESSURE SECTION ASSEMBLY | 167, 1276-1278 | 1277: "…se deben montar los presores de los travesaños (COR-9919) junto con el juego de tapas (Ref: 999935) antes que los presores de los montantes (COR-9913/14) / …the pressure section for transom (COR-9919) must be mounted together with the cover set (Ref: 999935) before the pressure section for mullion". 1278: "DESCUENTO PERFILES CON TAPA PARA PRESOR INCLINADO / PROFILES ALLOWANCE WITH COVER SET FOR INCLINED PRESSURE SECTION". |
| K gasket / silicone on transoms | — | — | — | NOT IN CATALOGUE (no "K" gasket term; no skylight-specific silicone-on-transom text). The skylight feature pages (1224-1225, image) repeat "Gomas seccionables / Divisible rubbers" and "Escuadra vulcanizada total / Total vulcanised cleat". |
| roof window | Ventana de tejado | Roof Window | 1279-1298 | Parts: "Marco ventana tejado / Roof window frame" (COR-9835), "Hoja ventana tejado / Roof window sash" (COR-9825), "Tapeta exterior hoja ventana tejado / Outer end plate for roof window sash" (COR-9826). |
| "roof window 1.23 × 1.48 m" tests | PRODUCTO: Apertura Veranda; Dimensiones: 1,23 x 1,48 m - 1 hoja | PRODUCT: Veranda Opening; Size: 1,23 x 1,48 m - 1 hoja [sic, untranslated] | 1229 | Certificate Nº 120053 (air EN 12207 class 4, water EN 12208 class E2100, wind EN 12210 class C5). |

## 16. Window integrated in the façade

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| frame [toc] | Marco (e.g. "Marco de ventana proyectante / Projecting window frame", COR-9977) | Frame | 21-22, 26, 391-437 | "Fijación de marco / Frame fixation"; "MONTAJE … MARCO VENTANA EN LA ESTRUCTURA / WINDOW FRAME ASSEMBLY IN THE STRUCTURE". |
| outer frame [ramă exterioară] | — | — | — | NOT IN CATALOGUE ("marco exterior" not found). |
| sash [cercevea] | Hoja (e.g. "Hoja de ventana proyectante / Projecting window sash", COR-9975) | Sash | 21-22, 26, 391-437 | "PESO HOJA / SASH WEIGHT"; "ALTURA HOJA / SASH HEIGHT". |
| sash outer cover [capac exterior cercevea] | Perfil exterior de Hoja; Tapeta exterior hoja (roof window) | Sash outside profile; Outer end plate for … sash / OUTSIDE END PLATE SASH | 395, 440, 518, 690; 19, 90, 1284-1285 | |
| frame cover | Tapeta marco proyectante | Cover frame top hung | 22 (COR-9878) | |
| reducer | Reductor de galce apertura | Opening glazing space reducer | 606 | |
| U profile | — | — | — | No window-specific U-profile term; see §11 (Perfil-U / U-profile). |
| sealing plate [platbandă etanșare] | Pletina sellado estructural; pletina de sellado estructural | Structural sealing plate | 442, 518 ("(Interrumpir la pletina de sellado estructural.) / (Interrupt structural sealing plate.)"), 1029-1030 | |
| awning / projecting window | Ventana proyectante; apertura proyectante; Ventana proyectante paralela | Awning window; awning opening; (parallel: "PARALLEL OPENING GLAZING") | 391-437, 684-734, 902-910, 1036-1038, 1154-1162 | Section heads "TP 52 - Ventana proyectante / TP 52 - Awning window". The profile list uses other EN words: "projecting window sash", "Windows sash top hung", "Frame window top hung TP". Headings 316: "ACRISTALAMIENTO EN APERTURA PROYECTANTE / AWNING OPENING GLAZING". Other types: "APERTURA ABISAGRADAS / HINGED OPENING" (320), "PRACTICABLE Y OSCILO / CASEMENT AND TILT" (321). |
| glass in sash | MONTAJE VIDRIO EN HOJA PROYECTANTE | GLASS ASSEMBLY IN AWNING SASH | 395-397 | |

## 17. Blind zone / opaque panel

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| blind zone [zonă oarbă] | Zona ciega; Sección horizontal / vertical por zona ciega | Blind spot; Blind spot horizontal / vertical section | 325, 388-389, 615 | SG 618-625: "Zona opaca / Opaque area". |
| blind-zone frame [ramă zonă oarbă] | FABRICACIÓN DE BASTIDOR PARA ZONAS CIEGAS; AIREACIÓN-DRENAJE BASTIDOR | FRAME FABRICATION FOR BLIND SPOTS; FRAME VENTILATION-DRAINAGE | 388-389 | 388: "APLICAR DOS CORDONES DE SILICONA A LO LARGO DE TODO EL PERFIL / APPLY TWO SILICONE BEADS ALONG THE PROFILE"; "Medida de corte y mecanizado Cor-9950 / Cor-9950 cutting measure and machining". |
| finishing panel | Panel de remate | Finishing panel | 337, 342 | |

## 18. Cutting

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| cutting list | — | — | — | NOT IN CATALOGUE. Closest: "SECCIONES DE DESPIECE VENTANA PROYECTANTE VIDRIO DOBLE" (687-688). |
| profile deductions (cut lengths) | DESCUENTO PERFILES; "L travesaño/transom = L - 22"; "L presor/pressure = L - 58"; "L tapeta/end plate = L - 53" | PROFILES ALLOWANCE | 379, 1278 | Also "Medidas vidrio / Glass measures: Lv = L - 22, Hv = H - 22" (379). |
| cut length / cutting measure | Longitud de corte; Medida de corte | Cut length; cutting measure; cutting legth [sic] | 683, 1028, 388, 1278 | 683: "LONGITUD DE CORTE DEL TRAVESAÑO POLIGONAL / POLYGONAL TRANSOM CUT LENGTH". |
| bar length | barras de 6,5 m de longitud | bars of 6.5 m length | 1272 | Only once, for COR-9912. "bar length" as a term is NOT IN CATALOGUE. |
| waste / kerf | — | — | — | NOT IN CATALOGUE. |
| cut at 45° | Corte a 45º; Corte de perfiles a 45º | Cut at 45º; Cut profiles at 45º | 258-264, 1031, 1033 | Mitre = "inglete / mitre (area)". |

## 19. Thermal transmittance labels

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| Ucw | Ucw: Transmitancia de la fachada ligera | Ucw: Light façade transmittance | 12 | Certificates: "UCW (Transmitancia del muro) / (Curtain walling Thermal Insulation)" (299). Chart title: "COMPARATIVA TÉRMICA ENTRE SISTEMAS DE FACHADA CORTIZO / THERMAL COMPARATIVE BETWEEN CORTIZO FAÇADE SYSTEMS". |
| Ug | Ug: Transmitancia del vidrio | Ug: Glazing transmittance | 12, 299 | "(Ucw) según las normas EN 13947:2005 y EN 10077-2:2003 / (Ucw) according to EN 13947:2005 and EN 10077-2:2003" (299). |

## 20. Tests

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| certificate heading | CERTIFICADO DE ENSAYO | TEST CERTIFICATE | 299-301, 1229 | Chapter: "Certificados y ensayos / Certifications and tests". |
| air permeability | ENSAYO DE PERMEABILIDAD AL AIRE | AIR PERMEABILITY TEST | 301 (EN 12152:2000), 1229 (EN 12207:2000) | Façade class: "CLASE AE / CLASS AE (by total area and total gaskets length)". |
| water tightness | ENSAYO DE ESTANQUEIDAD AL AGUA | WATER TIGHTNESS TEST | 301 (EN 12154:2000), 1229 (EN 12208:2000) | Façade "CLASE / CLASS RE1350"; Veranda "E2100". |
| wind resistance | ENSAYO DE RESISTENCIA A LA CARGA DEL VIENTO | WIND RESISTANCE TEST | 301 (EN 13116:2001), 1229 (EN 12210:2000) | Façade "2000Pa"; Veranda "C5". |
| thermal | ENSAYO TÉRMICO | THERMAL TEST | 299 | |
| classification | CLASIFICACIÓN | CLASSIFICATION | 301, 1229 | Also "Certificación CWCT según normativa británica / British standard CWCT" (301). |

## 21. General words used in checks

| concept | ES (catalogue) | EN (catalogue) | pages | notes |
|---|---|---|---|---|
| glass weight | — (closest: "Peso max. sobre travesaño (kg)", "PESO HOJA") | — (closest: "Max. weight on transom (kg)", "SASH WEIGHT") | 250-251, 1289 | "peso del vidrio / glass weight" NOT IN CATALOGUE. Profile weight: "Peso / Weight (g/m)". |
| glass thickness | Espesor de vidrio; Espesor vidrio interior; Espesor total de vidrio | Glass thickness; Interior glass thickness | 305-315, 581, 777, 780 | |
| inertia Ix | Ix (cm4), Iy (cm4) | Ix (cm4), Iy (cm4) | 35-110 (profiles to scale) | The word "inercia/inertia" is NOT IN CATALOGUE; only the symbols. |
| wind load | Carga de viento | Wind load / windload | 228, 610-612, 671-678 | 228: "EJEMPLOS DE CÁLCULO DE PESO Y CARGA DE VIENTO ADMISIBLES / EXAMPLES OF CALCULATING PERMISSIBLE WEIGHT AND WIND LOAD". |
| suction | Succión del viento [Pa] | Wind suction [Pa] | 610, 678, 891, 1035 | |
| design (load) | carga de diseño (la nominal mayorada por el coeficiente correspondiente) … la nominal multiplicada por 1.5 | design load (the increased nominal by the corresponding coefficient) … the nominal multiplied by 1.5 | 610, 678, 891, 1035 | |
| span between anchors | — | — | — | NOT IN CATALOGUE. Related: "L: distancia entre ejes de montantes / distance between mullion axis", "H: distancia entre ejes de travesaños / distance between transom axis" (1027, 1145); "L = DISTANCIA ENTRE MONTANTES / DISTANCE BETWEEN MULLIONS", "H = DISTANCIA ENTRE TRAVESAÑOS / DISTANCE BETWEEN TRANSOMS" (1284-1285). |
| module width | — (closest: "modulación"; "ejes de la modulación") | — (closest: "modulation"; "modulation axis") | 567, 608, 611-612 | "ancho de módulo / module width" NOT IN CATALOGUE. |
| maximum vertical load | CARGA VERTICAL MÁXIMA | MAXIMUM VERTICAL LOAD | 183-190, 247 | |
