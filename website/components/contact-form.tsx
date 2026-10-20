"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../lib/i18n";
import { trackWebsiteEvent, websiteProduct } from "../lib/website-analytics.js";

const FIREBASE_SDK_VERSION = "12.17.1";
const FIREBASE_APP_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
const FIREBASE_APP_CHECK_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-check.js`;
const FIREBASE_FUNCTIONS_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-functions.js`;
const FIREBASE_APP_NAME = "360-contact-form";
const FIREBASE_FUNCTIONS_REGION = "europe-west1";
const FIREBASE_APP_CHECK_SITE_KEY = "6LcJyo8tAAAAAFCdE_-BVDoggyWLSP9N0BM-T8sr";
const FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyBgS4VLxQYZnqW-YZJPKvuuocf5w_0kRwY",
  authDomain: "configurator-360.firebaseapp.com",
  projectId: "configurator-360",
  appId: "1:719238533149:web:9e0b8a97375731b8eaf6f4",
});

type SubmissionState = "idle" | "submitting" | "success" | "error" | "rate-limited";

type SubmitContactResult = {
  success?: boolean;
  delivered?: boolean;
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type ContactCallableContext = {
  submitContact: (payload: Record<string, string>) => Promise<{ data?: SubmitContactResult }>;
};

let contactCallablePromise: Promise<ContactCallableContext> | null = null;

function isLocalDevelopmentHost() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

async function importFirebaseModule(url: string) {
  return import(/* @vite-ignore */ url);
}

async function getContactCallable(): Promise<ContactCallableContext> {
  if (contactCallablePromise) return contactCallablePromise;

  contactCallablePromise = (async () => {
    if (isLocalDevelopmentHost()) {
      const runtime = globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean };
      if (typeof runtime.FIREBASE_APPCHECK_DEBUG_TOKEN === "undefined") {
        runtime.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
    }

    const [appModule, appCheckModule, functionsModule] = await Promise.all([
      importFirebaseModule(FIREBASE_APP_MODULE_URL),
      importFirebaseModule(FIREBASE_APP_CHECK_MODULE_URL),
      importFirebaseModule(FIREBASE_FUNCTIONS_MODULE_URL),
    ]);

    const existingApp = appModule.getApps().find((candidate: { name?: string }) => candidate.name === FIREBASE_APP_NAME);
    const app = existingApp || appModule.initializeApp(FIREBASE_CONFIG, FIREBASE_APP_NAME);
    const appCheck = appCheckModule.initializeAppCheck(app, {
      provider: new appCheckModule.ReCaptchaEnterpriseProvider(FIREBASE_APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: false,
    });

    // Fetch the token only when the visitor actually submits the form. The
    // Functions SDK will reuse it for the callable request immediately below.
    await appCheckModule.getToken(appCheck, false);

    const functions = functionsModule.getFunctions(app, FIREBASE_FUNCTIONS_REGION);
    const submitContact = functionsModule.httpsCallable(functions, "submitContact");
    return { submitContact };
  })().catch((error) => {
    contactCallablePromise = null;
    throw error;
  });

  return contactCallablePromise;
}

function firebaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String((error as { code?: unknown }).code || "").toLowerCase();
}

const contactCopy: Record<Locale, Record<"name" | "workEmail" | "company" | "phone" | "product" | "message" | "submit" | "submitting" | "note" | "ready" | "error" | "rateLimited" | "path", string>> = {
  en: {
    name: "Name",
    workEmail: "Work email",
    company: "Company",
    phone: "Phone (optional)",
    product: "Configurator interest (optional)",
    message: "Describe the product, its rules and the outcome you need",
    submit: "Send enquiry",
    submitting: "Sending…",
    note: "Your message is sent directly to the 360Configurator team. Your email app will not open.",
    ready: "Your message has been sent. We will get back to you as soon as possible.",
    error: "Your message could not be sent. Check your connection and try again.",
    rateLimited: "Too many attempts were made in a short time. Please try again later.",
    path: "Selected commercial path",
  },
  ro: {
    name: "Nume",
    workEmail: "Email profesional",
    company: "Companie",
    phone: "Telefon (opțional)",
    product: "Configurator de interes (opțional)",
    message: "Descrieți produsul, regulile și rezultatul dorit",
    submit: "Trimite solicitarea",
    submitting: "Se trimite…",
    note: "Mesajul este trimis direct către echipa 360Configurator. Nu se va deschide aplicația de email.",
    ready: "Mesajul a fost trimis. Revenim cât mai curând.",
    error: "Mesajul nu a putut fi trimis. Verificați conexiunea și încercați din nou.",
    rateLimited: "Au fost prea multe încercări într-un timp scurt. Încercați din nou mai târziu.",
    path: "Traseu comercial selectat",
  },
  de: {
    name: "Name",
    workEmail: "Geschäftliche E-Mail",
    company: "Unternehmen",
    phone: "Telefon (optional)",
    product: "Interessanter Konfigurator (optional)",
    message: "Beschreiben Sie Produkt, Regeln und gewünschtes Ergebnis",
    submit: "Anfrage senden",
    submitting: "Wird gesendet…",
    note: "Ihre Nachricht wird direkt an das 360Configurator-Team gesendet. Es wird keine E-Mail-App geöffnet.",
    ready: "Ihre Nachricht wurde gesendet. Wir melden uns so bald wie möglich.",
    error: "Ihre Nachricht konnte nicht gesendet werden. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    rateLimited: "Zu viele Versuche in kurzer Zeit. Bitte versuchen Sie es später erneut.",
    path: "Gewählter Implementierungsweg",
  },
  es: {
    name: "Nombre",
    workEmail: "Correo profesional",
    company: "Empresa",
    phone: "Teléfono (opcional)",
    product: "Configurador de interés (opcional)",
    message: "Describa el producto, sus reglas y el resultado que necesita",
    submit: "Enviar consulta",
    submitting: "Enviando…",
    note: "Su mensaje se envía directamente al equipo de 360Configurator. No se abrirá su aplicación de correo.",
    ready: "Su mensaje se ha enviado. Le responderemos lo antes posible.",
    error: "No se ha podido enviar su mensaje. Compruebe su conexión e inténtelo de nuevo.",
    rateLimited: "Se han realizado demasiados intentos en poco tiempo. Inténtelo de nuevo más tarde.",
    path: "Opción comercial seleccionada",
  },
  fr: {
    name: "Nom",
    workEmail: "E-mail professionnel",
    company: "Entreprise",
    phone: "Téléphone (facultatif)",
    product: "Configurateur concerné (facultatif)",
    message: "Décrivez le produit, ses règles et le résultat attendu",
    submit: "Envoyer la demande",
    submitting: "Envoi…",
    note: "Votre message est envoyé directement à l’équipe 360Configurator. Votre messagerie ne s’ouvrira pas.",
    ready: "Votre message a été envoyé. Nous vous répondrons dans les meilleurs délais.",
    error: "Votre message n’a pas pu être envoyé. Vérifiez votre connexion et réessayez.",
    rateLimited: "Trop de tentatives en peu de temps. Veuillez réessayer plus tard.",
    path: "Offre commerciale sélectionnée",
  },
  it: {
    name: "Nome",
    workEmail: "Email aziendale",
    company: "Azienda",
    phone: "Telefono (facoltativo)",
    product: "Configuratore di interesse (facoltativo)",
    message: "Descriva il prodotto, le sue regole e il risultato desiderato",
    submit: "Invia richiesta",
    submitting: "Invio…",
    note: "Il Suo messaggio viene inviato direttamente al team di 360Configurator. La Sua app di posta non si aprirà.",
    ready: "Il Suo messaggio è stato inviato. La ricontatteremo il prima possibile.",
    error: "Non è stato possibile inviare il messaggio. Verifichi la connessione e riprovi.",
    rateLimited: "Troppi tentativi in poco tempo. Riprovi più tardi.",
    path: "Percorso commerciale selezionato",
  },
};

export function ContactForm({ locale }: { locale: Locale }) {
  const [state, setState] = useState<SubmissionState>("idle");
  const [projectPath, setProjectPath] = useState("");
  const copy = contactCopy[locale];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProjectPath((new URLSearchParams(window.location.search).get("project") || "").replaceAll("-", " "));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const statusText = state === "success"
    ? copy.ready
    : state === "rate-limited"
      ? copy.rateLimited
      : state === "error"
        ? copy.error
        : copy.note;

  return <form className="contact-form" onFocus={() => trackWebsiteEvent('lead_form_start', {form_id: 'marketing_contact'}, true)} onSubmit={async (event) => {
    event.preventDefault();
    if (state === "submitting") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    setState("submitting");

    try {
      const callable = await getContactCallable();
      const response = await callable.submitContact({
        name: String(data.get("name") || ""),
        email: String(data.get("email") || ""),
        company: String(data.get("company") || ""),
        phone: String(data.get("phone") || ""),
        configuratorInterest: String(data.get("configuratorInterest") || projectPath),
        message: String(data.get("message") || ""),
        language: locale,
        sourcePage: window.location.href,
        website: String(data.get("website") || ""),
      });

      if (!response.data?.success) throw new Error("Contact submission was not accepted.");

      setState("success");
      form.reset();

      if (response.data.delivered) {
        trackWebsiteEvent("generate_lead", {
          form_id: "marketing_contact",
          product: websiteProduct(String(data.get("configuratorInterest") || projectPath)),
        });
      }
    } catch (error) {
      console.error("Contact form submission failed.", error);
      const code = firebaseErrorCode(error);
      trackWebsiteEvent('form_error', {form_id: 'marketing_contact', error_code: code.includes('resource-exhausted') ? 'rate_limited' : 'network_or_service'});
      setState(code.includes("resource-exhausted") ? "rate-limited" : "error");
    }
  }}>
    {projectPath && <p className="contact-project-context"><span>{copy.path}</span><strong>{projectPath}</strong></p>}
    <div className="contact-form-grid">
      <label><span>{copy.name}</span><input name="name" autoComplete="name" maxLength={120} required /></label>
      <label><span>{copy.workEmail}</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label><span>{copy.company}</span><input name="company" autoComplete="organization" maxLength={160} required /></label>
      <label><span>{copy.phone}</span><input name="phone" type="tel" autoComplete="tel" maxLength={60} /></label>
      <label className="contact-form-wide"><span>{copy.product}</span><input name="configuratorInterest" maxLength={160} defaultValue={projectPath} /></label>
    </div>
    <label className="contact-message"><span>{copy.message}</span><textarea name="message" rows={5} maxLength={5000} required /></label>
    <label className="contact-honeypot" aria-hidden="true">
      <span>Website</span>
      <input name="website" type="text" tabIndex={-1} autoComplete="off" />
    </label>
    <div className="contact-submit">
      <button type="submit" disabled={state === "submitting"} aria-busy={state === "submitting"}>
        <span>{state === "submitting" ? copy.submitting : copy.submit}</span><b>↗</b>
      </button>
      <p className={state === "error" || state === "rate-limited" ? "is-error" : state === "success" ? "is-success" : ""} aria-live="polite">{statusText}</p>
    </div>
  </form>;
}
