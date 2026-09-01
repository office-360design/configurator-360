const ACCORDION_STORAGE_KEY = '360-configurator:solar:sidebar-step';
const ACCORDION_STYLESHEET_ID = 'solar-sidebar-accordion-styles';
const STEP_DEFINITIONS = [
  { id: 'roof', summary: buildRoofSummary },
  { id: 'pv', summary: buildPvSummary },
  { id: 'energy', summary: buildEnergySummary },
  { id: 'storage', summary: buildStorageSummary },
];

let summaryFrame = 0;
let stepEntries = [];

function ensureStylesheet() {
  if (document.getElementById(ACCORDION_STYLESHEET_ID)) return;
  const link = document.createElement('link');
  link.id = ACCORDION_STYLESHEET_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../sidebar-accordion.css?v=1', import.meta.url).href;
  document.head.append(link);
}

function captureSolarState() {
  try {
    const state = window.SOLAR_CONFIGURATOR_API?.captureState?.();
    return state && typeof state === 'object' ? state : {};
  } catch {
    return {};
  }
}

function text(selector, root = document) {
  return root.querySelector(selector)?.textContent?.trim() || '';
}

function selectedText(selector, childSelector, root = document) {
  const selected = root.querySelector(`${selector}[aria-pressed="true"]`);
  if (!selected) return '';
  return childSelector ? text(childSelector, selected) : selected.textContent?.trim() || '';
}

function joinSummary(parts) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(' · ');
}

function buildRoofSummary() {
  const roofType = selectedText('[data-roof-type]', 'span');
  const length = text('[data-control="length"] output');
  const depth = text('[data-control="depth"] output');
  const pitch = text('[data-control="pitch"] output');
  const dimensions = length && depth ? `${length} × ${depth}` : length || depth;
  return joinSummary([roofType, dimensions, pitch]);
}

function buildPvSummary() {
  const panels = text('#metricPanels') || `${text('#panelCountInput')} panels`;
  const modulePower = text('#moduleReference strong').split('·')[0]?.trim();
  const systemSize = text('#metricSystemSize');
  return joinSummary([panels, modulePower, systemSize]);
}

function buildEnergySummary(state) {
  const regionalLocation = selectedText('[data-region]', 'small');
  const exactLocation = String(state.locationLabel || '').trim();
  const location = state.locationMode === 'exact' && exactLocation ? exactLocation : regionalLocation;
  const profile = selectedText('[data-consumption-profile]', 'b');
  return joinSummary([location, profile]);
}

function buildStorageSummary(state) {
  const enabledControl = document.querySelector('#batteryEnabledToggle');
  const enabled = typeof state.batteryEnabled === 'boolean' ? state.batteryEnabled : Boolean(enabledControl?.checked);
  if (!enabled) return text('#batteryCapacityReadout') || '—';

  const capacity = text('#batteryCapacityReadout') || (Number.isFinite(Number(state.batteryCapacityKWh)) ? `${Number(state.batteryCapacityKWh).toFixed(0)} kWh` : '');
  const autoControl = document.querySelector('#batteryAutoToggle');
  const autoSize = typeof state.batteryAutoSize === 'boolean' ? state.batteryAutoSize : Boolean(autoControl?.checked);
  const autoLabel = autoSize ? text('.solar-switch-row.secondary b') : '';
  return joinSummary(['LiFePO₄', capacity, autoLabel]);
}

function scheduleSummaryUpdate() {
  if (summaryFrame) return;
  summaryFrame = window.requestAnimationFrame(() => {
    summaryFrame = 0;
    const state = captureSolarState();
    stepEntries.forEach((entry) => {
      const next = entry.definition.summary(state);
      if (next && entry.summary.textContent !== next) entry.summary.textContent = next;
    });
  });
}

function writeStoredStep(stepId) {
  try { window.sessionStorage?.setItem(ACCORDION_STORAGE_KEY, stepId); } catch { /* storage is optional */ }
}

function readStoredStep() {
  try { return window.sessionStorage?.getItem(ACCORDION_STORAGE_KEY) || ''; } catch { return ''; }
}

