import type { Locale } from './i18n';
import { consentCopy } from './consent-copy';

// SwiftCallback's current scb.js only accepts en/ro/ru. Its translation dictionary
// is a public window property assigned before it mounts the widget. Supply the
// remaining website languages through that boundary, preserving vendor behavior.
const translations = [
  ['Close', 'Schließen', 'Cerrar', 'Fermer', 'Chiudi'],
  ['Back', 'Zurück', 'Volver', 'Retour', 'Indietro'],
  ['Cancel', 'Abbrechen', 'Cancelar', 'Annuler', 'Annulla'],
  ['Select', 'Auswählen', 'Seleccionar', 'Sélectionner', 'Seleziona'],
  ['Created by SwiftCallBack', 'Erstellt von <span>SwiftCallBack</span>', 'Creado por <span>SwiftCallBack</span>', 'Créé par <span>SwiftCallBack</span>', 'Creato da <span>SwiftCallBack</span>'],
  ['Hi, you want us to come back with a call within 28 seconds?', 'Möchten Sie innerhalb von 28 Sekunden zurückgerufen werden?', '¿Desea que le llamemos en 28 segundos?', 'Souhaitez-vous être rappelé sous 28 secondes ?', 'Desidera essere richiamato entro 28 secondi?'],
  ['Enter a phone number', 'Telefonnummer eingeben', 'Introduzca un teléfono', 'Saisissez un numéro de téléphone', 'Inserisca un numero di telefono'],
  ["I'm waiting for a call", 'Rückruf anfordern', 'Solicitar una llamada', 'Demander un rappel', 'Richiedi una chiamata'],
  ["By clicking the 'I am waiting for a call' button, I agree to the", 'Mit „Rückruf anfordern“ stimme ich der', 'Al pulsar «Solicitar una llamada», acepto el', 'En cliquant sur « Demander un rappel », j’accepte le', 'Premendo «Richiedi una chiamata», acconsento al'],
  ['processing of my personal data', 'Verarbeitung meiner personenbezogenen Daten zu', 'tratamiento de mis datos personales', 'traitement de mes données personnelles', 'trattamento dei miei dati personali'],
  ['accept the terms of the agreement.', 'Ich akzeptiere die Vertragsbedingungen.', 'Acepto las condiciones del acuerdo.', 'J’accepte les conditions de l’accord.', 'Accetto le condizioni dell’accordo.'],
  ["By clicking the 'I'm waiting for a call' button, I agree to", 'Mit „Rückruf anfordern“ stimme ich zu:', 'Al pulsar «Solicitar una llamada», acepto:', 'En cliquant sur « Demander un rappel », j’accepte :', 'Premendo «Richiedi una chiamata», accetto:'],
  ['Processing of my personal data', 'Verarbeitung meiner personenbezogenen Daten', 'Tratamiento de mis datos personales', 'Traitement de mes données personnelles', 'Trattamento dei miei dati personali'],
  ['and', 'und', 'y', 'et', 'e'],
  ['Privacy policy.', 'Datenschutzerklärung.', 'Política de privacidad.', 'Politique de confidentialité.', 'Informativa sulla privacy.'],
  ['Choose an appropriate time for the call', 'Wählen Sie einen passenden Rückrufzeitpunkt', 'Elija una hora para la llamada', 'Choisissez une heure pour le rappel', 'Scelga un orario per la chiamata'],
  ['Leave your message and we will respond to your email.', 'Hinterlassen Sie Ihre Nachricht. Wir antworten per E-Mail.', 'Deje su mensaje y responderemos por correo.', 'Laissez votre message, nous répondrons par e-mail.', 'Lasci un messaggio, risponderemo via email.'],
  ['Leave a number', 'Telefonnummer hinterlassen', 'Deje un teléfono', 'Laissez un numéro', 'Lasci un numero'],
  ['Write a message...', 'Nachricht schreiben…', 'Escriba un mensaje…', 'Écrivez un message…', 'Scriva un messaggio…'],
  ['I am waiting for a message', 'Nachricht anfordern', 'Solicitar un mensaje', 'Demander un message', 'Richiedi un messaggio'],
  ['Leave a message', 'Nachricht hinterlassen', 'Dejar un mensaje', 'Laisser un message', 'Lascia un messaggio'],
  ['Name', 'Name', 'Nombre', 'Nom', 'Nome'],
  ['Choose an hour that suits you and us we call as soon as possible', 'Wählen Sie eine passende Uhrzeit. Wir rufen Sie schnellstmöglich an.', 'Elija una hora y le llamaremos lo antes posible.', 'Choisissez une heure, nous vous rappellerons dès que possible.', 'Scelga un orario, La richiameremo appena possibile.'],
  ['Currently we are not in the working chart...', 'Wir sind derzeit außerhalb der Geschäftszeiten. Wählen Sie Tag und Uhrzeit für Ihren Rückruf.', 'Ahora estamos fuera de horario. Elija el día y la hora para que le llamemos.', 'Nous sommes actuellement fermés. Choisissez un jour et une heure pour être rappelé.', 'Al momento siamo fuori orario. Scelga giorno e ora per la chiamata.'],
  ['We currently have none manager available...', 'Derzeit ist niemand verfügbar. Wählen Sie einen Rückrufzeitpunkt.', 'No hay nadie disponible. Elija una hora para que le llamemos.', 'Personne n’est disponible. Choisissez une heure de rappel.', 'Al momento nessuno è disponibile. Scelga un orario per la chiamata.'],
  ['Your call has been rescheduled, we will get back to you shortly', 'Ihr Rückruf wurde neu geplant. Wir melden uns in Kürze.', 'Su llamada se ha reprogramado. Le contactaremos pronto.', 'Votre rappel a été reprogrammé. Nous vous recontacterons bientôt.', 'La chiamata è stata riprogrammata. La ricontatteremo a breve.'],
  ['You commanded a call', 'Sie haben einen Rückruf angefordert', 'Ha solicitado una llamada', 'Vous avez demandé un rappel', 'Ha richiesto una chiamata'],
  ['at', 'um', 'a las', 'à', 'alle'],
  ['Appreciate the conversation', 'Gespräch bewerten', 'Valorar la conversación', 'Évaluer la conversation', 'Valuta la conversazione'],
  ['operator', 'Ansprechperson', 'Operador', 'Conseiller', 'Operatore'],
  ['welcome_chat', 'Hallo, wir helfen Ihnen gerne.', 'Hola, estamos aquí para ayudarle.', 'Bonjour, nous sommes là pour vous aider.', 'Buongiorno, siamo qui per aiutarLa.'],
  ['toggleButtonIntroBtn', 'Rückruf anfordern', 'Solicitar una llamada', 'Demander un rappel', 'Richiedi una chiamata'],
  ['returnIn28Seconds', 'und wir rufen innerhalb von 28 Sekunden zurück!', '¡y le llamaremos en 28 segundos!', 'et nous vous rappelons sous 28 secondes !', 'e La richiameremo entro 28 secondi!'],
  ['justIn28Seconds', 'in nur 28 Sekunden!', '¡en solo 28 segundos!', 'en seulement 28 secondes !', 'in soli 28 secondi!'],
  ['And we will return', 'und wir rufen zurück', 'y le llamaremos', 'et nous vous rappellerons', 'e La richiameremo'],
  ['Azi', 'Heute', 'Hoy', 'Aujourd’hui', 'Oggi'],
  ['Maine', 'Morgen', 'Mañana', 'Demain', 'Domani'],
  ['appreciate', 'Bewerten', 'Valorar', 'Évaluer', 'Valuta'],
] as const;

