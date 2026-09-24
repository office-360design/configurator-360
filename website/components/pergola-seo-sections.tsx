import { pergolaSeoContent } from "../lib/pergola-seo-content";
import { localizedPath, type Locale } from "../lib/i18n";

export function PergolaSeoSections({ locale, launchUrl }: { locale: Locale; launchUrl: string }) {
  const copy = pergolaSeoContent[locale];

  return <>
    <section className="pergola-search-intro solid-section" id="pergola-configurator-overview">
      <div className="page-frame pergola-search-intro-grid" data-reveal>
        <span className="mono-label">{copy.intro.label}</span>
        <div>
          <h2>{copy.intro.heading}</h2>
          <p>{copy.intro.body}</p>
          <div className="pergola-search-actions">
            <a className="launch-link" href={launchUrl} target="_blank" rel="noreferrer">{copy.intro.launch} <span>↗</span></a>
            <a className="text-link" href="#pergola-how-it-works">{copy.intro.learn} <span>↓</span></a>
          </div>
        </div>
      </div>
    </section>

    <section className="pergola-workflow solid-section" id="pergola-how-it-works">
      <div className="page-frame">
        <div className="pergola-section-heading" data-reveal>
          <span className="mono-label">{copy.workflow.label}</span>
          <div><h2>{copy.workflow.heading}</h2><p>{copy.workflow.intro}</p></div>
        </div>
        <ol className="pergola-workflow-list">
          {copy.workflow.steps.map((step, index) => <li key={step.title} data-reveal>
            <span className="pergola-step-index">0{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>)}
        </ol>
      </div>
    </section>

    <section className="pergola-decisions solid-section">
      <div className="page-frame">
        <div className="pergola-section-heading" data-reveal>
          <span className="mono-label">{copy.decisions.label}</span>
          <div><h2>{copy.decisions.heading}</h2><p>{copy.decisions.intro}</p></div>
        </div>
        <div className="pergola-decision-grid">
          {copy.decisions.groups.map((group, index) => <article key={group.title} data-reveal>
            <span className="pergola-step-index">0{index + 1}</span>
            <h3>{group.title}</h3>
            <p>{group.body}</p>
            <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>)}
        </div>
      </div>
    </section>

    <section className="pergola-outcomes solid-section">
      <div className="page-frame pergola-outcomes-grid" data-reveal>
        <div>
          <span className="mono-label">{copy.outcomes.label}</span>
          <h2>{copy.outcomes.heading}</h2>
          <p>{copy.outcomes.body}</p>
        </div>
        <div className="pergola-outcome-list">
          {copy.outcomes.items.map((item, index) => <article key={item.title}>
            <span className="pergola-step-index">0{index + 1}</span>
            <div><h3>{item.title}</h3><p>{item.body}</p></div>
          </article>)}
        </div>
      </div>
    </section>

    <section className="pergola-faq solid-section">
      <div className="page-frame pergola-faq-grid">
        <div className="pergola-faq-heading" data-reveal>
          <span className="mono-label">{copy.faq.label}</span>
          <h2>{copy.faq.heading}</h2>
        </div>
        <div className="pergola-faq-list">
          {copy.faq.items.map((item, index) => <details key={item.question} data-reveal>
            <summary><span>0{index + 1}</span><strong>{item.question}</strong><i>+</i></summary>
            <p>{item.answer}</p>
          </details>)}
        </div>
      </div>
    </section>

    <section className="pergola-seo-cta solid-section">
      <div className="page-frame pergola-seo-cta-inner" data-reveal>
        <span className="mono-label">{copy.finalCta.eyebrow}</span>
        <h2>{copy.finalCta.heading}</h2>
        <p>{copy.finalCta.body}</p>
        <div className="pergola-search-actions">
          <a className="launch-link" href={launchUrl} target="_blank" rel="noreferrer">{copy.finalCta.launch} <span>↗</span></a>
          <a className="text-link" href={localizedPath(locale, "/contact")}>{copy.finalCta.contact} <span>→</span></a>
        </div>
      </div>
    </section>
  </>;
}
