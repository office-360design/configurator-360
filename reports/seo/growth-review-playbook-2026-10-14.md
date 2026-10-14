# Growth review — 360Configurator

Data: 14 octombrie 2026. Playbook adaptat după documentul 360design, nu o copie a
infrastructurii, ID-urilor, serviciilor sau programărilor acelui site.

Starea de mai jos este baseline-ul lotului #563. Pentru administrarea GA4,
testul autorizat și lotul următor consultați
`growth-mobile-release-2026-10-14.md`; nu interpretați baseline-ul ca verificare live curentă.

## Rezultatul urmărit

Mai multe contacte umane distincte prin SwiftCallback și formulare, apoi mai multe
discuții potrivite și oportunități pentru implementarea configuratoarelor. Traficul,
clicurile, demonstrațiile interne și formularele automate nu sunt rezultat comercial.
Creșterea lună de lună este obiectivul, nu o garanție. La volum mic comparăm și 60/90
zile, numere absolute și motivele pierderilor; nu declarăm succes din două contacte.

Site-ul promovează software/configuratoare pentru produsele companiilor, nu vânzarea
directă a acoperișurilor, pergolelor sau pavajului. Această distincție este susținută de
copy-ul curent din `website/lib/i18n.ts`, `website/lib/pricing-copy.ts` și formulare.
O cerere pentru cumpărarea unui acoperiș poate fi umană, dar nepotrivită ofertei; nu
este automat bot. Intenția comercială trebuie validată înainte de a extinde conținutul.

## Context și stare verificate

- Domenii: www.360configurator.com (EN), www.360configurator.ro (RO),
  www.360konfigurator.de (DE). Păstrăm structura și proprietatea GA4 comună.
- ID-ul tagului website: G-2E433G5VM7. Nu se folosesc ID-uri 360design.
- PR #563 integrat în main, commit 12766ae9fd2932dc9cdd02fd551240be53de6186.
  Deployment Cloud Run finalizat cu succes la 14 octombrie.
- Cereri HTTPS normale pe toate cele trei domenii: homepage și pagina roof 200;
  canonical homepage către domeniul propriu; text HTML gzip și Vary: Accept-Encoding.
- Bundle-uri website cu hash: max-age=31536000, immutable. Bundle-uri peste pragul
  de compresie au gzip; runtime-ul de 694 bytes este intenționat sub prag.
- Fotografia lite de pavaj: 303.579 bytes pe toate domeniile, cache o zi,
  must-revalidate; originalul nativ nu este modificat.
- llms.txt RO/DE livrează text localizat și linkuri pe domeniul propriu. Clarificarea
  proiectului apare în HTML pe pagina roof în toate cele trei limbi.
- GA4 dimensiuni/key event și conversii procesate: încă de verificat/configurat;
  publicarea codului nu dovedește salvarea setărilor admin sau leaduri reale.
- PageSpeed API fără cheie a returnat 429 quota exceeded; nu folosim scorurile vechi
  ca rezultate ale release-ului. O nouă rulare în browser este consemnată separat.
- Nu s-a trimis formular real, nu s-a efectuat apel și nu s-a schimbat backend-ul.
  Nu există programare nouă activată de acest document.

## Skill-uri: alegerea metodei în funcție de problemă

Skill-urile `analytics`, `cro` și referința sa pentru formulare, `seo-audit`,
`ai-seo`, `content-strategy`, `copywriting`, `360-web-postlaunch`, `attribution`,
`ab-testing`, `customer-research` și `revops` sunt deja instalate. Nu duplicăm pachetele.

Am instalat suplimentar `marketing-loops` și `product-marketing` din
[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills),
commit c7d7dfb6b460fc376b4b2204b78a9c9fd5ca6467, după inspectarea instrucțiunilor.
Nu s-au executat scripturi din biblioteca descărcată. Skill-ul local
`360configurator-growth-review` stabilește contextul și selectează numai metodele
necesare; instalarea nu autorizează publicare, bugete sau acces suplimentar.

