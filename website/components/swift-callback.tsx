'use client';

import { useEffect, useRef, useState } from 'react';
import { trackWebsiteEvent } from '../lib/website-analytics.js';
import { contactPhone, type Locale } from '../lib/i18n';
import { consentCopy } from '../lib/consent-copy';
import { CONSENT_EVENTS, hasWebsiteConsent, openCookiePreferences } from '../lib/site-consent';
import { installCallbackTranslations } from '../lib/swift-callback-locales';

const SCRIPT_URL = 'https://cdn.swiftcallback.com/scb.js?key=RtWCjzUgCRz6v8UBCNKzc1MhWMHqOePBX';

export function SwiftCallback({ locale }: { locale: Locale }) {
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const requested = useRef(false);
  const launch = useRef<() => void>(() => {});
  const text = consentCopy[locale];

  useEffect(() => {
    let script: HTMLScriptElement | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let restoreTranslations: (() => void) | undefined;
    let observer: MutationObserver | undefined;
    let executed = false;
    const clearWaiting = () => { if (timer) clearTimeout(timer); observer?.disconnect(); };
    const failed = () => { clearWaiting(); requested.current = false; setState('failed'); };
    const open = () => {
      if (!requested.current || !hasWebsiteConsent('preferences')) return;
      const button = document.querySelector<HTMLElement>('.swift-widget-button_wrapper .swift-widget-button');
      if (!button) return;
      clearWaiting();
      requested.current = false;
      setState('idle');
      button.click();
      trackWebsiteEvent('contact_intent', { method: 'callback' });
    };
    const load = () => {
      if (!hasWebsiteConsent('preferences')) return;
      if (script) { open(); return; }
      setState('loading');
      restoreTranslations = installCallbackTranslations(locale);
      observer = new MutationObserver(open);
      observer.observe(document.body, { childList: true, subtree: true });
      script = document.createElement('script');
      // Native ro/en; the dictionary adapter provides de/es/fr/it before mount.
      script.src = `${SCRIPT_URL}&lang=${locale === 'ro' ? 'ro' : 'en'}`;
      script.async = true; script.charset = 'UTF-8';
      script.dataset.swiftCallback = 'true';
      // An in-flight vendor response cannot be reliably cancelled by removing its tag.
      executed = true;
      script.addEventListener('load', open);
      script.addEventListener('error', failed);
      document.head.appendChild(script);
      timer = setTimeout(failed, 15000);
    };
    const sync = () => {
      if (!hasWebsiteConsent('preferences')) {
        requested.current = false;
        if (executed) {
          // Same withdrawal behavior as 360design: persist consent, then reload
          // to stop an executed vendor's sockets/timers. Analytics alone never reloads.
          window.location.reload();
        }
      } else if (requested.current) load();
    };
    const closed = () => { if (!hasWebsiteConsent('preferences')) requested.current = false; };
    window.addEventListener('360:consent-modal-closed', closed);
    launch.current = load;
    CONSENT_EVENTS.forEach(event => window.addEventListener(event, sync));
    return () => {
      clearWaiting();
      window.removeEventListener('360:consent-modal-closed', closed);
      restoreTranslations?.();
      CONSENT_EVENTS.forEach(event => window.removeEventListener(event, sync));
      script?.removeEventListener('load', open);
      script?.removeEventListener('error', failed);
      launch.current = () => {};
    };
  }, [locale]);

  return <div className="callback-launcher" data-nosnippet>
    {state === 'failed'
      ? <a className="callback-button" href={`tel:${contactPhone.international}`}><PhoneIcon /><span>{text.call}</span></a>
      : <button type="button" className="callback-button" aria-label={text.callbackLabel} aria-busy={state === 'loading'} disabled={state === 'loading'} onClick={() => {
        requested.current = true;
        if (hasWebsiteConsent('preferences')) launch.current();
        else openCookiePreferences();
      }}><PhoneIcon /><span>{state === 'loading' ? text.loading : text.request}</span></button>}
  </div>;
}

function PhoneIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.5 2.1L9 11a16 16 0 0 0 4 4l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z" /></svg>;
}
