'use client';

import { useEffect, useState } from 'react';
import { consentCopy } from '../lib/consent-copy';
import type { Locale } from '../lib/i18n';
import { initializeWebsiteConsent, listenForLegacyConsent, openCookiePreferences } from '../lib/site-consent';

export function CookiePreferencesButton({ locale }: { locale: Locale }) {
  return <button type="button" className="cookie-preferences-link" onClick={openCookiePreferences}>{consentCopy[locale].footer}</button>;
}

export function CookiePreferences({ locale }: { locale: Locale }) {
  const [failed, setFailed] = useState(false);
  const text = consentCopy[locale];
  useEffect(() => {
    const unavailable = () => setFailed(true);
    const ready = () => setFailed(false);
    window.addEventListener('360:consent-unavailable', unavailable);
    window.addEventListener('360:consent-ready', ready);
    window.addEventListener('storage', listenForLegacyConsent);
    void initializeWebsiteConsent(locale).catch(unavailable);
    return () => {
      window.removeEventListener('360:consent-unavailable', unavailable);
      window.removeEventListener('360:consent-ready', ready);
      window.removeEventListener('storage', listenForLegacyConsent);
    };
  }, [locale]);
  // This marker also carries the server-rendered page language on local previews.
  return <div data-cookie-locale={locale} data-nosnippet>
    {failed && <aside className="cookie-preferences-error" role="status" data-lenis-prevent>
      <p>{text.unavailable}</p>
      <button type="button" onClick={() => { setFailed(false); void initializeWebsiteConsent(locale).catch(() => setFailed(true)); }}>{text.retry}</button>
    </aside>}
  </div>;
}
