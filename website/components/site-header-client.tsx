"use client";

import { useEffect } from "react";
import { ThemeToggle } from "../app/theme-toggle";
import type { Configurator } from "../lib/configurators";
import { internalPath, localeNativeNames, locales, localizedPath, localizedUrl, type Locale, uiCopy } from "../lib/i18n";

// currentPath is the public path on the current locale's domain; each language link
// points to the same page under that language's own slugs.
function languagePath(locale: Locale, current: Locale, currentPath: string) {
  return localizedUrl(locale, internalPath(current, currentPath || "/"));
}

const bookDemoLabels: Record<Locale, string> = {
  en: "Book a demo",
  ro: "Rezervă un demo",
  de: "Demo buchen",
  es: "Reservar una demo",
  fr: "Réserver une démo",
  it: "Prenota una demo",
};

function bookDemoLabel(locale: Locale) {
  return bookDemoLabels[locale];
}

const liteNotices: Record<Locale, string> = {
  en: "These are simplified previews. Open the full configurators to explore all features.",
  ro: "Acestea sunt previzualizări simplificate. Deschide configuratoarele complete pentru toate funcțiile.",
  de: "Dies sind vereinfachte Vorschauen. Alle Funktionen finden Sie in den vollständigen Konfiguratoren.",
  es: "Estas son vistas previas simplificadas. Abra los configuradores completos para ver todas las funciones.",
  fr: "Ce sont des aperçus simplifiés. Ouvrez les configurateurs complets pour découvrir toutes les fonctions.",
  it: "Queste sono anteprime semplificate. Apra i configuratori completi per scoprire tutte le funzioni.",
};

// Per-locale menu label overrides; products without an entry use their localized title.
const configuratorNavOverrides: Record<Locale, Partial<Record<string, string>>> = {
  en: {},
  ro: { solar: "Configurație panouri fotovoltaice" },
  de: {},
  es: {},
  fr: {},
  it: {},
};

const menuLabels: Record<Locale, string> = { en: "Menu", ro: "Meniu", de: "Menü", es: "Menú", fr: "Menu", it: "Menu" };
const homeLabels: Record<Locale, string> = {
  en: "360Configurator home", ro: "Pagina principală 360Configurator", de: "360Configurator Startseite", es: "Inicio de 360Configurator", fr: "Accueil 360Configurator", it: "Home page di 360Configurator",
};
const primaryNavLabels: Record<Locale, string> = {
  en: "Primary navigation", ro: "Navigare principală", de: "Hauptnavigation", es: "Navegación principal", fr: "Navigation principale", it: "Navigazione principale",
};

function LanguageLinks({ locale, currentPath }: { locale: Locale; currentPath: string }) {
  return <>{locales.map((language) => <a key={language} className={language === locale ? "active" : ""} href={languagePath(language, locale, currentPath)} lang={language} hrefLang={language} title={localeNativeNames[language]} aria-label={localeNativeNames[language]}>{language.toUpperCase()}</a>)}</>;
}

export function SiteHeaderClient({ locale, currentPath, configurators }: { locale: Locale; currentPath: string; configurators: Pick<Configurator, "slug" | "index" | "category" | "title" | "shortTitle" | "launchUrl">[] }) {
  const copy = uiCopy[locale];
  const notice = liteNotices[locale];
  const currentProduct = configurators.find(item => internalPath(locale, currentPath).endsWith(`/configurators/${item.slug}`));
  const configuratorNavLabel = (slug: string, fallback: string) =>
    configuratorNavOverrides[locale][slug] ?? fallback;
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
        <a className="brand-lockup" href={localizedPath(locale)} aria-label={homeLabels[locale]}>
          {/* The supplied transparent wordmark is already optimized and must retain its exact proportions. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/360configurator.png" alt="360Configurator" width={380} height={190} />
        </a>
        <nav className="desktop-nav" aria-label={primaryNavLabels[locale]}>
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
            <LanguageLinks locale={locale} currentPath={currentPath} />
          </div>
          <ThemeToggle locale={locale} />
          <a className="header-contact" href={localizedPath(locale, "/book-a-demo")}>
            {bookDemoLabel(locale)} <span>↗</span>
          </a>
          <details className="mobile-navigation">
            <summary>{menuLabels[locale]}</summary>
            <div data-lenis-prevent onWheel={event => event.stopPropagation()}>
              <div className="mobile-language-switcher" aria-label={copy.language}>
                <LanguageLinks locale={locale} currentPath={currentPath} />
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
