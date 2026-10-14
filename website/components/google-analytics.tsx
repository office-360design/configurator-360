"use client";

import { useEffect, useState } from "react";
import { GA_ID, PUBLIC_DOMAINS, readChoice, setChoice, browserStorage, isInternalVisit, analyticsContext, trackWebsiteEvent, previewEvent } from "../lib/website-analytics.js";
import { configuratorPublicPaths } from "../lib/i18n";
import "../app/analytics-preferences.css";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const copy = {
  en: {title: "Website analytics", body: "May we use Google Analytics to understand visits and improve this website? Optional analytics are off until you agree. Contact forms and configurators work either way. Your choice applies to this domain.", accept: "Allow analytics", reject: "No analytics", settings: "Analytics preferences"},
  ro: {title: "Analiza utilizării site-ului", body: "Putem folosi Google Analytics pentru a înțelege vizitele și a îmbunătăți site-ul? Analiza opțională este oprită până accepți. Formularele și configuratoarele funcționează în ambele cazuri. Alegerea se aplică acestui domeniu.", accept: "Accept analiza", reject: "Fără analiză", settings: "Preferințe de analiză"},
  de: {title: "Website-Analyse", body: "Dürfen wir Google Analytics verwenden, um Besuche zu verstehen und diese Website zu verbessern? Die optionale Analyse bleibt bis zu Ihrer Zustimmung aus. Formulare und Konfiguratoren funktionieren in beiden Fällen. Ihre Wahl gilt für diese Domain.", accept: "Analyse erlauben", reject: "Ohne Analyse", settings: "Analyse-Einstellungen"},
};

let initialized = false;
function initializeAnalytics() {
  if (readChoice(browserStorage()) !== 'granted' || isInternalVisit(window.location, browserStorage())) return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = false;
  if (initialized) {
    window.gtag?.('consent', 'update', {analytics_storage: 'granted'});
    window.dispatchEvent(new Event('analytics-consent-granted'));
    return;
  }
  initialized = true;
  window.dataLayer = window.dataLayer || [];
  // Google's command queue uses Arguments objects, not an application event array.
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
  window.gtag('consent', 'update', {analytics_storage: 'granted'});
  window.gtag('set', 'linker', {domains: PUBLIC_DOMAINS});
  window.gtag('js', new Date());
  // Enhanced Measurement owns page_view, including History API navigation.
  // Do not send an additional manual SPA page_view here.
  window.gtag('config', GA_ID, {...analyticsContext(window.location), allow_google_signals: false});
  const script = document.createElement('script');
  script.id = 'google-analytics'; script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
  window.dispatchEvent(new Event('analytics-consent-granted'));
}

export function AnalyticsPreferencesButton({locale = 'en'}: {locale?: keyof typeof copy}) {
  return <button type="button" className="analytics-preferences-link" onClick={() => window.dispatchEvent(new Event('analytics-preferences-open'))}>{copy[locale].settings}</button>;
}

