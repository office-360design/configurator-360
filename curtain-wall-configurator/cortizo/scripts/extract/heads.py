import re,sys
t=open(sys.argv[1]+'/txt/all.txt',errors='ignore').read().split('\f')
a,b=int(sys.argv[2]),int(sys.argv[3])
for i in range(a-1,b):
    L=[l.strip() for l in t[i].split('\n') if l.strip()]
    sub=re.sub(r'\s+',' ',L[1]) if len(L)>1 else ''
    caps=[re.sub(r'\s{2,}',' / ',l) for l in L[4:] if re.match(r'^[A-ZÁÉÍÓÚÑ0-9 /\-\.,()º°]{14,}$',l) and not l.startswith('04 2026')]
    f=sorted(set(re.findall(r'\b[LHAB][a-z]?\s?[-+=]\s?\d+(?:[.,]\d+)?',t[i])))
    print(i+1,'|',sub[:45],'|',' ; '.join(dict.fromkeys(caps))[:150],'|',f[:8],'| len',len(t[i].strip()))
