import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];

const frontend = read('solar-configurator/js/googleSolar.js');
const indexHtml = read('solar-configurator/index.html');
const handler = read('solar-google-api/src/googleSolarHandler.mjs');
const workflow = read('.github/workflows/deploy-solar-google-api.yml');

if (!frontend.includes("const DEFAULT_PATH = '/api/solar/google-solar';")) {
  failures.push('Solar frontend does not default Google Solar to the same-origin /api/solar/google-solar path.');
}
if (frontend.includes('pvgis-proxy.netlify.app/.netlify/functions/google-solar')) {
  failures.push('Solar frontend still hardcodes the legacy Netlify Google Solar function.');
}
if (!indexHtml.includes("new URL('/api/solar/google-solar', window.location.href)")) {
  failures.push('Solar index.html does not expose the same-origin Google Solar endpoint.');
}
if (!handler.includes("platform: 'google-cloud-run'")) {
  failures.push('Cloud Run health response is missing platform=google-cloud-run.');
}
if (handler.includes('@netlify/blobs') || handler.includes('getStore(')) {
  failures.push('Cloud Run handler still depends on Netlify Blobs.');
}
if (!handler.includes("process.env.GOOGLE_SOLAR_CACHE_BUCKET")) {
  failures.push('Cloud Run handler is missing the Cloud Storage cache bucket configuration.');
}
if (!handler.includes('firestore.runTransaction')) {
  failures.push('Cloud Run handler is missing transactional Firestore rate limiting.');
}
if (!workflow.includes('--ingress=internal-and-cloud-load-balancing')) {
  failures.push('Google Solar Cloud Run workflow must restrict ingress to internal/load-balancer traffic.');
}
if (!workflow.includes('--no-default-url')) {
  failures.push('Google Solar Cloud Run workflow must disable the default run.app URL.');
}
if (!workflow.includes('GOOGLE_SOLAR_API_KEY=google-solar-api-key:latest')) {
  failures.push('Google Solar Cloud Run workflow is missing Secret Manager mapping for the API key.');
}

for (const required of [
  'solar-google-api/Dockerfile',
  'solar-google-api/package.json',
  'solar-google-api/scripts/bootstrap-gcp.sh',
  'solar-google-api/scripts/create-load-balancer-backend.sh',
]) {
  if (!fs.existsSync(path.join(root, required))) failures.push(`Missing ${required}.`);
}

if (failures.length) {
  console.error('Google Solar Cloud Run validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Google Solar Cloud Run migration validated: same-origin frontend, Cloud Storage cache, Firestore rate limits, Secret Manager, restricted Cloud Run ingress, and load-balancer setup scripts.');
}
