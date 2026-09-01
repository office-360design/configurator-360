"use client";

import { useEffect, useMemo, useState } from "react";
import type { Locale } from "../lib/i18n";

const FIREBASE_SDK_VERSION = "12.17.1";
const FIREBASE_APP_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
const FIREBASE_APP_CHECK_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-check.js`;
const FIREBASE_FUNCTIONS_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-functions.js`;
const FIREBASE_APP_NAME = "360-demo-request";
const FIREBASE_FUNCTIONS_REGION = "europe-west1";
const FIREBASE_APP_CHECK_SITE_KEY = "6LcJyo8tAAAAAFCdE_-BVDoggyWLSP9N0BM-T8sr";
const FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyBgS4VLxQYZnqW-YZJPKvuuocf5w_0kRwY",
  authDomain: "configurator-360.firebaseapp.com",
  projectId: "configurator-360",
  appId: "1:719238533149:web:9e0b8a97375731b8eaf6f4",
});

const CONFIGURATORS = ["window", "pergola", "roof", "hall", "solar", "fence"] as const;
type ConfiguratorId = (typeof CONFIGURATORS)[number];
type SubmissionState = "idle" | "submitting" | "success" | "error" | "rate-limited";

type DemoCallableContext = {
  submitContact: (payload: Record<string, string>) => Promise<{ data?: { success?: boolean; delivered?: boolean; requestId?: string } }>;
};

let demoCallablePromise: Promise<DemoCallableContext> | null = null;

const productNames: Record<Locale, Record<ConfiguratorId, string>> = {
  en: { window: "Window configurator", pergola: "Pergola configurator", roof: "Roof configurator", hall: "Hall configurator", solar: "Solar configurator", fence: "Fence configurator" },
  ro: { window: "Configurator ferestre", pergola: "Configurator pergole", roof: "Configurator acoperiș", hall: "Configurator hale", solar: "Configurator solar", fence: "Configurator garduri" },
  de: { window: "Fenster-Konfigurator", pergola: "Pergola-Konfigurator", roof: "Dach-Konfigurator", hall: "Hallen-Konfigurator", solar: "Solar-Konfigurator", fence: "Zaun-Konfigurator" },
};

