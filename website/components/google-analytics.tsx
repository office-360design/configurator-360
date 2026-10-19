"use client";

import { useEffect } from "react";
import { GA_ID, PUBLIC_DOMAINS, browserStorage, isInternalVisit, analyticsContext, trackWebsiteEvent, previewEvent, isProductPagePath } from "../lib/website-analytics.js";
import { configuratorPublicPaths, internalPath, localeFromHostname } from "../lib/i18n";
import { CONSENT_EVENTS, hasWebsiteConsent } from "../lib/site-consent";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;
function initializeAnalytics() {
  if (!hasWebsiteConsent('statistics') || isInternalVisit(window.location, browserStorage())) return;
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
  window.gtag('config', GA_ID, {...analyticsContext(window.location), allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 180 * 24 * 60 * 60, cookie_update: false});
  const script = document.createElement('script');
  script.id = 'google-analytics'; script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
  window.dispatchEvent(new Event('analytics-consent-granted'));
}

export function GoogleAnalytics() {
  useEffect(() => {
    const syncConsent = () => {
      if (hasWebsiteConsent('statistics')) initializeAnalytics();
      else withdrawAnalytics();
    };
    CONSENT_EVENTS.forEach(event => window.addEventListener(event, syncConsent));
    syncConsent();
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
      // Page links use each domain's own slugs; compare their internal route.
      const route = internalPath(localeFromHostname(url.hostname), url.pathname).replace(/\/$/, '');
      if (product) trackWebsiteEvent('full_configurator_open', {product, placement: isProductPagePath(window.location.pathname) ? 'product_page' : 'homepage'});
      else if (route === '/book-a-demo') trackWebsiteEvent('demo_request_open');
      else if (route === '/contact') trackWebsiteEvent('contact_intent', {method: 'contact_page'});
    };
    document.addEventListener('click', click);
    return () => {
      CONSENT_EVENTS.forEach(event => window.removeEventListener(event, syncConsent));
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

// Only analytics is stopped here; withdrawing it never reloads or loses form input.
function withdrawAnalytics() {
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true;
  if (!initialized) return;
  window.gtag?.('consent', 'update', {analytics_storage: 'denied'});
  const hostname = window.location.hostname;
  const baseDomain = hostname.replace(/^www\./, '');
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0].trim();
    if (!/^_ga(?:_|$)/.test(name)) continue;
    for (const domain of ['', hostname, baseDomain]) {
      document.cookie = `${name}=; Max-Age=0; path=/;${domain ? ` domain=${domain};` : ''} SameSite=Lax`;
    }
  }
}
