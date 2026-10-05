'use strict';

const { TENANT_ORIGIN_PATTERN, tenantOriginContext, tenantRecordMatchesHost } = require('./tenantDomains.cjs');

const { createHash, randomBytes } = require('node:crypto');
const { GoogleAuth } = require('google-auth-library');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore } = require('firebase-admin/firestore');

const FUNCTION_REGION = 'europe-west1';
const RUNTIME_SERVICE_ACCOUNT = 'configurator-runtime@configurator-360.iam.gserviceaccount.com';
const FACTORY_RECIPIENT = 'info@mobila-lemn.ro';
const RATE_LIMIT_COLLECTION = 'bookshelfQuotationRateLimits';
const MIN_INTERVAL_MS = 30 * 1000;
const MAX_MODULES = 100;
const MAX_QUANTITY = 100000;

const PUBLIC_ORIGINS = new Set([
  'https://360configurator.com',
  'https://www.360configurator.com',
  'https://360configurator.ro',
  'https://www.360configurator.ro',
  'https://360konfigurator.de',
  'https://www.360konfigurator.de',
  'https://aks.360configurator.com',
]);
const DEVELOPMENT_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const TENANT_ORIGIN = TENANT_ORIGIN_PATTERN;

const FROM = '360Configurator Quotations <office@360configurator.com>';
const FALLBACK_FROM = '360Configurator Quotations <office@360design.ro>';
const WORKSPACE_USER = 'office@360design.ro';
const MAILER_SERVICE_ACCOUNT = 'configurator-mailer@configurator-360.iam.gserviceaccount.com';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const mailerSignerAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
let gmailAccessTokenCache = { token: '', expiresAtMs: 0 };

const FAMILY_SPECS = Object.freeze({
  compact: Object.freeze({
    straight: '800 × 350 × 2150 mm',
    corner: '750 × 750 × 2150 mm',
  }),
  tall: Object.freeze({
    straight: '900 × 350 × 2300 mm',
    corner: '850 × 850 × 2300 mm',
  }),
});
const WOOD_NAMES = Object.freeze({
  '#b98555': 'NATURAL',
  '#65422d': 'MAHON',
  '#34312f': 'WENGE',
});
const DOOR_NAMES = Object.freeze({
  open: 'Open',
  lower: 'Lower doors',
  glazed: 'Glazed doors',
});
const HARDWARE_NAMES = Object.freeze({
  diamond: 'Rhombus keyplate',
  rectangle: 'Rectangle keyplate',
  knob: 'Doorknobs',
});
const CUSTOMER_COPY = Object.freeze({
  'en-US': Object.freeze({
    subject: 'Your bookshelf request was registered',
    opening: 'The registration of your order was successful!\nWe will get back to you with an answer as soon as possible!\nHere are the details of your order:',
    details: 'Customer details',
    modules: 'Configured modules',
    name: 'Name', company: 'Company', phone: 'Phone number', email: 'Email', address: 'Shipping address', quantity: 'Number of bookcases',
    link: 'To view the configuration of the bookcase ordered, access this link:',
  }),
  'ro-RO': Object.freeze({
    subject: 'Solicitarea pentru bibliotecă a fost înregistrată',
    opening: 'Înregistrarea comenzii dumneavoastră a fost realizată cu succes!\nVom reveni cu un răspuns în cel mai scurt timp posibil!\nMai jos sunt detaliile comenzii:',
    details: 'Date client',
    modules: 'Module configurate',
    name: 'Nume', company: 'Companie', phone: 'Număr de telefon', email: 'E-mail', address: 'Adresa de livrare', quantity: 'Număr de biblioteci',
    link: 'Pentru a vedea configurația bibliotecii comandate, accesați acest link:',
  }),
  'de-DE': Object.freeze({
    subject: 'Ihre Bücherregal-Anfrage wurde registriert',
    opening: 'Die Registrierung Ihrer Bestellung war erfolgreich!\nWir melden uns so schnell wie möglich mit einer Antwort bei Ihnen!\nHier sind die Details Ihrer Bestellung:',
    details: 'Kundendaten',
    modules: 'Konfigurierte Module',
    name: 'Name', company: 'Firma', phone: 'Telefonnummer', email: 'E-Mail', address: 'Lieferadresse', quantity: 'Anzahl Bücherregale',
    link: 'Um die Konfiguration des bestellten Bücherregals anzusehen, öffnen Sie diesen Link:',
  }),
});

function cleanSingleLine(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanMultiline(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, maxLength);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
}