export function callbackTranslations(locale: Locale): Record<string, string | string[]> {
  const column = { de: 1, es: 2, fr: 3, it: 4 }[locale as 'de' | 'es' | 'fr' | 'it'];
  const result: Record<string, string | string[]> = { IntroBtn: consentCopy[locale].request };
  if (!column) return result;
  for (const row of translations) result[row[0]] = row[column];
  for (const service of ['Viber', 'VKontakte', 'Telegram', 'WhatsApp', 'Messenger']) {
    result[`We are also on ${service}...`] = {
      de: `Wir sind auch auf ${service}…`, es: `También estamos en ${service}…`,
      fr: `Nous sommes aussi sur ${service}…`, it: `Siamo anche su ${service}…`,
    }[locale as 'de' | 'es' | 'fr' | 'it'];
    result[`Write in ${service}`] = {
      de: `Auf ${service} schreiben`, es: `Escribir por ${service}`,
      fr: `Écrire sur ${service}`, it: `Scrivi su ${service}`,
    }[locale as 'de' | 'es' | 'fr' | 'it'];
  }
  result.months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, month, 1))));
  return result;
}

export function installCallbackTranslations(locale: Locale) {
  const overrides = callbackTranslations(locale);
  let dictionary: Record<string, string | string[]> = overrides;
  const previous = Object.getOwnPropertyDescriptor(window, 'swiftCallbackTranslations');
  // Intercept the vendor's own assignment before the first render. No mutation
  // observer race or post-render translation of user-entered content.
  Object.defineProperty(window, 'swiftCallbackTranslations', {
    configurable: true,
    get: () => dictionary,
    set: (value: Record<string, string | string[]>) => { dictionary = { ...value, ...overrides }; },
  });
  return () => {
    if (previous) Object.defineProperty(window, 'swiftCallbackTranslations', previous);
    else delete (window as unknown as Record<string, unknown>).swiftCallbackTranslations;
  };
}