const copyByLocale = {
  en: {
    eyebrow: "360Configurator demo",
    title: "Book a product demo",
    intro: "Tell us who you are and what you would like to evaluate. We will prepare the demo around the configurator you were exploring.",
    configurator: "Configurator of interest",
    name: "Your name",
    email: "Work email",
    company: "Company name",
    phone: "Phone",
    website: "Company website",
    role: "Job title / role",
    country: "Country / region",
    timing: "Preferred demo timing",
    timingPlaceholder: "No preference",
    timingOptions: { asap: "As soon as possible", week: "This week", fortnight: "Within two weeks", exploring: "Just exploring for now" },
    notes: "What would you like to see in the demo?",
    notesPlaceholder: "Optional: product rules, pricing, BOM, integrations, sales workflow, CAD data…",
    required: "Required",
    back: "Back",
    submit: "Send request",
    submitting: "Sending request…",
    consent: "By sending this request, you agree that the 360Configurator team may contact you about this demo.",
    ready: "Your demo request was sent successfully. We will contact you shortly.",
    error: "The request could not be sent. Please check your connection and try again.",
    rateLimited: "Too many requests were sent in a short period. Please try again later.",
    missingConfigurator: "Choose the configurator you are interested in.",
  },
  ro: {
    eyebrow: "Demo 360Configurator",
    title: "Programează o demonstrație",
    intro: "Spune-ne cine ești și ce dorești să evaluezi. Vom pregăti demonstrația pornind de la configuratorul pe care îl explorai.",
    configurator: "Configurator de interes",
    name: "Numele tău",
    email: "Email profesional",
    company: "Numele companiei",
    phone: "Telefon",
    website: "Website companie",
    role: "Funcție / rol",
    country: "Țară / regiune",
    timing: "Perioada preferată pentru demo",
    timingPlaceholder: "Fără preferință",
    timingOptions: { asap: "Cât mai curând", week: "Săptămâna aceasta", fortnight: "În următoarele două săptămâni", exploring: "Doar explorez momentan" },
    notes: "Ce ai dori să vezi în demonstrație?",
    notesPlaceholder: "Opțional: reguli de produs, preț, BOM, integrări, flux comercial, date CAD…",
    required: "Obligatoriu",
    back: "Înapoi",
    submit: "Trimite solicitarea",
    submitting: "Se trimite…",
    consent: "Prin trimiterea solicitării ești de acord ca echipa 360Configurator să te contacteze în legătură cu acest demo.",
    ready: "Solicitarea pentru demo a fost trimisă. Te vom contacta în curând.",
    error: "Solicitarea nu a putut fi trimisă. Verifică conexiunea și încearcă din nou.",
    rateLimited: "Au fost trimise prea multe solicitări într-un timp scurt. Încearcă din nou mai târziu.",
    missingConfigurator: "Alege configuratorul care te interesează.",
  },
  de: {
    eyebrow: "360Configurator Demo",
    title: "Produktdemo anfragen",
    intro: "Sagen Sie uns, wer Sie sind und was Sie bewerten möchten. Wir bereiten die Demo rund um den Konfigurator vor, den Sie gerade erkundet haben.",
    configurator: "Interessanter Konfigurator",
    name: "Ihr Name",
    email: "Geschäftliche E-Mail",
    company: "Unternehmen",
    phone: "Telefon",
    website: "Unternehmenswebsite",
    role: "Position / Rolle",
    country: "Land / Region",
    timing: "Bevorzugter Demo-Zeitraum",
    timingPlaceholder: "Keine Präferenz",
    timingOptions: { asap: "So bald wie möglich", week: "Diese Woche", fortnight: "Innerhalb von zwei Wochen", exploring: "Ich informiere mich zunächst" },
    notes: "Was möchten Sie in der Demo sehen?",
    notesPlaceholder: "Optional: Produktregeln, Preislogik, Stückliste, Integrationen, Vertriebsworkflow, CAD-Daten…",
    required: "Pflichtfeld",
    back: "Zurück",
    submit: "Anfrage senden",
    submitting: "Anfrage wird gesendet…",
    consent: "Mit dem Absenden stimmen Sie zu, dass das 360Configurator-Team Sie zu dieser Demo kontaktieren darf.",
    ready: "Ihre Demo-Anfrage wurde erfolgreich gesendet. Wir melden uns in Kürze.",
    error: "Die Anfrage konnte nicht gesendet werden. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    rateLimited: "In kurzer Zeit wurden zu viele Anfragen gesendet. Bitte versuchen Sie es später erneut.",
    missingConfigurator: "Wählen Sie den gewünschten Konfigurator aus.",
  },
} as const;

function isLocalDevelopmentHost() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

async function importFirebaseModule(url: string) {
  return import(/* @vite-ignore */ url);
}

async function getDemoCallable(): Promise<DemoCallableContext> {
  if (demoCallablePromise) return demoCallablePromise;
  demoCallablePromise = (async () => {
    if (isLocalDevelopmentHost()) {
      const runtime = globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean };
      if (typeof runtime.FIREBASE_APPCHECK_DEBUG_TOKEN === "undefined") runtime.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
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
    await appCheckModule.getToken(appCheck, false);
    const functions = functionsModule.getFunctions(app, FIREBASE_FUNCTIONS_REGION);
    return { submitContact: functionsModule.httpsCallable(functions, "submitContact") };
  })().catch((error) => {
    demoCallablePromise = null;
    throw error;
  });
  return demoCallablePromise;
}

function firebaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String((error as { code?: unknown }).code || "").toLowerCase();
}

function normalizeConfigurator(value: string): ConfiguratorId | "" {
  const normalized = value.trim().toLowerCase();
  return CONFIGURATORS.includes(normalized as ConfiguratorId) ? normalized as ConfiguratorId : "";
}

