import { getLocalizedConfigurators } from "../lib/configurators-localized";
import { contactEmail, localizedPath, type Locale, uiCopy } from "../lib/i18n";
import { SOCIAL_PROFILES } from "../lib/seo";

export function SiteFooter({ locale = "en" }: { locale?: Locale }) {
  const copy = uiCopy[locale];
  const configurators = getLocalizedConfigurators(locale);
  const email = contactEmail(locale);
  return (
    <footer className="site-footer">
      <div className="footer-main page-frame">
        <div className="footer-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/360configurator.png" alt="360Configurator" width={380} height={190} />
          <p>{copy.footerLine}</p>
        </div>
        <div className="footer-links">
          <span>{copy.configurators}</span>
          {configurators.map((item) => (
            <a key={item.slug} href={localizedPath(locale, `/configurators/${item.slug}`)}>{item.shortTitle}</a>
          ))}
        </div>
        <div className="footer-links">
          <span>{copy.contactLabel}</span>
          <a href={localizedPath(locale, "/about")}>{copy.about}</a>
          <a href={localizedPath(locale, "/contact")}>{copy.contact}</a>
          <a href={`mailto:${email}`}>{email}</a>
          <div className="footer-socials" aria-label="360Configurator social media">
            <a className="social-facebook" href={SOCIAL_PROFILES[0]} target="_blank" rel="noreferrer" aria-label="360Configurator on Facebook">
              <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Facebook</title><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" /></svg>
            </a>
            <a className="social-x" href={SOCIAL_PROFILES[1]} target="_blank" rel="noreferrer" aria-label="360Configurator on X">
              <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>X</title><path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" /></svg>
            </a>
            <a className="social-linkedin" href={SOCIAL_PROFILES[2]} target="_blank" rel="noreferrer" aria-label="360Configurator on LinkedIn">
              <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>LinkedIn</title><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" /></svg>
            </a>
          </div>
        </div>
        <a className="footer-orbit" href={localizedPath(locale, "/contact")}>
          <span>{copy.begin}</span><b>↗</b>
        </a>
      </div>
      <div className="footer-bottom page-frame">
        <span>© 2026 360Configurator</span><span>{copy.location}</span><span>{copy.render}</span>
      </div>
    </footer>
  );
}