export function GoogleAnalytics() {
  useEffect(() => {
    const choice = readChoice(browserStorage());
    if (choice === 'granted') initializeAnalytics();
    const visibleProducts = new Set<string>();
    const views = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const product = entry.target.closest('[data-scene], [data-lite-product]')?.getAttribute('data-scene') || entry.target.closest('[data-lite-product]')?.getAttribute('data-lite-product');
        if (!product) continue;
        if (entry.isIntersecting) {visibleProducts.add(product); previewEvent('lite_preview_view', product);}
        else visibleProducts.delete(product);
      }
    }, {threshold: .25});
    document.querySelectorAll('[data-scene], [data-lite-product]').forEach(element => views.observe(element.querySelector('.detail-viewport, .showcase-viewport') || element));
    const granted = () => visibleProducts.forEach(product => previewEvent('lite_preview_view', product));
    window.addEventListener('analytics-consent-granted', granted);
    const gestures = new Map<string, number>();
    const gesture = (event: Event) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const surface = event.target.closest('.scene-controls, .scene-interactor');
      const product = surface?.closest('[data-scene]')?.getAttribute('data-scene');
      if (product) gestures.set(product, performance.now());
    };
    document.addEventListener('pointerdown', gesture, true);
    document.addEventListener('keydown', gesture, true);
    document.addEventListener('wheel', gesture, {capture: true, passive: true});
    const engaged = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.control === 'requestPrice') return;
      const product = detail?.scene;
      if (product && performance.now() - (gestures.get(product) ?? -Infinity) < 2000) previewEvent('lite_preview_engaged', product);
    };
    window.addEventListener('configurator-control', engaged);
    window.addEventListener('scene-orbit', engaged);
    const viewed = (event: Event) => previewEvent('lite_preview_view', (event as CustomEvent).detail?.scene);
    window.addEventListener('active-scene-change', viewed);
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest('a[href]');
      if (!link) return;
      const url = new URL(link.getAttribute('href') || '', window.location.href);
      if (url.protocol === 'mailto:' || url.protocol === 'tel:') {
        trackWebsiteEvent('contact_intent', {method: url.protocol === 'mailto:' ? 'email' : 'phone'}); return;
      }
      if (!PUBLIC_DOMAINS.includes(url.hostname)) return;
      const product = Object.values(configuratorPublicPaths).flatMap(paths => Object.entries(paths)).find(([, path]) => url.pathname === path || `${url.pathname}/` === path)?.[0];
      if (product) trackWebsiteEvent('full_configurator_open', {product, placement: window.location.pathname.includes('/configurators/') ? 'product_page' : 'homepage'});
      else if (url.pathname.replace(/\/$/, '') === '/book-a-demo') trackWebsiteEvent('demo_request_open');
      else if (url.pathname.replace(/\/$/, '') === '/contact') trackWebsiteEvent('contact_intent', {method: 'contact_page'});
    };
    document.addEventListener('click', click);
    return () => {
      views.disconnect();
      window.removeEventListener('analytics-consent-granted', granted);
      document.removeEventListener('pointerdown', gesture, true);
      document.removeEventListener('keydown', gesture, true);
      document.removeEventListener('wheel', gesture, true);
      window.removeEventListener('configurator-control', engaged);
      window.removeEventListener('scene-orbit', engaged);
      window.removeEventListener('active-scene-change', viewed);
      document.removeEventListener('click', click);
    };
  }, []);
  return null;
}

// Locale comes from the server-rendered page footer, not a post-hydration guess.
// Reading storage in the head hides a previously decided panel without a flash.
export function AnalyticsPreferences({locale = 'en'}: {locale?: keyof typeof copy}) {
  const [visible, setVisible] = useState(true);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(!readChoice(browserStorage())));
    const open = () => {setOpened(true);setVisible(true);};
    window.addEventListener('analytics-preferences-open', open);
    return () => {cancelAnimationFrame(frame);window.removeEventListener('analytics-preferences-open', open);};
  }, []);
  const choose = (value: 'granted' | 'denied') => {
    // Retain this explicit choice in memory if persistent storage is unavailable.
    setChoice(value);
    document.documentElement.dataset.analyticsChoice = value;
    if (value === 'granted') initializeAnalytics();
    else if (initialized) {
      (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true;
      window.gtag?.('consent', 'update', {analytics_storage: 'denied'});
      // Withdraw without reloading: preserve unsent form input and preview state.
      const baseDomain = window.location.hostname.replace(/^www\./, '');
      for (const name of ['_ga', '_ga_2E433G5VM7']) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
        document.cookie = `${name}=; Max-Age=0; path=/; domain=${baseDomain}`;
      }
    }
    setVisible(false);
  };
  if (!visible) return null;
  const text = copy[locale];
  return <section className="analytics-preferences" data-preferences-open={opened ? 'true' : undefined} aria-labelledby="analytics-preferences-title" data-lenis-prevent>
    <h2 id="analytics-preferences-title">{text.title}</h2><p>{text.body}</p>
    <div><button type="button" onClick={() => choose('denied')}>{text.reject}</button><button type="button" onClick={() => choose('granted')}>{text.accept}</button></div>
  </section>;
}
