import re,json,sys
S=sys.argv[1]
t=open(S+'/txt/all.txt',errors='ignore').read().split('\f')
num=lambda x: None if x in (None,'-','') else float(str(x).replace(',','.'))
# ---------- profiles
d=json.load(open(S+'/out/profiles_raw.json'))
plist={k:v for k,v in d['plist'].items() if v['list_page']<=26}
scale=d['scale']
def cat(es):
    e=es.lower()
    rules=[('horquilla','Furcă ancoraj'),('anclaje','Ancoraj'),('camisa','Cămașă armare'),('paso de forjado','Trecere planșeu'),('acople','Cuplaj'),('montante de esquina','Montant de colț'),('montante poligonal','Montant poligonal'),('montante','Montant'),
           ('travesaño 2º','Traversă nivel 2'),('travesaño','Traversă'),('camisa','Cămașă armare'),('presor','Presor'),
           ('tapeta','Capac (tapeta)'),('reductor','Reductor falț'),('aislante','Izolator RPT'),('rotura','Izolator RPT'),
           ('hoja','Fereastră – cercevea'),('marco','Fereastră – toc'),('bastidor','Ramă (bastidor)'),('pletina','Platbandă'),
           ('tubo','Țeavă'),('ángulo','Cornier'),('canal','Jgheab'),('antivuelco','Opritor anti-rotire'),('horquilla','Furcă ancoraj'),
           ('anclaje','Ancoraj'),('suplemento','Suplement'),('solape','Suprapunere'),('escuadra','Profil echer'),('paso de forjado','Trecere planșeu')]
    for k,v in rules:
        if k in e: return v
    return 'Altele'
profiles=[]
for c,v in plist.items():
    s=scale.get(c,{})
    es=v['desc_es'] or s.get('desc_es','')
    m=re.search(r'(\d+)\s*mm',es)
    profiles.append(dict(cod=c,categorie=cat(es),descriere_es=es,descriere_en=v['desc_en'].rstrip('.'),
        adancime_mm=int(m.group(1)) if m and cat(es) in('Montant','Traversă','Traversă nivel 2','Cămașă armare','Montant de colț') else None,
        greutate_kg_m=round(num(v['weight_g_m'])/1000,4) if num(v['weight_g_m']) else None,
        suprafata_dm2_m=num(v['surface_dm2_m']),Ix_cm4=num(s.get('Ix')),Iy_cm4=num(s.get('Iy')),
        pag_lista=v['list_page'],pag_desen=s.get('scale_page')))
# combos p27,28,30
combos=[]
for pn in (27,28,30):
    for l in t[pn-1].split('\n'):
        tok=l.split()
        if len(tok)>=4 and re.match(r'COR-98\d\d$',tok[0]):
            if len(tok)==11: combos.append(dict(montant=tok[0],arm=tok[4],comb=tok[8:11],pag=pn))
            elif len(tok)==7: combos.append(dict(montant=tok[0],arm=None,comb=tok[4:7],pag=pn))
for c in combos:
    if c['arm'] is None and c['montant'] in('COR-9806','COR-9807'): c['arm']='COR-9904'
# camisa mapping p212
cam={}
for l in t[211].split('\n'):
    m=re.findall(r'(COR-98\d\d)\s+(COR-99\d\d)',l)
    for a,b in m: cam[a]=b
# family by page
fam={}
for c in combos: fam[c['montant']]={27:'Standard',28:'Colț / poligonal',30:'Equity (montant T + platbandă)'}[c['pag']]
mont=[]
pmap={p['cod']:p for p in profiles}
for c in combos:
    p=pmap.get(c['montant'],{})
    mont.append(dict(cod=c['montant'],familie=fam[c['montant']],descriere=p.get('descriere_es'),adancime_mm=p.get('adancime_mm'),
        greutate_kg_m=p.get('greutate_kg_m'),Ix_cm4=p.get('Ix_cm4'),Iy_cm4=p.get('Iy_cm4'),armare=(c['arm'] if c['arm'] not in (None,'-') else None) or cam.get(c['montant']),
        Ix_comb=num(c['comb'][1]) if c['comb'][1]!='-' else None,Iy_comb=num(c['comb'][2]) if c['comb'][2]!='-' else None,
        greutate_comb_kg_m=round(num(c['comb'][0])/1000,4) if c['comb'][0]!='-' else None,pag=c['pag']))
