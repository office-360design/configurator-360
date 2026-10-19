import re,json,sys
S=sys.argv[1]
t=open(S+'/txt/all.txt',errors='ignore').read().split('\f')
acc=[];bad=[]
for pi in range(113,136):
    L=t[pi].split('\n')
    for k,l in enumerate(L):
        m=re.match(r'^\s{2,8}(\d{6}|COR-\d{4})\s{2,}(.*)$',l)
        if not m: continue
        b=re.split(r'\s{2,}',m.group(2).strip())
        a=re.split(r'\s{2,}',L[k-1].strip()) if k>0 else []
        r=dict(code=m.group(1),list_page=pi+1)
        if len(b)>=4 and b[-1].isdigit():
            r.update(desc_en=b[0],colour_en=b[1] if len(b)>=4 else '',type_en=' '.join(b[2:-1]),detail_page=int(b[-1]))
        elif len(b)>=3:
            r.update(desc_en=b[0],colour_en=b[1],type_en=' '.join(b[2:]),detail_page=None)
        else: bad.append((pi+1,l)); r.update(desc_en=' '.join(b))
        if len(a)>=3: r.update(desc_es=a[0],color_es=a[1],tipo_es=' '.join(a[2:]))
        else: r.update(desc_es=' '.join(a)); bad.append((pi+1,'A:'+L[k-1]))
        acc.append(r)
json.dump(acc,open(S+'/out/acc_raw.json','w'),ensure_ascii=False,indent=1)
print(len(acc),len(set(a['code'] for a in acc)))
print('bad',len(bad)); [print(x) for x in bad[:30]]
from collections import Counter
print(Counter(a.get('type_en') for a in acc).most_common(60))
