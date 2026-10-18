// Compune mesajele motorului în limba interfeței. Motorul întoarce { key, params }
// (și { data } pentru textele din reguli); aici se aleg șablonul și formatul numerelor.
// Șabloane: {name}, {name:1} (număr cu 1 zecimală, după limbă), {name|, } (listă cu separator),
// {name:0| / } (listă de numere). Parametrii pot fi la rândul lor mesaje.
import { MESSAGES, DATA_TEXT, MESSAGE_LOCALES } from './messages.js?v=cortizo-i18n-1';

export function messageLocale(locale) {
  const language = String(locale || '').slice(0, 2).toLowerCase();
  return MESSAGE_LOCALES.find((l) => l.startsWith(language)) || 'en-US';
}

function formatValue(locale, value, digits, separator) {
  if (Array.isArray(value)) return value.map((v) => formatValue(locale, v, digits, separator)).join(separator ?? ', ');
  if (value && typeof value === 'object') return formatMessage(locale, value);
  if (typeof value === 'number' && digits != null) {
    return value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  // Fără număr de zecimale: separatorul zecimal al limbii, fără grupare (pagini, mm, coduri).
  if (typeof value === 'number') return value.toLocaleString(locale, { maximumFractionDigits: 3, useGrouping: false });
  return String(value ?? '');
}

/** Textul unui mesaj al motorului, al unui text din reguli sau al unui șir simplu. */
export function formatMessage(locale, message) {
  const loc = messageLocale(locale);
  if (message == null) return '';
  if (typeof message === 'string') return message;
  if ('data' in message) return DATA_TEXT[message.data]?.[loc] ?? message.data;
  const template = MESSAGES[loc][message.key] ?? MESSAGES['en-US'][message.key] ?? message.key;
  const params = message.params || {};
  return template.replace(/\{(\w+)(?::(\d))?(?:\|([^}]*))?\}/g, (_, name, digits, separator) => (
    name in params ? formatValue(loc, params[name], digits == null ? null : Number(digits), separator) : `{${name}}`
  ));
}

/** Traducerea unui text din reguli (variantă, capac, rol, principiu); textele necunoscute rămân ca atare. */
export const dataText = (locale, text) => formatMessage(locale, { data: text });