# add mullion 9811 & others not in combos
for p in profiles:
    if p['categorie'] in ('Montant','Montant de colț','Montant poligonal') and p['cod'] not in [m['cod'] for m in mont]:
        mont.append(dict(cod=p['cod'],familie='Altele',descriere=p['descriere_es'],adancime_mm=p['adancime_mm'],greutate_kg_m=p['greutate_kg_m'],
            Ix_cm4=p['Ix_cm4'],Iy_cm4=p['Iy_cm4'],armare=cam.get(p['cod']),Ix_comb=None,Iy_comb=None,greutate_comb_kg_m=None,pag=p['pag_desen']))
# transoms
coll={}
for l in t[185].split('\n'):
    m=re.match(r'\s*(COR-98\d\d)\s+(\d+)\s+(\d{6})',l)
    if m: coll[m.group(1)]=(int(m.group(2)),m.group(3))
trav=[]
for p in profiles:
    if p['categorie'].startswith('Traversă'):
        m=re.search(r'para\s+(\d+)\s*mm',p['descriere_es'])
        trav.append(dict(cod=p['cod'],nivel=2 if 'nivel' in p['categorie'] else 1,descriere=p['descriere_es'],pentru_montant_mm=int(m.group(1)) if m else None,
            greutate_kg_m=p['greutate_kg_m'],Ix_cm4=p['Ix_cm4'],Iy_cm4=p['Iy_cm4'],guler=coll.get(p['cod'],(None,None))[1],cota_X_mm=coll.get(p['cod'],(None,None))[0],pag_desen=p['pag_desen']))
# ---------- glazing
LEG={
 'TP':{'1':'Garnitură montant','2':'Garnitură traversă','3':'Reductor falț','4a':'Suport sticlă standard','4b':'Suport sticlă sarcini mari','4c':'Suport sticlă în cruce','5':'Cală','6':'Izolator RPT','7':'Șurub presor','8':'Pipetă drenaj'},
 'TPGA':{'1':'Garnitură montant','2':'Garnitură traversă','3a':'Suport sticlă standard','3b':'Suport sticlă sarcini mari','3c':'Suport sticlă în cruce','4':'Cală','5':'Izolator RPT','6':'Șurub presor','7':'Pipetă drenaj'},
 'TPRC3':{'1':'Garnitură montant','2':'Garnitură traversă','4a':'Suport sticlă standard','4b':'Suport sticlă sarcini mari','4c':'Suport sticlă în cruce','5':'Cală','6':'Izolator RPT','7':'Șurub presor RC3'},
 'SG':{'1':'Garnitură montant','2':'Garnitură traversă','3a':'Suport sticlă standard','3b':'Suport sticlă sarcini mari','3c':'Suport sticlă în cruce','4':'Cală','5':'Izolator RPT','6a':'Clemă SG (a)','6b':'Clemă SG (b)','7':'Șurub','8':'Garnitură fund etanșare'},
 'SGDRY':{'1':'Garnitură montant','2':'Garnitură traversă','3a':'Suport sticlă standard','3b':'Suport sticlă sarcini mari','3c':'Suport sticlă în cruce','4':'Cală','5':'Izolator RPT','6a':'Clemă SG (a)','6b':'Clemă SG (b)','7':'Șurub','8':'Garnitură uscată SG'},
 'TPH':{'1':'Garnitură montant','2':'Izolator RPT','3a':'Clemă (a)','3b':'Clemă (b)','4':'Șurub','5':'Garnitură fund etanșare'},
 'TPHDRY':{'1':'Garnitură montant','2':'Izolator RPT','3a':'Clemă (a)','3b':'Clemă (b)','4':'Șurub','5':'Garnitură uscată SG'},
 'TPV':{'1':'Garnitură montant','2':'Izolator RPT','3':'Șurub presor','4':'Pipetă drenaj'},
}
PAGES={305:('TP 52','Standard – nivel 1','TP'),306:('TP 52','Standard – nivel 2','TP'),311:('TP 52','High Insulation (izolare sporită)','TPGA'),315:('TP 52','RC3 (antiefracție)','TPRC3'),
 582:('SG 52','Standard siliconat – nivel 1','SG'),583:('SG 52','Standard siliconat – nivel 1','SG'),584:('SG 52','Standard siliconat – nivel 1','SG'),586:('SG 52','Standard siliconat – nivel 2','SG'),
 597:('SG 52','Fără siliconare (garnitură uscată) – nivel 1','SGDRY'),598:('SG 52','Fără siliconare (garnitură uscată) – nivel 1','SGDRY'),599:('SG 52','Fără siliconare (garnitură uscată) – nivel 1','SGDRY'),601:('SG 52','Fără siliconare (garnitură uscată) – nivel 2','SGDRY'),
 777:('TPH 52','Standard – nivel 1','TPH'),778:('TPH 52','Standard – nivel 1','TPH'),779:('TPH 52','Standard – nivel 1','TPH'),783:('TPH 52','Standard – nivel 2','SG'),
 785:('TPV 52','Standard','TPV'),786:('TPV 52','Standard','TPV'),787:('TPV 52','Standard','TPV'),
 795:('TPH 52','Fără siliconare (garnitură uscată) – nivel 1','TPHDRY'),796:('TPH 52','Fără siliconare (garnitură uscată) – nivel 1','TPHDRY'),797:('TPH 52','Fără siliconare (garnitură uscată) – nivel 1','TPHDRY'),801:('TPH 52','Fără siliconare (garnitură uscată) – nivel 2','TPHDRY')}
