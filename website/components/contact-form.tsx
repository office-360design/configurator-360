"use client";

import { useState } from "react";
import { contactEmail, type Locale } from "../lib/i18n";

export function ContactForm({ locale }: { locale: Locale }) {
  const [sent, setSent] = useState(false);
  const email = contactEmail(locale);
  const copy = locale === "ro" ? {
    name: "Nume", workEmail: "Email profesional", company: "Companie", product: "Ce produs doriți să configurați?", message: "Descrieți produsul, regulile și rezultatul dorit", submit: "Pregătește mesajul", note: "La trimitere se deschide aplicația ta de email, cu mesajul completat și destinatarul corect.", ready: "Mesajul este pregătit în aplicația de email.", subject: "Proiect nou 360Configurator",
  } : locale === "de" ? {
    name: "Name", workEmail: "Geschäftliche E-Mail", company: "Unternehmen", product: "Welches Produkt möchten Sie konfigurieren?", message: "Beschreiben Sie Produkt, Regeln und gewünschtes Ergebnis", submit: "Nachricht vorbereiten", note: "Beim Absenden öffnet sich Ihre E-Mail-App mit ausgefüllter Nachricht und korrektem Empfänger.", ready: "Die Nachricht wurde in Ihrer E-Mail-App vorbereitet.", subject: "Neues 360Configurator-Projekt",
  } : {
    name: "Name", workEmail: "Work email", company: "Company", product: "What product do you want to configure?", message: "Describe the product, its rules and the outcome you need", submit: "Prepare message", note: "Submitting opens your email app with the message completed and addressed correctly.", ready: "Your message is ready in your email app.", subject: "New 360Configurator project",
  };
  return <form className="contact-form" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = [
      `${copy.name}: ${data.get("name")}`, `${copy.workEmail}: ${data.get("email")}`, `${copy.company}: ${data.get("company")}`,
      "", `${copy.product}:`, String(data.get("product") || ""), "", `${copy.message}:`, String(data.get("message") || ""),
    ].join("\n");
    setSent(true);
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(copy.subject)}&body=${encodeURIComponent(body)}`;
  }}>
    <div className="contact-form-grid">
      <label><span>{copy.name}</span><input name="name" autoComplete="name" required /></label>
      <label><span>{copy.workEmail}</span><input name="email" type="email" autoComplete="email" required /></label>
      <label><span>{copy.company}</span><input name="company" autoComplete="organization" required /></label>
      <label><span>{copy.product}</span><input name="product" required /></label>
    </div>
    <label className="contact-message"><span>{copy.message}</span><textarea name="message" rows={5} required /></label>
    <div className="contact-submit"><button type="submit"><span>{copy.submit}</span><b>↗</b></button><p aria-live="polite">{sent ? copy.ready : copy.note}</p></div>
  </form>;
}
