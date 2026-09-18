// This relative import resolves from both the source tree and the domain-root
// static releases (combined site or standalone window build). Node validators
// can load the same pure schema without preparing browser assets first.
import { DEFAULT_WINDOW_SIZE_LIMITS, validateWindowSizeLimits, applyWindowSliderBounds } from '../../../../shared-ui/src/windowSizeSettings.js?v=1';

const URL = 'https://europe-west1-configurator-360.cloudfunctions.net/getConfiguratorColors?configuratorId=window';
const CACHE_KEY = '360-configurator:window:published-settings-v1';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const STARTUP_TIMEOUT_MS = 1200;

function normalizePublishedWindowSettings(payload) {
    if (payload?.schemaVersion !== 1 || payload.configuratorId !== 'window'
        || !Number.isSafeInteger(payload.revision) || payload.revision < 0) {
        throw new Error('Invalid window settings response.');
    }
    if (payload.sizeLimits !== undefined) {
        payload.sizeLimits = validateWindowSizeLimits(payload.sizeLimits);
    }
    return payload;
}

function readCachedWindowSettings() {
    if (typeof window === 'undefined') return null;
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (!cached || !Number.isFinite(Number(cached.savedAt)) || !cached.payload) return null;
        return {
            savedAt: Number(cached.savedAt),
            payload: normalizePublishedWindowSettings(cached.payload),
        };
    } catch {
        return null;
    }
}

function cachePublishedWindowSettings(payload) {
    if (typeof window === 'undefined' || !payload) return;
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            payload,
        }));
    } catch {
        // Blocked/full storage must not affect configurator startup.
    }
}

export async function loadPublishedWindowSettings(options = {}) {
    if (typeof window === 'undefined' && !options.fetchImpl) return null;
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') return null;
    const controller = new AbortController();
    let timer;
    try {
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                controller.abort();
                reject(new Error('Window settings request timed out.'));
            }, options.timeoutMs ?? 8000);
        });
        const request = (async () => {
            const response = await fetchImpl(URL, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                cache: 'no-store',
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`Window settings request failed (${response.status}).`);
            const text = await response.text();
            if (text.length > 100_000) throw new Error('Window settings response is too large.');
            return normalizePublishedWindowSettings(JSON.parse(text));
        })();
        return await Promise.race([request, timeout]);
    } catch (error) {
        (options.warn || console.warn)('Window settings unavailable; using cached/built-in defaults.', error);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

const cachedWindowSettings = readCachedWindowSettings();
const cachedWindowSettingsAreFresh = Boolean(
    cachedWindowSettings
    && Date.now() - cachedWindowSettings.savedAt <= CACHE_MAX_AGE_MS
);

let publishedWindowSettings = cachedWindowSettings?.payload || null;

if (!cachedWindowSettingsAreFresh) {
    const refreshedSettings = await loadPublishedWindowSettings({
        timeoutMs: STARTUP_TIMEOUT_MS,
    });
    if (refreshedSettings) {
        publishedWindowSettings = refreshedSettings;
        cachePublishedWindowSettings(refreshedSettings);
    }
}

export const PUBLISHED_WINDOW_SETTINGS = publishedWindowSettings;
export const WINDOW_SLIDER_LIMITS = PUBLISHED_WINDOW_SETTINGS?.sizeLimits || DEFAULT_WINDOW_SIZE_LIMITS;

export function getWindowSliderRange(scope, axis) {
    const range = WINDOW_SLIDER_LIMITS[scope][axis === 'x' ? 'width' : axis === 'y' ? 'height' : axis];
    return { minM: range.minMm / 1000, maxM: range.maxMm / 1000 };
}

// This runs before main.js reads the initial DOM bounds. Node tooling stays offline.
applyWindowSliderBounds(WINDOW_SLIDER_LIMITS);

if (cachedWindowSettingsAreFresh && typeof window !== 'undefined') {
    void loadPublishedWindowSettings({
        timeoutMs: 8000,
        warn: () => {},
    }).then((settings) => {
        if (settings) cachePublishedWindowSettings(settings);
    });
}
