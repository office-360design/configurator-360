"use client";

import { useEffect } from "react";
import { ThemeToggle } from "../app/theme-toggle";
import type { Configurator } from "../lib/configurators";
import { localizedPath, localizedUrl, type Locale, uiCopy } from "../lib/i18n";

function languagePath(locale: Locale, currentPath: string) {
  return localizedUrl(locale, currentPath || "/");
}

function bookDemoLabel(locale: Locale) {
  if (locale === "ro") return "Rezervă un demo";
  if (locale === "de") return "Demo buchen";
  return "Book a demo";
}

export function SiteHeaderClient({ locale, currentPath, configurators }: { locale: Locale; currentPath: string; configurators: Pick<Configurator, "slug" | "index" | "category" | "title" | "shortTitle" | "launchUrl">[] }) {
  const copy = uiCopy[locale];
  const notice = locale === "ro" ? "Acestea sunt previzualizări simplificate. Deschide configuratoarele complete pentru toate funcțiile." : locale === "de" ? "Dies sind vereinfachte Vorschauen. Alle Funktionen finden Sie in den vollständigen Konfiguratoren." : "These are simplified previews. Open the full configurators to explore all features.";
  const currentProduct = configurators.find(item => currentPath.endsWith(`/configurators/${item.slug}`));
  const configuratorNavLabel = (slug: string, fallback: string) =>
    locale === "ro" && slug === "solar" ? "Configurație panouri fotovoltaice" : fallback;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;
    let previousY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const nextY = window.scrollY;
      const delta = nextY - previousY;
      if (nextY < 72 || delta < -4) header.classList.remove("is-hidden");
      if (nextY > 120 && delta > 4) header.classList.add("is-hidden");
      previousY = nextY;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header className="site-header">
      <div className="header-inner page-frame">
        {/* Native navigation avoids vinext's client-side cross-route hash failure. */}
        <a className="brand-lockup" href={localizedPath(locale)} aria-label="360Configurator home">
          {/* The supplied transparent wordmark is already optimized and must retain its exact proportions. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/360configurator.png" alt="360Configurator" width={380} height={190} />
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {/* Native anchors intentionally bypass vinext's broken cross-route hash navigation. */}
          <a href={localizedPath(locale)}>{copy.home}</a>
          <div className="nav-configurators">
            <a className="nav-configurators-trigger" href={`${localizedPath(locale)}#configurators`}>{copy.configurators} <span>＋</span></a>
            <div className="configurator-menu" data-lenis-prevent onWheel={event => event.stopPropagation()}>
              {configurators.map((item) => (
                <div className="configurator-menu-row" key={item.slug}>
                  <a
                    className="configurator-menu-case"
                    href={localizedPath(locale, `/configurators/${item.slug}`)}
                    style={{ display: "flex", alignItems: "center", gap: "12px" }}
                  >
                    <span>{item.index} /</span>
                    <strong>{configuratorNavLabel(item.slug, item.title)}</strong>
                  </a>
                  <a className="configurator-menu-launch" href={item.launchUrl} target="_blank" rel="noreferrer" aria-label={`${copy.launch}: ${configuratorNavLabel(item.slug, item.title)}`}>{copy.live} ↗</a>
                </div>
              ))}
              <p>{copy.more}</p>
            </div>
          </div>
          <a href={localizedPath(locale, "/pricing")}>{copy.pricing}</a>
          <a href={localizedPath(locale, "/about")}>{copy.about}</a>
        </nav>
        <div className="header-actions">
          <div className="language-switcher" aria-label={copy.language}>
            {(["en", "ro", "de"] as Locale[]).map((language) => <a key={language} className={language === locale ? "active" : ""} href={languagePath(language, currentPath)} lang={language}>{language.toUpperCase()}</a>)}
          </div>
          <ThemeToggle />
          <a className="header-contact" href={localizedPath(locale, "/book-a-demo")}>
            {bookDemoLabel(locale)} <span>↗</span>
          </a>
          <details className="mobile-navigation">
            <summary>Menu</summary>
            <div data-lenis-prevent onWheel={event => event.stopPropagation()}>
              <div className="mobile-language-switcher" aria-label={copy.language}>
                {(["en", "ro", "de"] as Locale[]).map((language) => <a key={language} className={language === locale ? "active" : ""} href={languagePath(language, currentPath)} lang={language}>{language.toUpperCase()}</a>)}
              </div>
              {/* Native anchors intentionally bypass vinext's broken cross-route hash navigation. */}
              <a href={localizedPath(locale)}>{copy.home}</a>
              <a href={`${localizedPath(locale)}#configurators`}>{copy.configurators}</a>
              {configurators.map((item) => <a key={item.slug} href={localizedPath(locale, `/configurators/${item.slug}`)}>{configuratorNavLabel(item.slug, item.shortTitle)}<span>→</span></a>)}
              <a href={localizedPath(locale, "/pricing")}>{copy.pricing}<span>→</span></a>
              <a href={localizedPath(locale, "/about")}>{copy.about}</a>
              <a href={localizedPath(locale, "/book-a-demo")}>{bookDemoLabel(locale)}<span>→</span></a>
              <a href={localizedPath(locale, "/contact")}>{copy.contact}</a>
            </div>
          </details>
        </div>
      </div>
      <div className="lite-notice"><span>LITE</span><a href={currentProduct?.launchUrl || `${localizedPath(locale)}#configurators`} target={currentProduct ? "_blank" : undefined} rel={currentProduct ? "noreferrer" : undefined}>{notice}<span aria-hidden="true"> ↗</span></a></div>
    </header>
  );
}