| Observație verificată | Metode | Reacție utilă |
|---|---|---|
| Formulare/apeluri nu se pot număra corect | analytics + attribution | Reconciliere livrare, consimțământ, evenimente și surse înainte de concluzii CRO |
| Vizite relevante, puține solicitări | cro + form reference + copywriting | Inspectarea mobilului, claritatea ofertei, pașii următori, CTA și erori; modificare exactă, nu redesign generic |
| Puțină cerere relevantă | seo-audit + content-strategy + ai-seo | Pagini utile pentru producători/integratori, exemple reale, întrebări comerciale și legături interne |
| Multe contacte umane nepotrivite | customer-research + revops | Separarea B2B software de cumpărători de produse fizice; ajustarea mesajului și calificării |
| Spam/bots confirmați | analytics + revops; engineering în scope autorizat | Diagnostic backend, honeypot/App Check/rate limit existente; protecții proporționale fără blocarea oamenilor |
| Intenție callback, puține apeluri conectate | revops + cro | Verificarea stărilor furnizorului, disponibilității și răspunsului echipei; nu atribuim automat pierderea website-ului |
| O ipoteză de schimbare | ab-testing | Calculul volumului necesar; la trafic mic, schimbări succesive documentate și cercetare, fără verdict cauzal |

`product-marketing` este util pentru un context comercial comun, care trebuie validat
de Max: oferta, piețele, clientul potrivit, dovezile și obiecțiile. Nu inventăm bugete,
contracte, testimoniale, rezultate sau personas pentru a completa un template.

## Sursa de adevăr pentru contacte

Echipa păstrează un registru privat simplu în sistemul deja folosit; nu construim CRM
automat. Pentru review sunt suficiente totaluri anonimizate și motive agregate.

- Formulare livrate: backend/recepție email. `generate_lead` cu consimțământ este
  semnal tehnic; nu garantează uman/calificat și nu acoperă refuzul Analytics.
- SwiftCallback: cerere acceptată, încercare, apel conectat, nereușit/nepreluat,
  numai dacă aceste stări sunt efectiv disponibile în cont/export/API.
- Clicurile callback/telefon/email sunt intenție, nu apel sau formular primit.
- Clasificare: test, duplicat, spam/bot confirmat, uman cu potrivire necunoscută,
  uman nepotrivit, uman potrivit, oportunitate; ulterior câștigat/pierdut.
- Deduplificăm formular + callback când echipa poate confirma aceeași solicitare;
  dacă nu, marcăm deduplicarea incompletă, nu inventăm identitatea.
- Notăm data, canalul, produsul/piața dacă sunt cunoscute, starea și timpul până la
  răspuns. Emailuri, telefoane, mesaje, înregistrări și ID-uri clienți rămân private;
  nu ajung în GA4, skill-uri, GitHub sau rapoarte publice.

În codul existent `firebase-share-backend/functions/index.js:1164`, submitContact
impune App Check, origin allowlist, rate limiting și honeypot; o captură honeypot
întoarce success=true, delivered=false fără email sau document de lead. Nu modificăm
aceste protecții și nu confundăm trecerea lor cu o clasificare umană garantată.

Integrarea SwiftCallback se bazează pe API/webhook documentat de furnizor, dacă
există și este inclus în cont; nu presupunem că este disponibil. Până atunci, totaluri
agregate din dashboard sau de la echipă. Nu interceptăm câmpurile private ale widgetului.

## Ritmul recomandat — neprogramat

1. După release: verificare imediată de funcționare, headers/cache/consimțământ și
   mobil; la aproximativ 48 h, evenimente procesate și discrepanțe de măsurare.
2. La 2–4 săptămâni: prima evaluare a funnel-ului și cererii după schimbare; prea
   puține contacte înseamnă rezultat neconcludent, nu succes/eșec demonstrat.
3. Lunar: analizăm ultima perioadă completă comparabilă cu precedenta, segmentat
   pe domeniu/limbă, țară, produs, sursă și dispozitiv; separăm brand/non-brand și
   vizitele interne. Alegem maximum 3 acțiuni cu justificare și responsabil.
