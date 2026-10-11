import { newProductCopy } from "../lib/new-configurators";
import type { LiteSlug } from "../lib/lite-products";
import type { Locale } from "../lib/i18n";

export function NewProductSeo({slug,locale}: {slug:LiteSlug;locale:Locale}) {
  const copy = newProductCopy[locale][slug];
  const labels = locale === 'ro' ? ['Întrebări frecvente','Despre previzualizare și configurator'] : locale === 'de' ? ['Häufige Fragen','Vorschau und vollständiger Konfigurator'] : ['Frequently asked questions','About the preview and full configurator'];
  return <section className="pergola-faq solid-section"><div className="page-frame pergola-faq-grid">
    <div className="pergola-faq-heading"><span className="mono-label">{labels[0]}</span><h2>{labels[1]}</h2></div>
    <div className="pergola-faq-list">{copy.questions.map(([question,answer],index)=><details key={question}><summary><span>0{index+1}</span><strong>{question}</strong><i>+</i></summary><p>{answer}</p></details>)}</div>
  </div></section>;
}