vit=[];issues=[]
for pn,(sysn,var,leg) in PAGES.items():
    L=t[pn-1].split('\n'); cur=None; block=[]; blocks=[]
    def close():
        if block: blocks.append((cur,list(block)))
    for l in L:
        if re.search(r'\(1\)\s+\(2\)',l):
            close(); block=[]; cur=[c for c in re.findall(r'\(([0-9][a-c]?)\)',l)]; continue
        if cur is None: continue
        m=re.match(r'^\s*(\d\+\d)?\s*(\d{1,2})\s{2,}((?:\d{6,7}|COR|-).*)$',l)
        if m: block.append(('row',m.group(1),int(m.group(2)),[x for x in re.split(r'\s{2,}',m.group(3).strip()) if x])); continue
        m2=re.match(r'^\s*(\d\+\d)\s*$',l)
        if m2: block.append(('lab',m2.group(1)))
    close()
    for cols,bl in blocks:
        # groups by thickness reset
        groups=[];g=[];last=-1;labs=[]
        for it in bl:
            if it[0]=='lab': g.append(it); continue
            if it[2]<=last and any(x[0]=='row' for x in g): groups.append(g); g=[]
            g.append(it); last=it[2]
        if g: groups.append(g)
        for g in groups:
            lab=[x[1] for x in g if x[0]=='lab']+[x[1] for x in g if x[0]=='row' and x[1]]
            interior=lab[0] if lab else None
            for it in g:
                if it[0]!='row': continue
                toks=it[3]; ex=[]
                for c in cols:
                    if c.endswith('c') and len(toks)==len(cols)+2: ex+= [c+' central',c+' stânga',c+' dreapta']
                    else: ex.append(c)
                if len(ex)!=len(toks): issues.append((pn,it[2],len(ex),len(toks))); continue
                for c,v in zip(ex,toks):
                    v=v.strip()
                    if re.fullmatch(r'-+',v): continue
                    base=c.split(' ')[0]; sub=c[len(base):].strip()
                    comp=LEG[leg].get(base,'?')+(f' – {sub}' if sub else '')
                    vit.append(dict(sistem=sysn,varianta=var,pag=pn,sticla_interior=interior,grosime_sticla_mm=it[2],pozitie=f'({base})'+(f' {sub}' if sub else ''),componenta=comp,referinta=v))
