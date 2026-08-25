"use client";

import { useState } from "react";
import { PricingSolid } from "./pricing-solid";

export function PricingFaq({ label, title, faceIntro, items }: { label: string; title: string; faceIntro: string; items: readonly (readonly [string,string])[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const faceDescriptions = items.map(([question],index)=>`${faceIntro} ${String(index+1).padStart(2,"0")}: ${question}`);
  return <section className="pricing-faq"><div className="page-frame">
    <div className="pricing-wide-heading"><span className="mono-label">{label}</span><h2>{title}</h2></div>
    <div className="pricing-faq-grid">
      <div><PricingSolid shape="d20" items={items.map(item=>item[0])} descriptions={faceDescriptions} description={faceIntro} label={title} onSelect={setOpen}/></div>
      <div>{items.map(([question,answer],index)=><details key={question} open={open===index} onToggle={event=>{if(event.currentTarget.open)setOpen(index);else if(open===index)setOpen(null);}}><summary><span>{String(index+1).padStart(2,"0")}</span><strong>{question}</strong><i>＋</i></summary><p>{answer}</p></details>)}</div>
    </div>
  </div></section>;
}
