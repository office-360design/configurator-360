import re,json,sys
S=sys.argv[1]
t=open(S+'/txt/all.txt',errors='ignore').read().split('\f')
code_re=r'(COR-\d{4}|\d{6})'
# profile list 13..32
plist={}
for pi in range(12,26):
    lines=t[pi].split('\n')
    for k,l in enumerate(lines):
        m=re.match(r'^\s{2,8}'+code_re+r'\s+(.*)$',l)
        if not m: continue
        code=m.group(1); rest=m.group(2).split()
        # numbers: weight surface page
        nums=[x for x in rest]
        # description: line above (es) and below (en)
        es=lines[k-1].strip() if k>0 else ''
        en=lines[k+1].strip() if k+1<len(lines) else ''
        w=s=pg=None
        if len(nums)>=1: w=nums[0]
        if len(nums)>=2: s=nums[1]
        if len(nums)>=3: pg=nums[2]
        plist.setdefault(code,None) or None
        if plist[code] is not None: continue
        plist[code]=dict(code=code,desc_es=es,desc_en=en,weight_g_m=w,surface_dm2_m=s,detail_page=pg,list_page=pi+1)
# to-scale 33..112
scale={}
for pi in range(32,112):
    txt=t[pi]
    for blk in re.split(r'\n(?=\s+(?:COR-\d{4}|\d{6})\s*\n)',txt):
        m=re.search(r'^\s+'+code_re+r'\s*$',blk,re.M)
        if not m: continue
        c=m.group(1)
        d={}
        for key,pat in [('Ix',r'Ix \(cm4\)\s+([\d.,]+)'),('Iy',r'Iy \(cm4\)\s+([\d.,]+)'),('peso',r'Peso\s+([\d.,]+)')]:
            mm=re.search(pat,blk)
            if mm: d[key]=mm.group(1)
        dm=re.search(r'Descripción\s+(.*)\n\s+Description\s+(.*)',blk)
        if dm: d['desc_es']=dm.group(1).strip(); d['desc_en']=dm.group(2).strip()
        d['scale_page']=pi+1
        scale.setdefault(c,d)
json.dump(dict(plist=plist,scale=scale),open(S+'/out/profiles_raw.json','w'),ensure_ascii=False,indent=1)
print(len(plist),len(scale))
print(len([c for c in scale if 'Ix' in scale[c]]))
print([c for c in plist if c not in scale][:80])
print([c for c in scale if c not in plist][:40])