export function DemoRequestForm({ locale }: { locale: Locale }) {
  const copy = copyByLocale[locale];
  const [state, setState] = useState<SubmissionState>("idle");
  const [configurator, setConfigurator] = useState<ConfiguratorId | "">("");
  const [sourceConfiguratorPage, setSourceConfiguratorPage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setConfigurator(normalizeConfigurator(params.get("configurator") || ""));
    setSourceConfiguratorPage((params.get("source") || "").slice(0, 2048));
  }, []);

  const configuratorLabel = useMemo(
    () => configurator ? productNames[locale][configurator] : "",
    [configurator, locale],
  );

  const statusText = state === "success"
    ? copy.ready
    : state === "rate-limited"
      ? copy.rateLimited
      : state === "error"
        ? copy.error
        : "";

  return (
    <form className="demo-request-form" onSubmit={async (event) => {
      event.preventDefault();
      if (state === "submitting") return;
      const form = event.currentTarget;
      const data = new FormData(form);
      const selectedConfigurator = normalizeConfigurator(String(data.get("configurator") || configurator));
      if (!selectedConfigurator) {
        setState("error");
        return;
      }

      setState("submitting");
      try {
        const callable = await getDemoCallable();
        const response = await callable.submitContact({
          requestType: "demo",
          name: String(data.get("name") || ""),
          email: String(data.get("email") || ""),
          company: String(data.get("company") || ""),
          phone: String(data.get("phone") || ""),
          companyWebsite: String(data.get("companyWebsite") || ""),
          jobTitle: String(data.get("jobTitle") || ""),
          country: String(data.get("country") || ""),
          preferredTiming: String(data.get("preferredTiming") || ""),
          message: String(data.get("message") || ""),
          configurator: selectedConfigurator,
          language: locale,
          sourcePage: window.location.href,
          sourceConfiguratorPage,
          website: String(data.get("website") || ""),
        });
        if (!response.data?.success) throw new Error("Demo request was not accepted.");
        setState("success");
        form.reset();
        setConfigurator(selectedConfigurator);
      } catch (error) {
        console.error("Demo request submission failed.", error);
        const code = firebaseErrorCode(error);
        setState(code.includes("resource-exhausted") ? "rate-limited" : "error");
      }
    }}>
      <div className="demo-request-context">
        <span>{copy.configurator}</span>
        {configurator ? (
          <strong>{configuratorLabel}</strong>
        ) : (
          <select name="configurator" required defaultValue="" aria-label={copy.configurator}>
            <option value="" disabled>{copy.missingConfigurator}</option>
            {CONFIGURATORS.map((id) => <option key={id} value={id}>{productNames[locale][id]}</option>)}
          </select>
        )}
        {configurator && <input type="hidden" name="configurator" value={configurator} />}
      </div>

      <div className="demo-request-grid">
        <label><span>{copy.name} <b>*</b></span><input name="name" autoComplete="name" maxLength={120} required placeholder="Ana Beech" /></label>
        <label><span>{copy.email} <b>*</b></span><input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@work.com" /></label>
        <label><span>{copy.company} <b>*</b></span><input name="company" autoComplete="organization" maxLength={160} required placeholder="Beech Outdoor Living" /></label>
        <label><span>{copy.phone} <b>*</b></span><input name="phone" type="tel" autoComplete="tel" maxLength={60} required placeholder="+40 712 345 678" /></label>
        <label><span>{copy.website}</span><input name="companyWebsite" inputMode="url" maxLength={300} placeholder="company.com" /></label>
        <label><span>{copy.role}</span><input name="jobTitle" autoComplete="organization-title" maxLength={120} placeholder="Sales Director" /></label>
        <label><span>{copy.country}</span><input name="country" autoComplete="country-name" maxLength={120} placeholder="Romania" /></label>
        <label><span>{copy.timing}</span><select name="preferredTiming" defaultValue=""><option value="">{copy.timingPlaceholder}</option><option value="asap">{copy.timingOptions.asap}</option><option value="week">{copy.timingOptions.week}</option><option value="fortnight">{copy.timingOptions.fortnight}</option><option value="exploring">{copy.timingOptions.exploring}</option></select></label>
      </div>

      <label className="demo-request-notes"><span>{copy.notes}</span><textarea name="message" rows={4} maxLength={3000} placeholder={copy.notesPlaceholder} /></label>
      <label className="demo-request-honeypot" aria-hidden="true"><span>Website</span><input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>

      <div className="demo-request-actions">
        <button className="demo-request-back" type="button" onClick={() => window.history.back()}><span>‹</span>{copy.back}</button>
        <p>{copy.consent}</p>
        <button className="demo-request-submit" type="submit" disabled={state === "submitting"} aria-busy={state === "submitting"}>{state === "submitting" ? copy.submitting : copy.submit}<span>→</span></button>
      </div>
      <p className={`demo-request-status ${state === "success" ? "is-success" : state === "error" || state === "rate-limited" ? "is-error" : ""}`} aria-live="polite">{statusText}</p>
    </form>
  );
}
