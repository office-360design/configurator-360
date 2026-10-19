import type { CookieConsentConfig } from 'vanilla-cookieconsent';
import { contactEmail, localizedPath, type Locale } from './i18n';
import { consentCopy } from './consent-copy';

export const COOKIE_NAME = '360configurator_consent';
export const CONSENT_REVISION = 1;

export function createConsentConfig(locale: Locale, notify: () => void): CookieConsentConfig {
  const text = consentCopy[locale];
  const headers = { name: text.name, purpose: text.purpose, duration: text.duration };
  return {
    mode: 'opt-in', revision: CONSENT_REVISION, manageScriptTags: false,
    disablePageInteraction: false, hideFromBots: false,
    // No hard-coded .com domain: each language domain owns its own decision.
    cookie: { name: COOKIE_NAME, expiresAfterDays: 180, path: '/', sameSite: 'Lax', secure: true },
    guiOptions: {
      consentModal: { layout: 'box wide', position: 'bottom left', equalWeightButtons: true },
      preferencesModal: { layout: 'box', equalWeightButtons: true },
    },
    onConsent: notify, onChange: notify,
    onModalHide: () => window.dispatchEvent(new Event('360:consent-modal-closed')),
    onModalReady: ({ modal }) => { modal.setAttribute('data-nosnippet', ''); modal.setAttribute('data-lenis-prevent', ''); modal.setAttribute('lang', locale); },
    categories: {
      necessary: { enabled: true, readOnly: true },
      preferences: { enabled: false, autoClear: { cookies: [{ name: /^scb_/ }] } },
      statistics: { enabled: false, autoClear: { cookies: [{ name: /^_ga/ }] } },
    },
    language: { default: locale, translations: { [locale]: {
      consentModal: {
        title: text.title, description: text.body,
        acceptAllBtn: text.accept, acceptNecessaryBtn: text.reject, showPreferencesBtn: text.settings,
        revisionMessage: text.revision,
        footer: `<a href="${localizedPath(locale, '/contact')}">${text.contactLink}</a>`,
      },
      preferencesModal: {
        title: text.preferences, acceptAllBtn: text.accept, acceptNecessaryBtn: text.reject,
        savePreferencesBtn: text.save, closeIconLabel: text.close,
        sections: [
          { description: text.intro },
          { title: text.necessary, linkedCategory: 'necessary', description: text.necessaryBody,
            cookieTable: { headers, body: [{ name: COOKIE_NAME, purpose: text.choicePurpose, duration: text.days }] } },
          { title: text.callback, linkedCategory: 'preferences', description: text.callbackBody,
            cookieTable: { headers, body: [{ name: 'scb_*', purpose: text.callbackPurpose, duration: text.providerDuration }] } },
          { title: text.statistics, linkedCategory: 'statistics', description: text.statisticsBody,
            cookieTable: { headers, body: [{ name: '_ga, _ga_*', purpose: text.analyticsPurpose, duration: text.days }] } },
          { title: text.contact, description: `<a href="mailto:${contactEmail(locale)}">${contactEmail(locale)}</a>` },
        ],
      },
    } } },
  };
}
