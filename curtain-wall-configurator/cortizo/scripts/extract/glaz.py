import re,json,sys
S=sys.argv[1]
t=open(S+'/txt/all.txt',errors='ignore').read().split('\f')
ranges=[(303,322),(579,612),(775,824),(1111,1114),(1219,1316)]
out=[]
for a,b in ranges:
  for pn in range(a,b+1):
    p=t[pn-1]; L=p.split('\n')
    sysname=re.sub(r'\s+',' ',L[2].strip()) if len(L)>2 else ''
    titles=[x.strip() for x in re.findall(r'(?:Tabla de acristalamiento|Acristalamiento|Vidrio cámara)[^\n]{0,60}',p)]
    hdr_idx=[k for k,l in enumerate(L) if re.search(r'\(1\)\s+\(2\)',l) or re.search(r'\(A\)\s+\(B\)\s+\(C\)',l)]
    cur=None
    for k,l in enumerate(L):
        if k in hdr_idx:
            cur=re.findall(r'\(([0-9A-C][a-c]?)\)',l); continue
        m=re.match(r'^\s*(\d+\+\d+)?\s*(\d{1,2})\s{2,}((?:\d{6}|COR|-|–).*)$',l)
        if not m or cur is None: continue
        toks=[x for x in re.split(r'\s{2,}',m.group(3).strip()) if x]
        out.append(dict(page=pn,system=sysname,titles=titles[:2],cols=cur,interior=m.group(1),thk=int(m.group(2)),toks=toks))
json.dump(out,open(S+'/out/glaz_raw.json','w'),ensure_ascii=False)
from collections import defaultdict
g=defaultdict(list)
for r in out: g[(r['page'])].append(r)
for pn,rs in g.items():
    cols=rs[0]['cols']; lens=sorted(set(len(r['toks']) for r in rs))
    print(pn,rs[0]['system'][:28],'|',rs[0]['titles'][:1],'| cols',len(cols),cols,'| toklens',lens,'| n',len(rs),'| thk',rs[0]['thk'],'-',rs[-1]['thk'])
