import { notFound } from "next/navigation";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { SmoothScroll } from "./smooth-scroll";
import { DeferredWebGLStage } from "./deferred-webgl-stage";
import { ShowcaseControls } from "./showcase-controls";
import { SceneInteractor } from "./scene-interactor";
import { CapabilityCube } from "./capability-cube";
import { WindowConfiguratorPreview } from "./window-preview";
import { getLocalizedConfigurator, getLocalizedConfigurators } from "../lib/configurators-localized";
import { detailCopy, localizedPath, type Locale, uiCopy } from "../lib/i18n";
import { absoluteUrl, breadcrumbSchema, graphSchema, organizationSchema, siteUrl, SITE_URL, websiteSchema } from "../lib/seo";

export function LocalizedConfiguratorPage({ locale, slug }: { locale: Locale; slug: string }) {
  const item = getLocalizedConfigurator(locale, slug);
  if (!item) notFound();
  const all = getLocalizedConfigurators(locale);
  const copy = detailCopy[locale];
  const ui = uiCopy[locale];
  const path = localizedPath(locale, `/configurators/${item.slug}`);
  const structuredData = graphSchema([
    organizationSchema(locale, item.seoDescription),
    websiteSchema(locale, item.seoDescription),
    {
      "@type": "WebPage",
      "@id": `${absoluteUrl(locale, `/configurators/${item.slug}`)}#webpage`,
      url: absoluteUrl(locale, `/configurators/${item.slug}`),
      name: item.seoTitle,
      description: item.seoDescription,
      inLanguage: locale,
      isPartOf: { "@id": `${siteUrl(locale)}/#website` },
      breadcrumb: { "@id": `${absoluteUrl(locale, `/configurators/${item.slug}`)}#breadcrumb` },
      mainEntity: { "@id": `${absoluteUrl(locale, `/configurators/${item.slug}`)}#application` },
    },
    {
      "@type": "WebApplication",
      "@id": `${absoluteUrl(locale, `/configurators/${item.slug}`)}#application`,
      name: item.title,
      url: absoluteUrl(locale, `/configurators/${item.slug}`),
      description: item.description,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "3D product configuration and visual CPQ",
      operatingSystem: "Any platform with a modern web browser",
      browserRequirements: "JavaScript and WebGL 2",
      inLanguage: locale,
      provider: { "@id": `${SITE_URL}/#organization` },
      featureList: item.features.map((feature) => feature.title),
    },
    breadcrumbSchema(locale, [
      { name: ui.home, path: "/" },
      { name: item.title, path: `/configurators/${item.slug}` },
    ]),
  ]);
  return <main className={`site-shell detail-page detail-${item.slug}`}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <SmoothScroll /><DeferredWebGLStage /><SiteHeader locale={locale} currentPath={path} />
    <section className="detail-hero" data-scene={item.slug}><div className="detail-hero-inner page-frame">
      <div className="detail-title"><span className="mono-label">{item.index} / {item.category}</span><h1>{item.seoH1}</h1><p>{item.statement}</p></div>
      <div className="detail-viewport">
        {item.slug === "window" ? <WindowConfiguratorPreview locale={locale} placement="detail" /> : <SceneInteractor scene={item.slug} locale={locale} />}
        <div className="viewport-brackets"><i/><i/><i/><i/></div><span className="viewport-status mono-label"><i/> {ui.preview}</span>
        {item.slug !== "window" && <ShowcaseControls scene={item.slug} controls={item.controls} locale={locale} />}
      </div>
      <div className="detail-action"><p>{item.description}</p><a className="launch-link" href={item.launchUrl} target="_blank" rel="noreferrer">{ui.launch} <span>↗</span></a></div>
    </div></section>
    <CapabilityCube detail locale={locale} />
    <section className="detail-intro solid-section"><div className="page-frame detail-intro-grid" data-reveal><span className="mono-label">{copy.overview}</span><h2>{item.statement}</h2><p>{item.description}</p></div></section>
    <section className="detail-features solid-section"><div className="page-frame"><div className="detail-section-heading"><span className="mono-label">{copy.capabilities}</span><h2>{copy.resolves}</h2></div><div className="detail-feature-grid">{item.features.map((feature,index)=><article key={feature.title} data-reveal><span>0{index+1}</span><h3>{feature.title}</h3><p>{feature.body}</p></article>)}</div></div></section>
    <section className="detail-outputs solid-section"><div className="page-frame outputs-grid" data-reveal><div><span className="mono-label">{copy.state}</span><h2>{copy.outputA}<br/>{copy.outputB}</h2></div><ol>{item.outputs.map((output,index)=><li key={output}><span>0{index+1}</span>{output}</li>)}</ol></div></section>
    <section className="detail-proof solid-section"><div className="page-frame proof-frame" data-reveal><span className="mono-label">{copy.deployment}</span><h2>{copy.exploreA}<br/>{copy.exploreB}</h2><a className="project-link" href={item.launchUrl} target="_blank" rel="noreferrer"><span>{copy.open}</span><b>↗</b></a></div></section>
    <nav className="next-configurator solid-section" aria-label={copy.continue}><div className="page-frame"><span className="mono-label">{copy.continue}</span>{all.filter(other=>other.slug!==item.slug).map(other=><a href={localizedPath(locale, `/configurators/${other.slug}`)} key={other.slug}><span>{other.index}</span>{other.title}<b>↗</b></a>)}</div></nav>
    <SiteFooter locale={locale} />
  </main>;
}
