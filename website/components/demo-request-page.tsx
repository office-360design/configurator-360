import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { DemoRequestForm } from "./demo-request-form";
import { localizedPath, type Locale } from "../lib/i18n";

const pageCopy: Record<Locale, { index: string; title: string; intro: string }> = {
  en: { index: "Demo request", title: "Enter your details", intro: "A short form is enough. We will use your answers to prepare a focused product demonstration." },
  ro: { index: "Solicitare demo", title: "Completează datele", intro: "Este suficient un formular scurt. Vom folosi răspunsurile pentru a pregăti o demonstrație relevantă pentru produsul tău." },
  de: { index: "Demo-Anfrage", title: "Ihre Kontaktdaten", intro: "Ein kurzes Formular genügt. Mit Ihren Angaben bereiten wir eine gezielte Produktdemo vor." },
  es: { index: "Solicitud de demo", title: "Introduzca sus datos", intro: "Basta con un formulario breve. Usaremos sus respuestas para preparar una demostración centrada en su producto." },
  fr: { index: "Demande de démo", title: "Vos coordonnées", intro: "Un court formulaire suffit. Vos réponses nous permettront de préparer une démonstration ciblée sur votre produit." },
  it: { index: "Richiesta demo", title: "Inserisca i Suoi dati", intro: "Basta un breve modulo. Useremo le Sue risposte per preparare una demo mirata sul Suo prodotto." },
};

export function DemoRequestPage({ locale }: { locale: Locale }) {
  const copy = pageCopy[locale];
  return (
    <main className="site-shell demo-request-page">
      <SiteHeader locale={locale} currentPath={localizedPath(locale, "/book-a-demo")} />
      <section className="demo-request-stage page-frame">
        <div className="demo-request-heading">
          <span className="mono-label">{copy.index}</span>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        <DemoRequestForm locale={locale} />
      </section>
      <SiteFooter locale={locale} />
    </main>
  );
}