function validPhone(value) {
  if (!/^\+?[0-9().\s\/-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function normalizeLocale(value) {
  const locale = cleanSingleLine(value, 16);
  return CUSTOMER_COPY[locale] ? locale : 'en-US';
}

function requestOrigin(request) {
  return String(request.rawRequest?.get?.('origin') || '').trim().replace(/\/$/, '');
}

async function validateOrigin(origin, product) {
  if (PUBLIC_ORIGINS.has(origin) || DEVELOPMENT_ORIGIN.test(origin)) return;
  const context = tenantOriginContext(origin);
  if (context) {
    const snapshot = await getFirestore().collection('tenants').doc(context.slug).get();
    const tenant = snapshot.data() || {};
    if (snapshot.exists && tenant.status === 'active'
      && tenantRecordMatchesHost(tenant, context.hostname)
      && tenant.configurators?.[product] === true) return;
  }
  throw new HttpsError('permission-denied', 'This quotation form origin is not allowed.');
}

function validateShareUrl(rawUrl, requestOriginValue, maxLength = 1200) {
  if(String(rawUrl||'').length>maxLength)throw new HttpsError('invalid-argument', 'Configuration link is too long.');
  const value = cleanSingleLine(rawUrl, maxLength);
  let url;
  try { url = new URL(value); } catch { throw new HttpsError('invalid-argument', 'Invalid configuration share link.'); }
  const origin = url.origin.replace(/\/$/, '');
  if (!(PUBLIC_ORIGINS.has(origin) || DEVELOPMENT_ORIGIN.test(origin) || TENANT_ORIGIN.test(origin))) {
    throw new HttpsError('invalid-argument', 'Invalid configuration share link.');
  }
  if (requestOriginValue && origin !== requestOriginValue && !(DEVELOPMENT_ORIGIN.test(origin) && DEVELOPMENT_ORIGIN.test(requestOriginValue))) {
    throw new HttpsError('invalid-argument', 'The configuration share link does not match the request origin.');
  }
  return url.toString();
}

function validateCustomer(data) {
  const customer = {
    name: cleanSingleLine(data?.name, 120),
    company: cleanSingleLine(data?.company, 160),
    phone: cleanSingleLine(data?.phone, 60),
    email: cleanSingleLine(data?.email, 320).toLowerCase(),
    shippingAddress: cleanMultiline(data?.shippingAddress, 1000),
    quantity: Number(data?.quantity),
  };
  if (!customer.name || !customer.phone || !customer.email || !customer.shippingAddress || !Number.isFinite(customer.quantity)) {
    throw new HttpsError('invalid-argument', 'Please complete all required fields.');
  }
  if (customer.name.length < 2) throw new HttpsError('invalid-argument', 'Please enter a valid name.');
  if (!validEmail(customer.email)) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  if (!validPhone(customer.phone)) throw new HttpsError('invalid-argument', 'Please enter a valid phone number.');
  if (!Number.isInteger(customer.quantity) || customer.quantity < 1 || customer.quantity > MAX_QUANTITY) {
    throw new HttpsError('invalid-argument', 'Please enter a valid number of bookcases.');
  }
  return customer;
}

function normalizeShelfCount(module) {
  const source = Array.isArray(module?.shelfSlots) ? module.shelfSlots : [];
  const slots = new Set();
  source.forEach((value) => {
    const slot = Number(value);
    if (Number.isInteger(slot) && slot >= 0 && slot <= 1000) slots.add(slot);
  });
  // Current bookshelf snapshots store every physical shelf except the fixed top
  // shelf. The fixed bottom shelf is always represented by slot 0.
  slots.add(0);
  return Math.max(2, slots.size + 1);
}

function configurationItems(configuration) {
  if (!configuration || typeof configuration !== 'object' || !Array.isArray(configuration.modules)) {
    throw new HttpsError('invalid-argument', 'A valid bookshelf configuration is required.');
  }
  if (!configuration.modules.length || configuration.modules.length > MAX_MODULES) {
    throw new HttpsError('invalid-argument', 'The bookshelf configuration contains an invalid number of modules.');
  }
  const family = configuration.family === 'tall' ? 'tall' : 'compact';
  const specs = FAMILY_SPECS[family];
  return configuration.modules.map((module, index) => {
    const kind = module?.kind === 'corner' ? 'corner' : 'straight';
    const colour = String(module?.colour || '').toLowerCase();
    const wood = WOOD_NAMES[colour] || 'NATURAL';
    const shelves = normalizeShelfCount(module);
    const item = {
      index: index + 1,
      type: kind === 'corner' ? 'L-corner' : 'Straight',
      sizeClass: specs[kind],
      wood,
      shelves,
      door: '',
      hardware: '',
    };
    if (kind === 'straight') {
      const door = ['open', 'lower', 'glazed'].includes(module?.door) ? module.door : 'open';
      item.door = DOOR_NAMES[door];
      if (door === 'open') item.hardware = 'None (open module)';
      else item.hardware = HARDWARE_NAMES[module?.keyplate] || HARDWARE_NAMES.diamond;
    }
    return item;
  });
}

function itemLine(item) {
  const base = `${item.index}. ${item.type} - ${item.sizeClass}, ${item.wood}, ${item.shelves} shelves`;
  if (item.type === 'Straight') return `${base}, ${item.door}, ${item.hardware}`;
  return base;
}

function customerDetailLines(customer, labels) {
  const lines = [
    `${labels.name}: ${customer.name}`,
  ];
  if (customer.company) lines.push(`${labels.company}: ${customer.company}`);
  lines.push(
    `${labels.phone}: ${customer.phone}`,
    `${labels.email}: ${customer.email}`,
    `${labels.address}: ${customer.shippingAddress}`,
    `${labels.quantity}: ${customer.quantity}`,
  );
  return lines;
}

function factoryEmailText({ customer, items, shareUrl, locale, origin }) {
  return [
    'New bookshelf quotation request',
    '',
    'Customer details',
    `Name: ${customer.name}`,
    `Company: ${customer.company || 'Not provided'}`,
    `Phone number: ${customer.phone}`,
    `Email: ${customer.email}`,
    `Shipping address: ${customer.shippingAddress}`,
    `Number of bookcases: ${customer.quantity}`,
    `Language: ${locale}`,
    `Source: ${origin}`,
    '',
    'Configured modules',
    ...items.map(itemLine),
    '',
    'Configuration share link:',
    shareUrl,
  ].join('\n');
}

function customerEmailText({ customer, items, shareUrl, locale }) {
  const copy = CUSTOMER_COPY[locale] || CUSTOMER_COPY['en-US'];
  return [
    copy.opening,
    '',
    copy.details,
    ...customerDetailLines(customer, copy),
    '',
    copy.modules,
    ...items.map(itemLine),
    '',
    copy.link,
    shareUrl,
  ].join('\n');
}

function encodeMimeSubject(subject) {
  const clean = cleanSingleLine(subject, 300);
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

function encodeMimeMessage({ from, to, replyTo, subject, text, attachment }) {
  if(attachment){
    const boundary='config-'+randomBytes(16).toString('hex');
    const encoded=Buffer.from(attachment,'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
    return Buffer.from([`From: ${from}`,`To: ${to}`,`Reply-To: ${replyTo}`,`Subject: ${encodeMimeSubject(subject)}`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(text,'utf8').toString('base64').match(/.{1,76}/g).join('\r\n'),`--${boundary}`,'Content-Type: application/json; name="configuration.json"','Content-Disposition: attachment; filename="configuration.json"','Content-Transfer-Encoding: base64','',encoded,`--${boundary}--`].join('\r\n')).toString('base64url');
  }
  const normalizedText = String(text || '').replace(/\r?\n/g, '\r\n');
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeMimeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normalizedText,
  ];
  return Buffer.from(headers.join('\r\n'), 'utf8').toString('base64url');
}

async function delegatedGmailAccessToken() {
  const nowMs = Date.now();
  if (gmailAccessTokenCache.token && gmailAccessTokenCache.expiresAtMs > nowMs + 5 * 60 * 1000) {
    return gmailAccessTokenCache.token;
  }
  const nowSeconds = Math.floor(nowMs / 1000);
  const jwtPayload = JSON.stringify({
    iss: MAILER_SERVICE_ACCOUNT,
    sub: WORKSPACE_USER,
    scope: GMAIL_SEND_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  });
  const signerClient = await mailerSignerAuth.getClient();
  const signResponse = await signerClient.request({
    url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(MAILER_SERVICE_ACCOUNT)}:signJwt`,
    method: 'POST',
    data: { payload: jwtPayload },
  });
  const signedJwt = String(signResponse.data?.signedJwt || '');
  if (!signedJwt) throw new Error('Google IAM Credentials did not return a signed JWT.');

  const tokenResponse = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }),
  });
  if (!tokenResponse.ok) {
    logger.error('Could not exchange the bookshelf quotation Workspace JWT.', {
      event: 'bookshelf-quotation-gmail-token-error',
      providerStatus: tokenResponse.status,
    });
    throw new HttpsError('unavailable', 'The quotation email service is temporarily unavailable.');
  }
  const tokenData = await tokenResponse.json();
  const token = String(tokenData?.access_token || '');
  if (!token) throw new HttpsError('unavailable', 'The quotation email service is temporarily unavailable.');
  gmailAccessTokenCache = {
    token,
    expiresAtMs: nowMs + Math.max(60, Number(tokenData?.expires_in || 3600)) * 1000,
  };
  return token;
}

async function gmailSendRaw(accessToken, raw) {
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(WORKSPACE_USER)}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': '360ConfiguratorBookshelfQuotation/1.0',
    },
    body: JSON.stringify({ raw }),
  });
}

async function sendEmail({ to, replyTo, subject, text, eventName, attachment }) {
  const accessToken = await delegatedGmailAccessToken();
  let sender = FROM;
  let response = await gmailSendRaw(accessToken, encodeMimeMessage({ from: sender, to, replyTo, subject, text, attachment }));
  if (response.status === 400) {
    sender = FALLBACK_FROM;
    response = await gmailSendRaw(accessToken, encodeMimeMessage({ from: sender, to, replyTo, subject, text, attachment }));
  }
  if (!response.ok) {
    logger.error('Gmail API rejected a bookshelf quotation email.', {
      event: eventName,
      providerStatus: response.status,
      recipientDomain: String(to).split('@')[1] || '',
    });
    throw new HttpsError('unavailable', 'The request email could not be sent. Please try again.');
  }
}

function clientIp(rawRequest) {
  const forwarded = String(rawRequest?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(rawRequest?.ip || rawRequest?.socket?.remoteAddress || '').trim() || 'unknown';
}

function rateLimitKey(rawRequest) {
  return createHash('sha256').update(`bookshelf-quotation:v1:${clientIp(rawRequest)}`).digest('hex');
}

async function checkRateLimit(rawRequest) {
  const db = getFirestore();
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(rateLimitKey(rawRequest));
  const snapshot = await ref.get();
  const data = snapshot.data() || {};
  // Read the legacy field as a fallback so an in-flight deployment does not
  // accidentally bypass an already-active cooldown.
  const last = Number(data.lastSuccessAtMs || data.lastRequestAtMs || 0);
  const remainingMs = MIN_INTERVAL_MS - (Date.now() - last);
  if (remainingMs > 0) {
    throw new HttpsError(
      'resource-exhausted',
      `Please wait ${Math.ceil(remainingMs / 1000)} seconds before sending another request.`,
      { retryAfterSeconds: Math.ceil(remainingMs / 1000) },
    );
  }
}

async function recordSuccessfulRequest(rawRequest) {
  const db = getFirestore();
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(rateLimitKey(rawRequest));
  const now = Date.now();
  await ref.set({ lastSuccessAtMs: now, lastRequestAtMs: now }, { merge: true });
}

exports.requestBookshelfQuotation = onCall(
  {
    region: FUNCTION_REGION,
    serviceAccount: RUNTIME_SERVICE_ACCOUNT,
    cors: [...PUBLIC_ORIGINS, DEVELOPMENT_ORIGIN, TENANT_ORIGIN],
    enforceAppCheck: false,
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (request) => {
    const origin = requestOrigin(request);
    await validateOrigin(origin, 'bookshelf');
    const customer = validateCustomer(request.data || {});
    const locale = normalizeLocale(request.data?.locale);
    const shareUrl = validateShareUrl(request.data?.shareUrl, origin);
    const items = configurationItems(request.data?.configuration);

    // Only successful deliveries consume the 30-second server cooldown.
    // Validation and delivery failures can therefore be retried after the
    // short client-side failure cooldown.
    await checkRateLimit(request.rawRequest);

    const factorySubject = `[Bookshelf quotation] ${customer.name} — ${customer.quantity} ${customer.quantity === 1 ? 'bookcase' : 'bookcases'}`;
    const factoryText = factoryEmailText({ customer, items, shareUrl, locale, origin });
    const customerCopy = CUSTOMER_COPY[locale] || CUSTOMER_COPY['en-US'];
    const confirmationText = customerEmailText({ customer, items, shareUrl, locale });

    await sendEmail({
      to: FACTORY_RECIPIENT,
      replyTo: customer.email,
      subject: factorySubject,
      text: factoryText,
      eventName: 'bookshelf-quotation-factory-email-error',
    });
    await sendEmail({
      to: customer.email,
      replyTo: 'office@360configurator.com',
      subject: customerCopy.subject,
      text: confirmationText,
      eventName: 'bookshelf-quotation-customer-email-error',
    });

    await recordSuccessfulRequest(request.rawRequest);

    logger.info('Bookshelf quotation request emails accepted by Gmail.', {
      event: 'bookshelf-quotation-email-accepted',
      origin,
      locale,
      moduleCount: items.length,
      quantity: customer.quantity,
      customerDomain: customer.email.split('@')[1] || '',
      factoryDomain: FACTORY_RECIPIENT.split('@')[1],
    });

    return { success: true, delivered: true, moduleCount: items.length, quantity: customer.quantity };
  },
);


// Direct, cart-independent requests for all non-bookshelf products. Bookshelf
// retains its existing factory routing and dedicated callable above.
const DIRECT_QUOTATION_PRODUCTS = new Set(['window','roof','pergola','hall','solar','fence','cardbox','chair','tiles','gas']);
exports.requestConfigurationQuotation = onCall({
  region: FUNCTION_REGION, serviceAccount: RUNTIME_SERVICE_ACCOUNT,
  cors: [...PUBLIC_ORIGINS, DEVELOPMENT_ORIGIN, TENANT_ORIGIN],
  enforceAppCheck: false, timeoutSeconds: 120, memory: '256MiB',
}, async request => {
  const origin=requestOrigin(request);
  const data=request.data||{},productId=String(data.productId||'');
  if(!DIRECT_QUOTATION_PRODUCTS.has(productId))throw new HttpsError('invalid-argument','Unsupported configurator.');
  await validateOrigin(origin, productId);
  const customer=validateCustomer(data),locale=normalizeLocale(data.locale);
  if(!data.configuration||typeof data.configuration!=='object'||Array.isArray(data.configuration))throw new HttpsError('invalid-argument','A configuration is required.');
  const stateJson=JSON.stringify(data.configuration);
  if(Buffer.byteLength(stateJson,'utf8')>800000)throw new HttpsError('invalid-argument','Configuration is too large.');
  const shareUrl=data.shareUrl?validateShareUrl(data.shareUrl,origin,20000):'';
  const db=getFirestore(),key=createHash('sha256').update('direct-quotation:'+clientIp(request.rawRequest)).digest('hex');
  const limit=db.collection('configurationQuotationRateLimits').doc(key);
  const lease=randomBytes(16).toString('hex');
  await db.runTransaction(async tx=>{
    const previous=(await tx.get(limit)).data()||{},remaining=Number(previous.until||0)-Date.now();
    if(remaining>0)throw new HttpsError('resource-exhausted','Please wait before sending another request.',{retryAfterSeconds:Math.ceil(remaining/1000)});
    tx.set(limit,{lease,until:Date.now()+120000});
  });
  const record=db.collection('configurationQuotationRequests').doc();
  try{
    await record.set({productId,customer,locale,origin,shareUrl,stateJson,status:'pending',createdAtMs:Date.now()});
    const details=[`Configuration quotation: ${productId}`,`Request: ${record.id}`,`Name: ${customer.name}`,`Company: ${customer.company||'-'}`,`Phone: ${customer.phone}`,`Email: ${customer.email}`,`Delivery / project address: ${customer.shippingAddress}`,`Quantity: ${customer.quantity}`,`Origin: ${origin}`,shareUrl?`Configuration: ${shareUrl}`:'Configuration snapshot attached.'].join('\n');
    const attachment=JSON.stringify({productId,configuration:data.configuration},null,2);
    await sendEmail({to:'office@360configurator.com',replyTo:customer.email,subject:`[${productId} quotation] ${customer.name}`,text:details,attachment,eventName:'configuration-quotation-team-email-error'});
    await record.update({status:'sent',sentAtMs:Date.now()});
    const confirmation=locale==='ro-RO'?'Am primit solicitarea de ofertă.':locale==='de-DE'?'Wir haben Ihre Angebotsanfrage erhalten.':'We received your quotation request.';
    // A confirmation failure must not cause a duplicate request to the team.
    try{await sendEmail({to:customer.email,replyTo:'office@360configurator.com',subject:confirmation,text:confirmation+'\n\n'+details,attachment,eventName:'configuration-quotation-confirmation-error'});}catch{logger.warn('Configuration quotation confirmation failed.',{requestId:record.id});}
    return {success:true,requestId:record.id};
  }catch(error){await record.set({status:'failed'},{merge:true}).catch(()=>{});throw error;}
  finally{
    await db.runTransaction(async tx=>{const current=(await tx.get(limit)).data();if(current?.lease===lease)tx.set(limit,{lease,until:Date.now()+30000});}).catch(()=>logger.warn('Could not shorten quotation rate limit.',{requestId:record.id}));
  }
});
