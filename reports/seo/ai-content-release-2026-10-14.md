# Conținut verificabil și baseline AI — 14 octombrie 2026

## Scop și limite

Lot website-only autorizat: descrieri corecte, context EN/RO/DE generat din paginile
publice și un exemplu tehnic reproductibil. Nu este un studiu de client, o ofertă
de produs fizic sau o promisiune de creștere. Aplicațiile complete, backend-ul,
consimțământul, GA4 și scriptul SwiftCallback rămân nemodificate.

Stare inițială: branch `codex/website-ai-content-20261014`, bază main
`fb845005a743fafc338cca6f0f2a19f98531dd0e`. Publicarea necesită teste și aprobarea
lotului curent; o aprobare anterioară nu autorizează automat release-uri viitoare.

Implementarea este salvată în commit `57eaffd` și
[PR #565](https://github.com/office-360design/configurator-360/pull/565).
Main a fost reverificat după fetch și PR-ul este MERGEABLE/CLEAN. Nu este live.
Workflow-ul de deployment rulează la push pe main, nu pe acest PR; lista goală
de checks nu înseamnă CI trecut. Verificările locale de mai jos au trecut, iar
deployment-ul și verificarea publică rămân pași după aprobarea publicării.

## 1. Aceleași informații pentru oameni și agenți

- `localized-machine-context.mjs` generează rezumatul și varianta completă pentru
  toate cele trei domenii din metadata și secțiunile marcate ale HTML-ului exportat.
- Rezumatul acoperă paginile principale și cele zece produse; fișierul complet
  include prezentare, opțiuni, rezultate, FAQ și exemplul roof unde există.
- Fiecare limbă păstrează propriile URL-uri canonice și linkuri spre aplicația
  completă. Nu se copiază textul englez pe domeniile RO/DE.
- `llms-full.txt` are circa 35 KB, față de circa 4–5 KB pentru rezumat. Fișierele
  sunt cerute separat; nu sunt importate în interfață.
- Nu se schimbă URL-uri, hreflang, sitemaps, schema sau noindex intenționat.

Corecție importantă față de descrierea anterioară de paving: UI-ul activ folosește
un preview foto/2D, cu trei formate, modele compatibile, rotație, culori, borduri și
dimensiuni. Nu expune casa sau numărul de piese montate. Builderul nativ importat
în repository are aceste funcții, dar nu este montat de UI-ul actual. Textele
separă explicit cele două experiențe; nu s-a adăugat o funcție pentru a justifica
o descriere greșită.

## 2. Exemplu tehnic roof pe pagina existentă

RO/EN/DE: `/configurators/roof#roof-technical-example` pe domeniul propriu.
Homepage trimite către această secțiune, fără o pagină nouă sau încă un renderer.

Intrare: două ape, lungime 10 m, adâncime 7 m, perete 3 m, pantă 30°, streașină
0,4 m, învelitoare metalică generică. Valorile sunt date de test, nu proiectare
recomandată. `roof-example-data.json` este verificat în teste cu funcțiile native
`buildRoofModel`, `calculateBom` și `bomToCsv`, fără modificarea lor.

Rezultate: amprentă 70 m², suprafață înclinată 97,27 m², coamă 10,8 m,
streșini 21,6 m, 218 panouri, 30 piese de coamă și 8 piese de jgheab.
Ipotezele demo sunt vizibile: 0,47 m² utili/panou, rezervă 5%, 0,37 m utili/piesă
de coamă și jgheab de 3 m. Catalogul și necesarul de producție necesită validare.

Flux public: produs → reguli → cantități → CSV → evaluarea legăturii ERP/CRM →
solicitare comercială. CSV este o ieșire existentă; integrarea ERP/CRM este o
posibilitate de analizat, nu o integrare live demonstrată. Nu publicăm tarifele
demo drept prețuri de furnizor. Linkul spre aplicație nu transferă automat inputul;
instrucțiunile explică reproducerea manuală.

Am corectat și afirmația adiacentă despre uploadul roof: referințele PDF/imagine/
DWG/DXF nu produc automat geometrie sau BOM. Modul personalizat are limite de
prototip și cere evaluare separată.

Decizie editorială: titlul „De la acoperișul configurat la lista de materiale”
arată o ieșire verificabilă. Nu am folosit „Cum ofertează producătorii” (ar inventa
un proces de client) sau un titlu generic despre software. Styling-ul reutilizează
secțiunea implementation-evidence, tokenurile și CTA-urile existente.

## 3. Baseline AI repetabil

Registru public: `ai-search-prompts-2026-10-14.json`, zece întrebări comerciale
RO/EN/DE fără brand, despre furnizori, roof, cost și adaptarea unui catalog.
Pilotul inițial rulează numai ro-01/en-01/de-01, câte trei conversații noi per motor
(ChatGPT cu web și Perplexity Search). Celelalte șapte întrebări sunt nemăsurate,
nu rezultate zero. Nu generalizăm pilotul la toate intențiile sau piața totală.

Pilotul a fost finalizat: 18 răspunsuri complete în conversații noi, la 14 octombrie,
înainte de publicarea PR #565. Inventarul și clasificările sunt în fișierul privat
`website/outputs/ai-search-baseline-2026-10-14.json`. Rezultatele Perplexity EN cu
advanced-preview și Search Free se păstrează separat; modelul exact și țara de
retrieval nu sunt cunoscute. Nu s-au rulat Google AI/Gemini în acest pilot.

ChatGPT: Temporary + Unpersonalized, fără memorie/plugins/instrucțiuni personalizate
în conversația verificată, Think off. Perplexity: Incognito + Search, Free; condiția
advanced-preview se notează separat dacă apare. Țara efectivă de retrieval și
versiunea exactă de model sunt necunoscute când interfața nu le afișează.

Notăm separat mențiune, link către domeniul nostru, citare verificată ca sursă,
recomandare explicită și corectitudinea descrierii. Un link nu dovedește automat
citare; un răspuns incomplet sau personalizat nu intră în denominator. Primele
încercări personalizate/neconfirmate sunt excluse, chiar dacă au arătat brandul.
Capturile, URL-urile conversațiilor și observațiile rămân în outputs ignorat de Git.

Acesta este baseline înainte de indexarea noului lot, nu efectul lui. Rezultatele
au n mic, depind de motor/limbă și nu reprezintă contacte. La 28 octombrie repetăm
aceleași întrebări/condiții, apoi reconciliem separat referral-uri AI și contacte
calificate din sursele private. GSC beta AI nu măsoară toate citările ChatGPT.

[Google: AI optimization](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide):
conținutul accesibil și util rămâne prioritar; fișierele speciale nu garantează
ranking, citări sau recomandări. Verificarea Frase este diagnostic de acces,
nu benchmark de venit; nu schimbăm politica robots pentru a obține un scor.

Frase, înainte de lot: 84/100, 5/8 checks, EN homepage. Confirmă acces HTML,
sitemap, schema și fișierele llms; semnalează lipsa variantelor Markdown per-pagină.
Live robots.txt permite generic `User-agent: *` / `Allow: /`; scorul pentru lipsa
unei politici AI explicite nu dovedește blocarea crawlerelor. Nu adăugăm protocoale
suplimentare, markup redundant sau permisiuni noi doar pentru scor. Nu există
rezultat „după” până când lotul nu este publicat.

## Verificări și revenire

- Release static: 45 pagini exportate, 36 teste postlaunch trecute și validator
  source-app pe 53 fișiere HTML. Testul native-roof-loader este numai pentru Node,
  nu intră în runtime; rezolvă dependența Three din pachetul website pentru CI.
- Componenta nouă este server-rendered; fără motor nativ în bundle-ul acestei
  secțiuni, fără dependențe noi, imagini, animații sau cereri third-party.
- Verificare desktop 1280 px și mobil 390 px: secțiune lizibilă, tabel pe două
  coloane fără overflow, CTA către contact și aplicație. Nu se testează prin
  trimiterea unui formular sau apel nou.
- Testele deterministe nu sunt dovadă de lipsă absolută a impactului asupra
  performanței. Se păstrează livrarea gzip/cache și baseline-ul mobil al lotului
  anterior; scorurile vechi nu se raportează ca rezultate ale acestui lot.
- Revenire: revert al commitului acestui lot și redeploy prin CI; nu resetăm main
  și nu atingem formularele sau aplicațiile complete. Serverele locale se opresc.

Programarea lunară existentă începe la 28 octombrie, 10:00, ora României. Acest lot
nu creează o recurență duplicată și nu autorizează publicare automată la review.
