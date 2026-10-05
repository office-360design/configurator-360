import { bindExclusivePanelAccordions } from '../../shared-ui/src/components/panelControls.js?v=solar-panel-1';

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
  link.href = new URL('../sidebar-accordion.css?v=solar-panel-1', import.meta.url).href;
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

function enhanceStep(section, definition, index) {
  const heading = section.querySelector(':scope > .section-heading');
  if (!heading) return null;

  const headingId = `solarStep${index + 1}Toggle`;
  const bodyId = `solarStep${index + 1}Body`;
  section.classList.add('solar-config-step', 'accordion-section', 'accordion-section--animated');
  section.dataset.solarStep = definition.id;

  heading.id = headingId;
  heading.classList.add('solar-step-toggle', 'accordion-toggle');
  heading.setAttribute('role', 'button');
  heading.setAttribute('tabindex', '0');
  heading.setAttribute('aria-controls', bodyId);

  const headingCopy = heading.querySelector(':scope > div');
  const summary = document.createElement('p');
  summary.className = 'solar-step-summary accordion-summary';
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
  body.className = 'solar-step-body accordion-reveal';
  body.setAttribute('role', 'region');
  body.setAttribute('aria-labelledby', headingId);

  const inner = document.createElement('div');
  inner.className = 'solar-step-body-inner accordion-reveal-inner';
  while (heading.nextSibling) inner.append(heading.nextSibling);
  body.append(inner);
  section.append(body);

  const entry = { section, heading, body, summary, definition };

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

function getStepSections(sidebar) {
  // Common UI converts the sidebar into a managed panel and moves the original
  // sections into this body wrapper. Fall back to the sidebar itself so the
  // accordion also works before Common UI finishes mounting and in isolation.
  const stepContainer = sidebar.querySelector(':scope > .shared-configurator-panel__body') || sidebar;
  return [...stepContainer.children]
    .filter((child) => child.matches('section.panel-section'))
    .slice(0, STEP_DEFINITIONS.length);
}

function initializeSidebarAccordion() {
  ensureStylesheet();
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return false;
  if (sidebar.dataset.solarAccordionReady === 'true') return true;

  const sections = getStepSections(sidebar);
  if (sections.length !== STEP_DEFINITIONS.length) return false;

  stepEntries = sections.map((section, index) => enhanceStep(section, STEP_DEFINITIONS[index], index)).filter(Boolean);
  if (stepEntries.length !== STEP_DEFINITIONS.length) return false;
  sidebar.dataset.solarAccordionReady = 'true';

  const storedStep = readStoredStep();
  const initialEntry = stepEntries.find((entry) => entry.definition.id === storedStep) || stepEntries[0];
  bindExclusivePanelAccordions(stepEntries, { initialEntry, onOpen: (entry) => writeStoredStep(entry.definition.id) });

  sidebar.addEventListener('input', scheduleSummaryUpdate);
  sidebar.addEventListener('change', scheduleSummaryUpdate);
  sidebar.addEventListener('click', scheduleSummaryUpdate);
  window.addEventListener('solar-tools-state-change', scheduleSummaryUpdate);
  window.addEventListener('solar-preference-change', scheduleSummaryUpdate);
  observeSummarySources(sidebar);
  scheduleSummaryUpdate();
  return true;
}

function startSidebarAccordion() {
  if (initializeSidebarAccordion()) return;

  // Module evaluation can finish before or after the managed Common UI panel is
  // assembled. Retry when that wrapper appears instead of silently doing nothing.
  const observer = new MutationObserver(() => {
    if (!initializeSidebarAccordion()) return;
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 5000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startSidebarAccordion, { once: true });
} else {
  startSidebarAccordion();
}

