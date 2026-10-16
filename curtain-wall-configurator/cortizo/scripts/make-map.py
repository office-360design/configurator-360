# Generează harta logică (SVG) folosită în web/template.html. Rulare: python3 scripts/make-map.py > web/map.html
steps=[("1","Montant pe fiecare ax","b, L → Ix,nec = 5·q·b·L⁴/(384·E·f) → cel mai puțin adânc montant (+ cămașă)",False),
("2","Traversă pe fiecare linie","aceeași adâncime ca montantul · verificare la vânt pe lățimea modulului",False),
("3","Vitraj pe câmp","grosimea pachetului (+ foaia interioară) → tabelul sistemului → componente",False),
("4","Greutate → suporți","2 std → 4 std → sarcini mari → cruce · pe pantă doar componenta ∥",False),
("5","Prinderea sticlei – specifică sistemului","vezi ramificația din dreapta",True),
("6","Îmbinare montant–traversă","frontal 225 kg · lateral 300 kg · sarcini mari 400 kg",False),
("7","Ancoraje","greutate + vânt pe deschidere → 1, 2 sau 3 × 999183",False),
("8","Debitare pe bare","formulele sistemului → First-Fit pe bare de 6,5 m",False),
("9","Listă de materiale","profile (m, bare, kg, vopsire) + accesorii (buc, m)",False)]
data=[("Montanți","Ix, Ix cu cămașă"),("Traverse","Ix, guler"),("Tabele vitraj","5.285 rânduri + lucernar"),("Suporți sticlă","kg cu 2 / 4 suporți"),("Reguli sistem","data/rules/*.json"),("Îmbinări","sarcină max."),("Ancoraje","kN / kg"),("Deduceri","L−22, L−58 …"),("Profile + accesorii","kg/m, descriere")]
branches=[("Presor + capac","TP · TPH oriz. · TPV vert. · căpriori","presor L−58 · capac L−53"),
("Cleme + profil U","SG · TPH vert. · TPV oriz.","pas după q×1,5 și m² · silicon"),
("Ramă proprie","ST lipită · SST ornament","ramă L−22 · cuplaj L−28,5"),
("Silicon pe traverse","Lucernar – acoperiș","garnitură K + silicon")]
inputs=[("Grila","module · ancoraje"),("Încărcări","vânt · zăpadă"),("Sistem","7 sisteme"),("Sticlă","pachet · foi")]
W,H=1200,790; y0,h,g=150,50,22; ex,ew=270,470
o=[f'<svg class="map" viewBox="0 0 {W} {H}" role="img" aria-label="Harta logică: patru intrări, nouă etape de calcul, fiecare cu foaia ei de date; etapa 5 se ramifică după sistem în presor, cleme, ramă sau silicon; rezultatele sunt montantul ales, desenul cu stări, lista de debitare și oferta.">',
'<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker><marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--warn)"/></marker><marker id="ars" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--steel)"/></marker></defs>']
lab=lambda x,y,t:o.append(f'<text x="{x}" y="{y}" font-size="12" font-weight="600" letter-spacing="1.5" fill="var(--muted)">{t}</text>')
lab(ex,14,'INTRĂRI'); lab(20,y0-16,'DATE DIN CATALOG'); lab(ex,y0-16,'MOTOR COMUN'); lab(790,y0-16,'SPECIFIC SISTEMULUI'); lab(1030,y0-16,'REZULTATE')
iw=112
for i,(a,b) in enumerate(inputs):
    x=ex+i*(iw+12)
    o.append(f'<rect x="{x}" y="24" width="{iw}" height="48" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/><text x="{x+9}" y="44" font-size="13.5" font-weight="600" fill="currentColor">{a}</text><text x="{x+9}" y="61" font-size="10.5" fill="var(--muted)">{b}</text>')
    o.append(f'<line x1="{x+iw/2}" y1="72" x2="{x+iw/2}" y2="92" stroke="currentColor" stroke-width="1.2"/>')
o.append(f'<line x1="{ex+iw/2}" y1="92" x2="{ex+3*(iw+12)+iw/2}" y2="92" stroke="currentColor" stroke-width="1.2"/><line x1="{ex+ew/2}" y1="92" x2="{ex+ew/2}" y2="{y0-2}" stroke="currentColor" stroke-width="1.5" marker-end="url(#ar)"/>')
ys=[]
for i,(nn,a,b,spec) in enumerate(steps):
    y=y0+i*(h+g); ys.append(y)
    fill='var(--steel)' if spec else 'var(--steel-soft)'; tc='var(--bg)' if spec else 'currentColor'; sc='var(--bg)' if spec else 'var(--muted)'
    o.append(f'<rect x="{ex}" y="{y}" width="{ew}" height="{h}" fill="{fill}" stroke="var(--steel)" stroke-width="1.5"/>')
    o.append(f'<text x="{ex+12}" y="{y+21}" font-size="14.5" font-weight="600" fill="{tc}">{nn}  {a}</text><text x="{ex+12}" y="{y+39}" font-size="11.5" fill="{sc}">{b}</text>')
    if i<len(steps)-1: o.append(f'<line x1="{ex+36}" y1="{y+h}" x2="{ex+36}" y2="{y+h+g-2}" stroke="currentColor" stroke-width="1.2" marker-end="url(#ar)"/>')
    da,db=data[i]
    o.append(f'<rect x="20" y="{y+5}" width="180" height="{h-10}" fill="var(--panel)" stroke="currentColor" stroke-width="1"/><text x="30" y="{y+23}" font-size="13" font-weight="600" fill="currentColor">{da}</text><text x="30" y="{y+38}" font-size="11" fill="var(--muted)">{db}</text>')
    o.append(f'<line x1="200" y1="{y+h/2}" x2="{ex-2}" y2="{y+h/2}" stroke="currentColor" stroke-width="1" marker-end="url(#ar)"/><text x="224" y="{y+h/2-5}" font-size="10" text-anchor="middle" fill="var(--muted)">citește</text>')