# ---------- accessories
acc=json.load(open(S+'/out/acc_raw.json'))
TYPE_RO={'Glazing wedge':'Cală / suport sticlă','Handles & cremones':'Mânere și cremoane','Various':'Diverse','Gaskets':'Garnituri','Screws':'Șuruburi','Clip':'Cleme','Motorisation':'Motorizare','Kit':'Kit','Friction stay':'Foarfece (compas)','Covers':'Capace','Strike and lock':'Contra-broască și închidere','Hinge':'Balamale','Punching machine':'Ștanță','Alignment corner cleat':'Echer aliniere','Main/Secondary cleat':'Echer principal/secundar','Main corner cleat':'Echer principal','Milling cutter':'Freză','Secondary corner cleat':'Echer secundar','External transom stopper':'Opritor traversă exterior','Return angle':'Colțar de retur'}
for a in acc: a['tip_ro']=TYPE_RO.get(a.get('type_en'),a.get('type_en'))
# ---------- thermal p12
uc=[]
for l in t[11].split('\n'):
    tok=l.split()
    if tok and tok[0]=='Ug': tok=tok[1:]
    if len(tok)==8 and all(re.fullmatch(r'\d\.\d',x) for x in tok): uc.append([float(x) for x in tok])
json.dump(dict(profiles=profiles,mont=mont,trav=trav,vit=vit,issues=issues,acc=acc,uc=uc),open(S+'/out/data.json','w'),ensure_ascii=False)
print('profiles',len(profiles),'mont',len(mont),'trav',len(trav),'vit rows',len(vit),'issues',issues[:20],len(issues),'acc',len(acc),'ucw',len(uc))
from collections import Counter
print(Counter(p['categorie'] for p in profiles))
print([ (m['cod'],m['armare'],m['Ix_comb']) for m in mont][:25])
print(trav[:3])
print(Counter((v['sistem'],v['varianta']) for v in vit))
print(Counter((v['pag'],v['sticla_interior']) for v in vit if v['sticla_interior']))
# ---------- glass supports p250-251
sup=[]
def grab(pn,section_kw,kind,ncodes):
    txt=t[pn-1]; i=txt.find(section_kw); seg=txt[i:]
    nxt=[k for k in ['APOYAVIDRIOS PARA GRANDES','APOYAVIDRIOS PARA ST','NOTA'] if k in seg[50:]]
    end=min([seg.find(k,50) for k in nxt]) if nxt else len(seg)
    for l in seg[:end].split('\n'):
        tok=l.split()
        if len(tok)>=ncodes+2 and all(re.fullmatch(r'\d{6}',x) for x in tok[:ncodes]):
            rest=tok[ncodes:]
            sup.append(dict(tip=kind,ref=' / '.join(tok[:ncodes]),A_mm=num(rest[0]),kg_2_suporti=num(rest[1]),kg_4_suporti=num(rest[2]) if len(rest)>2 and rest[2]!='-' else None,pag=pn))
grab(250,'APOYAVIDRIOS ESTÁNDAR','Standard',1)
grab(250,'APOYAVIDRIOS PARA GRANDES','Sarcini mari',1)
grab(251,'APOYAVIDRIOS EN CRUZ','În cruce (central / stânga / dreapta)',3)
grab(251,'APOYAVIDRIOS PARA ST-52','Pentru ST 52',1)
dd=json.load(open(S+'/out/data.json')); dd['sup']=sup
# family-table authoritative mullion inertia + depths from family drawings
fam_depth={'COR-9814':75,'COR-9815':105,'COR-9816':150,'COR-9817':130,'COR-9819':175,'COR-9820':200,'COR-9822':150,'COR-9812':175,'COR-9821':225,'COR-9823':200}
for pn in (27,28,30):
    for l in t[pn-1].split('\n'):
        tok=l.split()
        if len(tok) in (7,11) and re.match(r'COR-98\d\d$',tok[0]):
            for m in dd['mont']:
                if m['cod']==tok[0]:
                    m['Ix_cm4']=num(tok[2]); m['Iy_cm4']=num(tok[3]); m['greutate_kg_m']=round(num(tok[1])/1000,4)
                    if m['adancime_mm'] is None: m['adancime_mm']=fam_depth.get(m['cod'])
dd['mont']=[m for m in dd['mont'] if m['familie']!='Altele']
json.dump(dd,open(S+'/out/data.json','w'),ensure_ascii=False)
print('sup',len(sup)); [print(x) for x in sup[:3]]; print(sup[-1]); print(len(dd['mont']))