4. Defect de contact, eroare de runtime sau noindex accidental: reacție imediată,
   fără a aștepta review-ul lunar. O scădere într-o zi sau un PSI izolat nu justifică
   singură un redesign sau rescriere SEO.

Nu pornim controale zilnice generale sau modificări automate. Dacă Max solicită
recurența, verificăm întâi automatizările existente ale acestui chat, apoi folosim
heartbeat-ul produsului; nu copiem programările 360design și nu creăm duplicate.
Notificările sunt pentru constatări/acțiuni relevante, nu pentru stare neschimbată.

## Cum închidem fiecare review cu acțiuni

Pentru fiecare prioritate salvăm: dovada și perioada/filtrele, pagina exactă,
ipoteza, schimbarea concretă, impactul presupus și încrederea, efortul, responsabilul,
metrica principală și sursa, baseline (sau necunoscut), data evaluării, guardrails și
criteriul păstrăm/ajustăm/revenim. Păstrăm screenshot/diff/release pentru trasabilitate.
Un înainte/după fără control este un semnal orientativ, nu dovadă cauzală.

Memorie: raport datat și registru de acțiuni în `reports/seo/`, fără date personale
sau metrici comerciale private în Git. Cheie de deduplicare: problemă + pagină +
release; o acțiune în curs nu se propune din nou ca nouă. Nu suprapunem experimente.
Înainte de acțiune verificăm procesarea, consimțământul, sezonul, demonstrațiile
interne și eșantionul. Acces lipsă: rezultat necunoscut, se cer agregate; nu se
înlocuiesc proprietățile. Eroare repetată: raportăm blocajul și continuăm celelalte surse.

La un review autorizat pentru analiză pregătim recomandări/drafturi. Implementarea,
publicarea, emailurile, apelurile, conturile, tool-urile plătite și schimbările de
confidențialitate necesită scope separat. Aprobarea release-ului #563 nu este mandat
nelimitat pentru release-uri viitoare. Dacă o recurență este creată ulterior, poate
fi oprită din Automations; nu rulează alte fluxuri de publicare ascunse.

## Ce urmează acum, în ordinea valorii

1. Finalizarea GA4 admin și o verificare de livrare etichetată, coordonată cu echipa.
   Fără formulare/apeluri de test neanunțate; confirmarea inboxului este distinctă
   de răspunsul API.
2. Agregate SwiftCallback și definiția unui contact valid, plus cine răspunde și
   ce interval de răspuns poate promite în mod realist echipa.
3. Profil mobil după release: LCP al titlului RO, fonturi/CSS critice, JS/CSS
   neutilizate și momentul pornirii rendererului/window hero/third-party. Păstrăm
   experiența 3D și designul; optimizăm cauza măsurată, nu eliminăm toate efectele.
4. Un exemplu real de implementare + date de produs/reguli/outputs și pașii către
   discuția comercială, dacă există material aprobat. Prioritatea RO roof și EN
   pergola/hall/roof din auditul anterior este provizorie: demonstrațiile interne
   nu dovedesc cerere independentă. Intenția B2B primează față de volum brut.
5. Mesaj comercial și obiecții în germană, după verificarea interogărilor și
   contactelor potrivite; nu generăm un blog masiv sau un pachet redundant de schema.