function setExpanded(entry, expanded, { focus = false, scroll = false } = {}) {
  if (expanded) {
    stepEntries.forEach((other) => {
      if (other !== entry) setExpanded(other, false);
    });
  }

  entry.section.classList.toggle('is-active', expanded);
  entry.heading.setAttribute('aria-expanded', String(expanded));
  entry.body.setAttribute('aria-hidden', String(!expanded));
  entry.body.inert = !expanded;

  if (focus) entry.heading.focus({ preventScroll: true });
  if (scroll && expanded) {
    window.setTimeout(() => entry.heading.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 40);
  }
}

function openStep(entry) {
  const alreadyExpanded = entry.heading.getAttribute('aria-expanded') === 'true';
  if (alreadyExpanded) return;
  setExpanded(entry, true, { scroll: true });
  writeStoredStep(entry.definition.id);
}

function focusSiblingStep(entry, offset) {
  const index = stepEntries.indexOf(entry);
  if (index < 0) return;
  const next = stepEntries[(index + offset + stepEntries.length) % stepEntries.length];
  next?.heading.focus();
}

function enhanceStep(section, definition, index) {
  const heading = section.querySelector(':scope > .section-heading');
  if (!heading) return null;

  const headingId = `solarStep${index + 1}Toggle`;
  const bodyId = `solarStep${index + 1}Body`;
  section.classList.add('solar-config-step');
  section.dataset.solarStep = definition.id;

  heading.id = headingId;
  heading.classList.add('solar-step-toggle');
  heading.setAttribute('role', 'button');
  heading.setAttribute('tabindex', '0');
  heading.setAttribute('aria-controls', bodyId);

  const headingCopy = heading.querySelector(':scope > div');
  const summary = document.createElement('p');
  summary.className = 'solar-step-summary';
  summary.id = `solarStep${index + 1}Summary`;
  headingCopy?.append(summary);

  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.classList.add('solar-step-chevron');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
  heading.append(chevron);

  const body = document.createElement('div');
  body.id = bodyId;
  body.className = 'solar-step-body';
  body.setAttribute('role', 'region');
  body.setAttribute('aria-labelledby', headingId);

  const inner = document.createElement('div');
  inner.className = 'solar-step-body-inner';
  while (heading.nextSibling) inner.append(heading.nextSibling);
  body.append(inner);
  section.append(body);

  const entry = { section, heading, body, summary, definition };
  heading.addEventListener('click', () => openStep(entry));
  heading.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openStep(entry);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusSiblingStep(entry, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusSiblingStep(entry, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      stepEntries[0]?.heading.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      stepEntries.at(-1)?.heading.focus();
    }
  });

  return entry;
}

function observeSummarySources(sidebar) {
  const observer = new MutationObserver(scheduleSummaryUpdate);
  observer.observe(sidebar, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-pressed', 'hidden'],
  });

  ['#metricSystemSize', '#metricPanels', '#batteryCapacityReadout'].forEach((selector) => {
    const node = document.querySelector(selector);
    if (node) observer.observe(node, { subtree: true, childList: true, characterData: true });
  });
}

function initializeSidebarAccordion() {
  ensureStylesheet();
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || sidebar.dataset.solarAccordionReady === 'true') return;

  const sections = [...sidebar.children].filter((child) => child.classList?.contains('panel-section')).slice(0, STEP_DEFINITIONS.length);
  if (sections.length !== STEP_DEFINITIONS.length) return;

  stepEntries = sections.map((section, index) => enhanceStep(section, STEP_DEFINITIONS[index], index)).filter(Boolean);
  if (stepEntries.length !== STEP_DEFINITIONS.length) return;
  sidebar.dataset.solarAccordionReady = 'true';

  const storedStep = readStoredStep();
  const initialEntry = stepEntries.find((entry) => entry.definition.id === storedStep) || stepEntries[0];
  stepEntries.forEach((entry) => setExpanded(entry, entry === initialEntry));

  sidebar.addEventListener('input', scheduleSummaryUpdate);
  sidebar.addEventListener('change', scheduleSummaryUpdate);
  sidebar.addEventListener('click', scheduleSummaryUpdate);
  window.addEventListener('solar-tools-state-change', scheduleSummaryUpdate);
  window.addEventListener('solar-preference-change', scheduleSummaryUpdate);
  observeSummarySources(sidebar);
  scheduleSummaryUpdate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSidebarAccordion, { once: true });
} else {
  initializeSidebarAccordion();
}
