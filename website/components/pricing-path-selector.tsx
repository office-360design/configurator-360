"use client";

import { useState } from "react";
import { localizedPath, type Locale } from "../lib/i18n";
import { pricingCopy } from "../lib/pricing-copy";
import { pricingFaceDescriptions } from "../lib/pricing-face-descriptions";
import { PricingSolid } from "./pricing-solid";

export function PricingPathSelector({ locale }: { locale: Locale }) {
  const copy = pricingCopy[locale];
  const [active, setActive] = useState(0);
  const path = copy.paths[active];
  return <div className="deployment-selector">
    <div className="deployment-tabs" role="tablist" aria-label={copy.selectorLabel}>
      {copy.paths.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={active === index} aria-controls={`deployment-panel-${item.id}`} id={`deployment-tab-${item.id}`} onClick={() => setActive(index)}>
        <span>{item.index}</span><strong>{item.name}</strong><small>{item.model}</small>
      </button>)}
    </div>
    <article className="deployment-panel" role="tabpanel" id={`deployment-panel-${path.id}`} aria-labelledby={`deployment-tab-${path.id}`}>
      <div className="deployment-panel-heading"><div><span className="mono-label">PATH / {path.index}</span><h2>{path.name}</h2><p>{path.summary}</p></div><div className="deployment-model"><span>{copy.selectorLabel}</span><strong>{path.model}</strong></div></div>
      <div className="deployment-spec"><div className="deployment-fit"><p>{path.fit}</p><PricingSolid key={path.id} shape="d10" items={path.items} descriptions={pricingFaceDescriptions(locale, "path", path.items, path.id)} description={path.summary} label={`${path.name} implementation features`}/></div><ol>{path.items.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol></div>
      <a className="deployment-action" href={`${localizedPath(locale, "/contact")}?project=${path.id}`}>{copy.cta.action}<span>↗</span></a>
    </article>
  </div>;
}
