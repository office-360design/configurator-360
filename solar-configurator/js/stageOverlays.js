const stage = document.querySelector('#viewerStage');
const stageHint = document.querySelector('#solarStageHint');
const liveStatus = document.querySelector('#solarLiveStatus');
const liveStatusToggle = document.querySelector('#solarLiveStatusToggle');
const liveStatusDetails = document.querySelector('#solarLiveStatusDetails');

const LIVE_STATUS_STORAGE_KEY = '360-configurator:solar:live-status-open';
const STAGE_HINT_READY_FALLBACK_MS = 15000;

let hintReadyTimer = 0;
let hintInteractionHandlersAttached = false;
let lastSimulationPlaying = false;
let autoExpandedForSimulation = false;
let expandedBeforeSimulation = false;

function readStoredBoolean(key, fallback = false) {
  try {
    const value = window.sessionStorage?.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key, value) {
  try {
    window.sessionStorage?.setItem(key, String(Boolean(value)));
  } catch {
    // Storage is an enhancement, not a requirement.
  }
}

function liveStatusExpanded() {
  return Boolean(liveStatus && !liveStatus.classList.contains('is-collapsed'));
}

function setLiveStatusExpanded(expanded, { persist = false } = {}) {
  if (!liveStatus) return;
  const isExpanded = Boolean(expanded);
  liveStatus.classList.toggle('is-collapsed', !isExpanded);
  liveStatusToggle?.setAttribute('aria-expanded', String(isExpanded));
  if (liveStatusDetails) {
    liveStatusDetails.inert = !isExpanded;
    liveStatusDetails.setAttribute('aria-hidden', String(!isExpanded));
  }
  if (persist) writeStoredBoolean(LIVE_STATUS_STORAGE_KEY, isExpanded);
}

function syncSimulationState(playing) {
  const isPlaying = Boolean(playing);
  liveStatus?.classList.toggle('is-playing', isPlaying);

  if (isPlaying && !lastSimulationPlaying) {
    expandedBeforeSimulation = liveStatusExpanded();
    if (!expandedBeforeSimulation) {
      autoExpandedForSimulation = true;
      setLiveStatusExpanded(true);
    }
  }

  if (!isPlaying && lastSimulationPlaying && autoExpandedForSimulation) {
    setLiveStatusExpanded(expandedBeforeSimulation);
    autoExpandedForSimulation = false;
  }

  lastSimulationPlaying = isPlaying;
}

function dismissFromCanvasInteraction(event) {
  if (!event.isTrusted || !event.target.closest?.('#canvasHost')) return;
  dismissStageHint();
}

function removeHintInteractionHandlers() {
  if (!stage || !hintInteractionHandlersAttached) return;
  stage.removeEventListener('pointerdown', dismissFromCanvasInteraction, true);
  stage.removeEventListener('touchstart', dismissFromCanvasInteraction, true);
  stage.removeEventListener('wheel', dismissFromCanvasInteraction, true);
  hintInteractionHandlersAttached = false;
}

function addHintInteractionHandlers() {
  if (!stage || hintInteractionHandlersAttached) return;
  stage.addEventListener('pointerdown', dismissFromCanvasInteraction, { capture: true });
  stage.addEventListener('touchstart', dismissFromCanvasInteraction, { capture: true, passive: true });
  stage.addEventListener('wheel', dismissFromCanvasInteraction, { capture: true, passive: true });
  hintInteractionHandlersAttached = true;
}

function dismissStageHint() {
  if (!stageHint) return;
  window.clearTimeout(hintReadyTimer);
  hintReadyTimer = 0;
  removeHintInteractionHandlers();
  stageHint.classList.remove('is-visible');
  stageHint.classList.add('is-dismissed');
}

function revealStageHint() {
  if (!stageHint || stageHint.classList.contains('is-visible')) return;
  window.clearTimeout(hintReadyTimer);
  hintReadyTimer = 0;
  stageHint.classList.remove('is-dismissed');
  window.requestAnimationFrame(() => stageHint.classList.add('is-visible'));
  addHintInteractionHandlers();
}

function initializeStageHint() {
  if (!stageHint) return;

  const startedAt = performance.now();
  const revealWhenReady = () => {
    const configuratorReady = Boolean(window.SOLAR_CONFIGURATOR_API?.getState);
    const shellReady = document.body.classList.contains('shared-ui-mounted');
    const fallbackReached = performance.now() - startedAt >= STAGE_HINT_READY_FALLBACK_MS;
    if ((configuratorReady && shellReady) || fallbackReached) {
      revealStageHint();
      return;
    }
    hintReadyTimer = window.setTimeout(revealWhenReady, 120);
  };
  revealWhenReady();
}

function initializeLiveStatus() {
  if (!liveStatus) return;
  setLiveStatusExpanded(readStoredBoolean(LIVE_STATUS_STORAGE_KEY));

  liveStatusToggle?.addEventListener('click', () => {
    autoExpandedForSimulation = false;
    setLiveStatusExpanded(!liveStatusExpanded(), { persist: true });
  });

  document.addEventListener('pointerdown', (event) => {
    if (!liveStatusExpanded() || lastSimulationPlaying || liveStatus.contains(event.target)) return;
    setLiveStatusExpanded(false, { persist: true });
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !liveStatusExpanded()) return;
    autoExpandedForSimulation = false;
    setLiveStatusExpanded(false, { persist: true });
    liveStatusToggle?.focus({ preventScroll: true });
  });

  window.addEventListener('blur', () => {
    if (!lastSimulationPlaying) setLiveStatusExpanded(false, { persist: true });
  });

  window.addEventListener('solar-tools-state-change', (event) => {
    syncSimulationState(event.detail?.simulationPlaying);
  });

  window.setTimeout(() => {
    try {
      syncSimulationState(window.SOLAR_CONFIGURATOR_API?.getState?.().simulationPlaying);
    } catch {
      syncSimulationState(false);
    }
  }, 0);
}

initializeStageHint();
initializeLiveStatus();