# branches from step 5
y5=ys[4]+h/2; bx=790; bw=210; bh=58; bg=12; top=y5-(4*bh+3*bg)/2
o.append(f'<line x1="{ex+ew}" y1="{y5}" x2="{bx-30}" y2="{y5}" stroke="var(--steel)" stroke-width="1.6"/>')
o.append(f'<line x1="{bx-30}" y1="{top+bh/2}" x2="{bx-30}" y2="{top+3*(bh+bg)+bh/2}" stroke="var(--steel)" stroke-width="1.6"/>')
for k,(a,b,c) in enumerate(branches):
    y=top+k*(bh+bg)
    o.append(f'<line x1="{bx-30}" y1="{y+bh/2}" x2="{bx-2}" y2="{y+bh/2}" stroke="var(--steel)" stroke-width="1.4" marker-end="url(#ars)"/>')
    o.append(f'<rect x="{bx}" y="{y}" width="{bw}" height="{bh}" fill="var(--panel)" stroke="var(--steel)" stroke-width="1.5"/><text x="{bx+10}" y="{y+18}" font-size="13" font-weight="600" fill="currentColor">{a}</text><text x="{bx+10}" y="{y+33}" font-size="10.5" fill="var(--steel)">{b}</text><text x="{bx+10}" y="{y+48}" font-size="10.5" fill="var(--muted)">{c}</text>')
outs={0:("Montant + traversă","cu rezerva față de Ix"),3:("Desen cu stări","OK · atenție · nu trece"),7:("Listă de debitare","bucăți, bare, pierderi"),8:("Ofertă / JSON","materiale × preț")}
for i,(a,b) in outs.items():
    y=ys[i]
    if i!=3:
        o.append(f'<line x1="{ex+ew}" y1="{y+h/2}" x2="1028" y2="{y+h/2}" stroke="currentColor" stroke-width="1.2" marker-end="url(#ar)"/>')
    o.append(f'<rect x="1030" y="{y}" width="158" height="{h}" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/><text x="1040" y="{y+21}" font-size="13" font-weight="600" fill="currentColor">{a}</text><text x="1040" y="{y+38}" font-size="10.5" fill="var(--muted)">{b}</text>')
# step 4 to desen route: under branches → go via x=990 from bottom of branches
y3=ys[3]+h/2
o.append(f'<line x1="{bx+bw}" y1="{top+bh/2}" x2="{1016}" y2="{top+bh/2}" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3"/>')
o.append(f'<path d="M1016,{top+bh/2} V{ys[3]+h/2} H1028" fill="none" stroke="currentColor" stroke-width="1" marker-end="url(#ar)"/>')
for k in range(1,4):
    yy=top+k*(bh+bg)+bh/2
    o.append(f'<line x1="{bx+bw}" y1="{yy}" x2="1016" y2="{yy}" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3"/>')
o.append(f'<line x1="1016" y1="{top+bh/2}" x2="1016" y2="{top+3*(bh+bg)+bh/2}" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3"/>')
# feedback
y4=ys[3]+12
o.append(f'<path d="M{ex},{y4} H250 V86 H{ex-2}" fill="none" stroke="none"/><path d="M{ex},{y4} H250 V48 H{ex-2}" fill="none" stroke="var(--warn)" stroke-width="1.6" stroke-dasharray="6 4" marker-end="url(#arw)"/>')
o.append(f'<text x="236" y="36" font-size="11" fill="var(--warn)" text-anchor="end">nu trece →</text><text x="236" y="50" font-size="11" fill="var(--warn)" text-anchor="end">schimbă sticla,</text><text x="236" y="64" font-size="11" fill="var(--warn)" text-anchor="end">modulul sau suportul</text>')
o.append('</svg>')
print('<figure><div class="figwrap">'+''.join(o)+'</div><figcaption>Motorul comun (coloana din mijloc) e același pentru toate sistemele. Singura etapă care se schimbă după sistem este a cincea: cum e prinsă sticla. Fiecare rost al grilei primește unul din cele patru tipuri de prindere din dreapta, iar de aici rezultă clemele, profilul U, ramele sau siliconul din lista de materiale. Linia punctată portocalie e bucla de corecție: dacă un geam nu trece (suport, îmbinare, cleme, dimensiune), configuratorul cere o schimbare la intrări.</figcaption></figure>')