Pentru AI folosim conținut util, factual și accesibil. Nu garantăm citări și nu
tratăm llms.txt drept factor de ranking. [Google: AI features](https://developers.google.com/search/docs/appearance/ai-features).
Pentru performanță separăm TTFB, descoperirea/încărcarea resursei și întârzierea
randării. [Google: optimize LCP](https://web.dev/articles/optimize-lcp).
Datele GA4 pot fi reprocesate; nu confundăm realtime cu raport final.
[Google: data freshness](https://support.google.com/analytics/answer/12233314).

## Prima măsurare mobilă după publicare

[Homepage RO, raport PSI din 14 octombrie, 13:59](https://pagespeed.web.dev/analysis/https-www-360configurator-ro/x9arobebxu?form_factor=mobile):
Performance 89, Accessibility 90, Best Practices 96, SEO 100; FCP 2,3 s,
LCP 3,0 s, TBT 70 ms, CLS 0, Speed Index 4,4 s. O singură rulare de laborator,
Moto G Power emulat, slow 4G, Lighthouse 13.5.0; încă fără date CrUX suficiente.
Față de baseline-ul anterior RO 56/LCP 11,6 s este un semnal tehnic favorabil,
nu o estimare cauzală controlată și nu dovadă că au crescut solicitările.

Ce merită investigat în următorul lot autorizat:

- LCP este acum titlul h2 din hero-chapter, cu 2.320 ms render delay în breakdown.
  Profilăm momentul afișării textului și CSS/fonturi/inițializare, fără a elimina
  animația sau 3D din principiu. Valorile breakdown sunt din trace, nu însumate
  direct cu metrica simulată LCP de 3,0 s.
- PSI estimează 245 KiB JS și 115 KiB CSS neutilizate în această încărcare. Unele
  sunt necesare pentru interacțiuni ulterioare; izolăm pe pagină și moment, nu
  ștergem automat resursele semnalate.
- Din 390 KiB semnalate pentru cache, 352 KiB aparțin SwiftCallback; nu putem
  schimba cache-ul CDN-ului furnizorului din Nginx-ul nostru. Resursele proprii
  rămase sunt logo-ul PNG și un icon SVG window-runtime (aproximativ 37 KiB).
- Verificarea de accesibilitate raportează aria-label pe div fără rol corespunzător
  în scene-interactor/lite-canvas, contrast și ținte tactile. Se repară semantic
  și punctual, păstrând interacțiunile, după auditul elementelor exacte.
- Eroarea de browser este conexiunea WebSocket SwiftCallback către
  sw1socket.mdhtcdn.net, ERR_NAME_NOT_RESOLVED. Google DNS și Cloudflare DNS au
  rezolvat ulterior hostname-ul corect, deci nu declarăm indisponibilitate globală
  sau apeluri pierdute din această rulare. Verificăm reproducerea și statusurile
  furnizorului înainte de a modifica widgetul; nu efectuăm apel de test neanunțat.

SEO 100 și Agentic Browsing 2/3 sunt verificări de laborator, nu scoruri de ranking,
vizibilitate ChatGPT sau conversie. Următoarele rulări COM/DE se adaugă ca dovezi
datate, nu se extrapolează rezultatul RO la toate paginile.

Rulările suplimentare au fost finalizate:

| Homepage / rulare mobilă | Performance | LCP | TBT | CLS |
|---|---:|---:|---:|---:|
| [COM, 14:03](https://pagespeed.web.dev/analysis/https-www-360configurator-com/w9f38ndyoe?form_factor=mobile) | 90 | 2,9 s | 30 ms | 0,067 |
| [RO, 13:59](https://pagespeed.web.dev/analysis/https-www-360configurator-ro/x9arobebxu?form_factor=mobile) | 89 | 3,0 s | 70 ms | 0 |
| [DE, 14:03](https://pagespeed.web.dev/analysis/https-www-360konfigurator-de/pjucv7h35f?form_factor=mobile) | 72 | 5,2 s | 220 ms | 0 |
| [DE repetare, 14:05](https://pagespeed.web.dev/analysis/https-www-360konfigurator-de/bkr8i3prux?form_factor=mobile) | 73 | 3,0 s | 660 ms | 0 |

Toate trei: Accessibility 90, Best Practices 96, SEO 100, fără CrUX suficient.
Pe prima rulare DE, LCP este paragraful panoului Analytics (2.730 ms render delay
în trace), nu titlul principal. La repetare, LCP scade dar TBT crește; nu atribuim
diferența exclusiv limbii sau panoului. Lista long tasks din repetare include
bundle-urile proprii index/framework și pagina (1.460 ms însumate în audit), astfel
că profilarea inițializării/hidratării website-ului este prioritară. Nu am rulat teste
până am obținut un scor verde; aceste două rezultate se păstrează inclusiv cu variația.
Verificăm stări de consimțământ comparabile fără a ascunde sau simplifica acordul
doar pentru scor. Nu s-a implementat încă acest nou lot de optimizare.
