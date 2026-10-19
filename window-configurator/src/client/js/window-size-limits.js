import { WINDOW_SLIDER_LIMITS } from './window-settings.js';
import {
    WINDOW_SIZE_CONTROLS,
    applyWindowSliderBounds
} from '../../../../shared-ui/src/windowSizeSettings.js?v=size-limits-1';
import { getGlazingBeadCode } from './config.js?v=platform-18';

import {
    WINDOW_PROFILE_MANUFACTURING_DATA,
    WINDOW_PROFILE_NON_ALUMINIUM_DATA,
} from './window-summary.js?v=locales-6';
import {
    SASH_WINDOW_TYPE,
    getWindowActualSizeInState,
} from './window-layout-state.js?v=platform-18';

export const MAX_INDIVIDUAL_WINDOW_WIDTH_M = 2.5;
export const MAX_INDIVIDUAL_WINDOW_HEIGHT_M = 2.5;
export const MAX_OVERALL_LAYOUT_WIDTH_M = 25;
export const MAX_OVERALL_LAYOUT_HEIGHT_M = 25;
export const MAX_OPENING_SASH_WEIGHT_KG = 130;

// The configurator stores the complete insulating-glass-unit thickness, not
// solid-glass thickness. The usual double-glazed make-up uses two 4 mm panes,
// which is approximately 20 kg/m² of actual glass. The spacer/cavity does not
// add glass mass and therefore must not be treated as solid glass.
export const DEFAULT_GLASS_WEIGHT_KG_PER_SQM = 20;

const MIN_WINDOW_M = 0.45;
const SASH_FROM_FRAME_END_INSET_M = 0.027;
const BEAD_FROM_SASH_END_INSET_M = 0.049;
const LIMIT_EPSILON = 1e-6;

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function profileLinearMassKgPerM(profileId, fallback = 0) {
    const id = String(profileId || '');
    return finite(WINDOW_PROFILE_MANUFACTURING_DATA[id]?.kgPerM, fallback)
        + finite(WINDOW_PROFILE_NON_ALUMINIUM_DATA[id]?.kgPerM, 0);
}

function glazingBeadLinearMassKgPerM(profileId) {
    const id = String(profileId || '');
    return finite(WINDOW_PROFILE_MANUFACTURING_DATA[id]?.kgPerM, 0.369);
}

/**
 * Conservative AW CT 65 operable-leaf mass estimate for the documented
 * sash + glazing bead + glass 130 kg limit.
 *
 * Frame/mullion and hardware are intentionally excluded. The smallest normal
 * sash inset (27 mm at an outer frame) is used on every side, so divider/transom
 * cases with larger insets are never underestimated. The pane area is taken as
 * the complete sash clear rectangle; the real pane is slightly smaller.
 */
export function estimateOpeningSashWeightKg({
    widthM,
    heightM,
    sashProfileId = '575790',
    glazingBeadCode = '573940',
    glassWeightKgPerSqm = DEFAULT_GLASS_WEIGHT_KG_PER_SQM,
} = {}) {
    const width = Math.max(0, finite(widthM));
    const height = Math.max(0, finite(heightM));
    if (width <= 0 || height <= 0) return 0;

    const sashHorizontal = Math.max(0, width - SASH_FROM_FRAME_END_INSET_M * 2);
    const sashVertical = Math.max(0, height - SASH_FROM_FRAME_END_INSET_M * 2);
    const sashPerimeter = 2 * (sashHorizontal + sashVertical);

    const beadHorizontal = Math.max(0, sashHorizontal - BEAD_FROM_SASH_END_INSET_M * 2);
    const beadVertical = Math.max(0, sashVertical - BEAD_FROM_SASH_END_INSET_M * 2);
    const beadPerimeter = 2 * (beadHorizontal + beadVertical);

    const sashMassPerM = profileLinearMassKgPerM(sashProfileId, 1.534);
    const beadMassPerM = glazingBeadLinearMassKgPerM(glazingBeadCode);
    const glassMassPerSqm = Math.max(0, finite(
        glassWeightKgPerSqm,
        DEFAULT_GLASS_WEIGHT_KG_PER_SQM
    ));
    const glassAreaSqm = sashHorizontal * sashVertical;

    return sashPerimeter * sashMassPerM
        + beadPerimeter * beadMassPerM
        + glassAreaSqm * glassMassPerSqm;
}

function maximumOpeningSashWidthForHeightM({
    heightM,
    sashProfileId = '575790',
    glazingBeadCode = '573940',
    glassWeightKgPerSqm = DEFAULT_GLASS_WEIGHT_KG_PER_SQM,
} = {}) {
    const height = Math.max(0, finite(heightM));
    if (height <= 0) return null;

    const weightAt = widthM => estimateOpeningSashWeightKg({
        widthM,
        heightM: height,
        sashProfileId,
        glazingBeadCode,
        glassWeightKgPerSqm,
    });

    // If even the configurator's minimum width is over the leaf-weight limit,
    // reducing width cannot solve the problem at this height.
    if (weightAt(MIN_WINDOW_M) > MAX_OPENING_SASH_WEIGHT_KG + LIMIT_EPSILON) {
        return null;
    }

    if (weightAt(MAX_INDIVIDUAL_WINDOW_WIDTH_M) <= MAX_OPENING_SASH_WEIGHT_KG + LIMIT_EPSILON) {
        return MAX_INDIVIDUAL_WINDOW_WIDTH_M;
    }

    // Leaf weight grows monotonically with width, so binary search gives the
    // largest width that still stays at or below 130 kg for the current height.
    let low = MIN_WINDOW_M;
    let high = MAX_INDIVIDUAL_WINDOW_WIDTH_M;
    for (let iteration = 0; iteration < 48; iteration += 1) {
        const middle = (low + high) / 2;
        if (weightAt(middle) <= MAX_OPENING_SASH_WEIGHT_KG + LIMIT_EPSILON) {
            low = middle;
        } else {
            high = middle;
        }
    }
    return low;
}

function currentLocale() {
    return String(
        globalThis.window?.WINDOW_CONFIGURATOR_SHARED_SHELL?.state?.locale
        || document?.documentElement?.lang
        || 'en-US'
    );
}

// One message builder per language, in the shared locale order (en, ro, de, es, fr, it).
const VIOLATION_MESSAGES = Object.freeze({
    en: Object.freeze({
        tooTall: (v) => `Window ${v.number} is too tall: ${v.heightMm} mm. Maximum height is ${v.maxHeightMm} mm. Reduce the height by at least ${v.reductionMm} mm before adding it to the cart.`,
        tooWide: (v) => `Window ${v.number} is too wide: ${v.widthMm} mm. Maximum width is ${v.maxWidthMm} mm. Reduce the width by at least ${v.reductionMm} mm before adding it to the cart.`,
        tooWideAndTall: (v) => `Window ${v.number} is too wide and too tall (${v.widthMm} × ${v.heightMm} mm). Maximum size is ${v.maxWidthMm} × ${v.maxHeightMm} mm. Reduce width by at least ${v.widthReductionMm} mm and height by at least ${v.heightReductionMm} mm.`,
        tooHeavyReduceWidth: (v) => `Window ${v.number} is too heavy: estimated ${v.weight} kg, above the ${v.maxWeight} kg limit. At ${v.heightMm} mm high, the width must be ${v.maximumWidthMm} mm or less. Reduce the width by at least ${v.minimumReductionMm} mm.`,
        tooHeavyReduceHeight: (v) => `Window ${v.number} is too heavy: estimated ${v.weight} kg, above the ${v.maxWeight} kg limit. At ${v.heightMm} mm high, even the configurator's minimum width is not enough; reduce the height as well.`,
    }),
    ro: Object.freeze({
        tooTall: (v) => `Fereastra ${v.number} este prea înaltă: ${v.heightMm} mm. Înălțimea maximă este ${v.maxHeightMm} mm. Reduceți înălțimea cu cel puțin ${v.reductionMm} mm înainte de a o adăuga în coș.`,
        tooWide: (v) => `Fereastra ${v.number} este prea lată: ${v.widthMm} mm. Lățimea maximă este ${v.maxWidthMm} mm. Reduceți lățimea cu cel puțin ${v.reductionMm} mm înainte de a o adăuga în coș.`,
        tooWideAndTall: (v) => `Fereastra ${v.number} este prea lată și prea înaltă (${v.widthMm} × ${v.heightMm} mm). Limita este ${v.maxWidthMm} × ${v.maxHeightMm} mm. Reduceți lățimea cu cel puțin ${v.widthReductionMm} mm și înălțimea cu cel puțin ${v.heightReductionMm} mm.`,
        tooHeavyReduceWidth: (v) => `Fereastra ${v.number} este prea grea: aproximativ ${v.weight} kg, peste limita de ${v.maxWeight} kg. La înălțimea de ${v.heightMm} mm, lățimea trebuie să fie de maximum ${v.maximumWidthMm} mm. Reduceți lățimea cu cel puțin ${v.minimumReductionMm} mm.`,
        tooHeavyReduceHeight: (v) => `Fereastra ${v.number} este prea grea: aproximativ ${v.weight} kg, peste limita de ${v.maxWeight} kg. La înălțimea de ${v.heightMm} mm, reducerea doar a lățimii până la minimul configuratorului nu este suficientă; reduceți și înălțimea.`,
    }),
    de: Object.freeze({
        tooTall: (v) => `Fenster ${v.number} ist zu hoch: ${v.heightMm} mm. Die maximale Höhe beträgt ${v.maxHeightMm} mm. Reduzieren Sie die Höhe um mindestens ${v.reductionMm} mm, bevor Sie das Fenster zum Warenkorb hinzufügen.`,
        tooWide: (v) => `Fenster ${v.number} ist zu breit: ${v.widthMm} mm. Die maximale Breite beträgt ${v.maxWidthMm} mm. Reduzieren Sie die Breite um mindestens ${v.reductionMm} mm, bevor Sie das Fenster zum Warenkorb hinzufügen.`,
        tooWideAndTall: (v) => `Fenster ${v.number} ist zu breit und zu hoch (${v.widthMm} × ${v.heightMm} mm). Zulässig sind maximal ${v.maxWidthMm} × ${v.maxHeightMm} mm. Reduzieren Sie die Breite um mindestens ${v.widthReductionMm} mm und die Höhe um mindestens ${v.heightReductionMm} mm.`,
        tooHeavyReduceWidth: (v) => `Fenster ${v.number} ist zu schwer: geschätzt ${v.weight} kg, über dem Grenzwert von ${v.maxWeight} kg. Bei ${v.heightMm} mm Höhe darf die Breite höchstens ${v.maximumWidthMm} mm betragen. Reduzieren Sie die Breite um mindestens ${v.minimumReductionMm} mm.`,
        tooHeavyReduceHeight: (v) => `Fenster ${v.number} ist zu schwer: geschätzt ${v.weight} kg, über dem Grenzwert von ${v.maxWeight} kg. Bei ${v.heightMm} mm Höhe reicht selbst die minimale Konfiguratorbreite nicht aus; reduzieren Sie auch die Höhe.`,
    }),
    es: Object.freeze({
        tooTall: (v) => `La ventana ${v.number} es demasiado alta: ${v.heightMm} mm. La altura máxima es ${v.maxHeightMm} mm. Reduzca la altura al menos ${v.reductionMm} mm antes de añadirla al carrito.`,
        tooWide: (v) => `La ventana ${v.number} es demasiado ancha: ${v.widthMm} mm. La anchura máxima es ${v.maxWidthMm} mm. Reduzca la anchura al menos ${v.reductionMm} mm antes de añadirla al carrito.`,
        tooWideAndTall: (v) => `La ventana ${v.number} es demasiado ancha y demasiado alta (${v.widthMm} × ${v.heightMm} mm). El tamaño máximo es ${v.maxWidthMm} × ${v.maxHeightMm} mm. Reduzca la anchura al menos ${v.widthReductionMm} mm y la altura al menos ${v.heightReductionMm} mm.`,
        tooHeavyReduceWidth: (v) => `La ventana ${v.number} es demasiado pesada: unos ${v.weight} kg estimados, por encima del límite de ${v.maxWeight} kg. Con ${v.heightMm} mm de altura, la anchura debe ser de ${v.maximumWidthMm} mm como máximo. Reduzca la anchura al menos ${v.minimumReductionMm} mm.`,
        tooHeavyReduceHeight: (v) => `La ventana ${v.number} es demasiado pesada: unos ${v.weight} kg estimados, por encima del límite de ${v.maxWeight} kg. Con ${v.heightMm} mm de altura, ni siquiera la anchura mínima del configurador es suficiente; reduzca también la altura.`,
    }),
    fr: Object.freeze({
        tooTall: (v) => `La fenêtre ${v.number} est trop haute : ${v.heightMm} mm. La hauteur maximale est de ${v.maxHeightMm} mm. Réduisez la hauteur d'au moins ${v.reductionMm} mm avant de l'ajouter au panier.`,
        tooWide: (v) => `La fenêtre ${v.number} est trop large : ${v.widthMm} mm. La largeur maximale est de ${v.maxWidthMm} mm. Réduisez la largeur d'au moins ${v.reductionMm} mm avant de l'ajouter au panier.`,
        tooWideAndTall: (v) => `La fenêtre ${v.number} est trop large et trop haute (${v.widthMm} × ${v.heightMm} mm). La taille maximale est de ${v.maxWidthMm} × ${v.maxHeightMm} mm. Réduisez la largeur d'au moins ${v.widthReductionMm} mm et la hauteur d'au moins ${v.heightReductionMm} mm.`,
        tooHeavyReduceWidth: (v) => `La fenêtre ${v.number} est trop lourde : environ ${v.weight} kg estimés, au-delà de la limite de ${v.maxWeight} kg. Pour une hauteur de ${v.heightMm} mm, la largeur doit être de ${v.maximumWidthMm} mm au maximum. Réduisez la largeur d'au moins ${v.minimumReductionMm} mm.`,
        tooHeavyReduceHeight: (v) => `La fenêtre ${v.number} est trop lourde : environ ${v.weight} kg estimés, au-delà de la limite de ${v.maxWeight} kg. Pour une hauteur de ${v.heightMm} mm, même la largeur minimale du configurateur ne suffit pas ; réduisez également la hauteur.`,
    }),
    it: Object.freeze({
        tooTall: (v) => `La finestra ${v.number} è troppo alta: ${v.heightMm} mm. L'altezza massima è ${v.maxHeightMm} mm. Riduca l'altezza di almeno ${v.reductionMm} mm prima di aggiungerla al carrello.`,
        tooWide: (v) => `La finestra ${v.number} è troppo larga: ${v.widthMm} mm. La larghezza massima è ${v.maxWidthMm} mm. Riduca la larghezza di almeno ${v.reductionMm} mm prima di aggiungerla al carrello.`,
        tooWideAndTall: (v) => `La finestra ${v.number} è troppo larga e troppo alta (${v.widthMm} × ${v.heightMm} mm). La dimensione massima è ${v.maxWidthMm} × ${v.maxHeightMm} mm. Riduca la larghezza di almeno ${v.widthReductionMm} mm e l'altezza di almeno ${v.heightReductionMm} mm.`,
        tooHeavyReduceWidth: (v) => `La finestra ${v.number} è troppo pesante: circa ${v.weight} kg stimati, oltre il limite di ${v.maxWeight} kg. Con un'altezza di ${v.heightMm} mm, la larghezza deve essere al massimo ${v.maximumWidthMm} mm. Riduca la larghezza di almeno ${v.minimumReductionMm} mm.`,
        tooHeavyReduceHeight: (v) => `La finestra ${v.number} è troppo pesante: circa ${v.weight} kg stimati, oltre il limite di ${v.maxWeight} kg. Con un'altezza di ${v.heightMm} mm, nemmeno la larghezza minima del configuratore è sufficiente; riduca anche l'altezza.`,
    }),
});

function violationMessagesFor(locale) {
    const language = String(locale || '').toLowerCase().split(/[-_]/)[0];
    return VIOLATION_MESSAGES[language] || VIOLATION_MESSAGES.en;
}

function localizedViolationMessage(violation) {
    const messages = violationMessagesFor(currentLocale());
    const number = violation.windowNumber;
    const widthMm = Math.round(violation.widthM * 1000);
    const heightMm = Math.round(violation.heightM * 1000);

    if (violation.type === 'dimension') {
        const tooWide = Boolean(violation.tooWide);
        const tooTall = Boolean(violation.tooTall);
        const maxWidthMm = Math.round(MAX_INDIVIDUAL_WINDOW_WIDTH_M * 1000);
        const maxHeightMm = Math.round(MAX_INDIVIDUAL_WINDOW_HEIGHT_M * 1000);

        if (tooTall && !tooWide) {
            const reductionMm = Math.max(1, heightMm - maxHeightMm);
            return messages.tooTall({ number, heightMm, maxHeightMm, reductionMm });
        }

        if (tooWide && !tooTall) {
            const reductionMm = Math.max(1, widthMm - maxWidthMm);
            return messages.tooWide({ number, widthMm, maxWidthMm, reductionMm });
        }

        const widthReductionMm = Math.max(1, widthMm - maxWidthMm);
        const heightReductionMm = Math.max(1, heightMm - maxHeightMm);
        return messages.tooWideAndTall({
            number, widthMm, heightMm, maxWidthMm, maxHeightMm, widthReductionMm, heightReductionMm,
        });
    }

    const weight = Number(violation.weightKg).toFixed(1);
    const maxWeight = MAX_OPENING_SASH_WEIGHT_KG;
    const maximumWidthMm = Number.isFinite(violation.maximumWidthM)
        ? Math.floor(violation.maximumWidthM * 1000 + 1e-9)
        : null;

    if (maximumWidthMm !== null) {
        const minimumReductionMm = Math.max(1, widthMm - maximumWidthMm);
        return messages.tooHeavyReduceWidth({
            number, weight, maxWeight, heightMm, maximumWidthMm, minimumReductionMm,
        });
    }

    return messages.tooHeavyReduceHeight({ number, weight, maxWeight, heightMm });
}

function resolveLeafProfiles(snapshot = {}) {
    const thickness = finite(
        snapshot.glassThicknessMm,
        finite(document?.getElementById?.('glassThickness')?.value, 24)
    );
    return {
        sashProfileId: String(
            snapshot.sashProfileId
            || document?.getElementById?.('sashProfile')?.value
            || '575790'
        ),
        glazingBeadCode: String(
            snapshot.glazingBeadCode
            || getGlazingBeadCode(thickness)
            || '573940'
        ),
    };
}

export function validateWindowConfigurationForCart(snapshot = null) {
    const current = snapshot || globalThis.window?.WINDOW_CONFIGURATOR_API?.captureState?.();
    const state = current?.windowState;
    const windows = state?.windows || [];
    if (!state || !windows.length) return { valid: true, violation: null, message: '' };

    const leafProfiles = resolveLeafProfiles(current || {});

    for (let index = 0; index < windows.length; index += 1) {
        const cell = windows[index];
        const size = getWindowActualSizeInState(state, cell.id);
        const widthM = finite(size?.widthM);
        const heightM = finite(size?.heightM);
        const tooWide = widthM > MAX_INDIVIDUAL_WINDOW_WIDTH_M + LIMIT_EPSILON;
        const tooTall = heightM > MAX_INDIVIDUAL_WINDOW_HEIGHT_M + LIMIT_EPSILON;

        if (tooWide || tooTall) {
            const violation = {
                type: 'dimension',
                windowNumber: index + 1,
                cellId: cell.id,
                widthM,
                heightM,
                tooWide,
                tooTall,
            };
            return {
                valid: false,
                violation,
                message: localizedViolationMessage(violation),
            };
        }

        if (cell?.type !== SASH_WINDOW_TYPE) continue;
        const weightKg = estimateOpeningSashWeightKg({
            widthM,
            heightM,
            ...leafProfiles,
        });
        if (weightKg > MAX_OPENING_SASH_WEIGHT_KG + LIMIT_EPSILON) {
            const maximumWidthM = maximumOpeningSashWidthForHeightM({
                heightM,
                ...leafProfiles,
            });
            const violation = {
                type: 'weight',
                windowNumber: index + 1,
                cellId: cell.id,
                widthM,
                heightM,
                weightKg,
                maximumWidthM,
            };
            return {
                valid: false,
                violation,
                message: localizedViolationMessage(violation),
            };
        }
    }

    return { valid: true, violation: null, message: '' };
}

// Slider settings are independent of the existing manufacturing/cart checks above.
function installWindowSizeAndCartLimits() {
    if (globalThis.__WINDOW_SIZE_AND_CART_LIMITS_INSTALLED__) return;
    globalThis.__WINDOW_SIZE_AND_CART_LIMITS_INSTALLED__ = true;
    const controls = WINDOW_SIZE_CONTROLS.map(control => ({
        ...control,
        range: document.getElementById(control.rangeId),
        number: document.getElementById(control.valueId),
    }));
    const syncBounds = () => applyWindowSliderBounds(WINDOW_SLIDER_LIMITS);
    const clampControl = target => {
        if (!(target instanceof HTMLInputElement)) return;
        const control = controls.find(entry => target === entry.range || target === entry.number);
        if (!control || target.disabled) return;
        syncBounds();
        const meters = target === control.number ? Number(target.value) / 1000 : Number(target.value);
        if (!Number.isFinite(meters) || target.value.trim() === '') return;
        const min = Number(control.range.min);
        const max = Number(control.range.max);
        const value = clamp(meters, min, max);
        control.range.value = value.toFixed(3);
        if (control.number) control.number.value = String(Math.round(value * 1000));
    };
    // Allow typing intermediate numbers naturally; constrain only on commit.
    document.addEventListener('input', event => {
        if (event.target?.type === 'range') clampControl(event.target);
    }, true);
    document.addEventListener('change', event => clampControl(event.target), true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Enter') clampControl(event.target);
    }, true);
    document.addEventListener('input', syncBounds);
    document.addEventListener('change', syncBounds);

    // The common Add to cart handler lives inside the shared configurator footer.
    // Validate during capture so an invalid window never reaches that handler.
    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        const addButton = target?.closest?.('[data-shared-panel-add-to-cart]');
        if (!addButton) return;

        const result = validateWindowConfigurationForCart();
        if (result.valid) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        globalThis.window?.WINDOW_CONFIGURATOR_SHARED_SHELL?.showFeedback?.(
            result.message,
            'error',
            5000
        );
    }, true);

    ['window-pricing-updated', 'window-shared-shell-ready', 'window-locale-applied']
        .forEach(name => window.addEventListener(name, syncBounds));
    // Selection/restoration code can rewrite max attributes. Reapply settings
    // without touching model state or number values, and only write changed attributes.
    const observer = new MutationObserver(syncBounds);
    for (const { range, number } of controls) {
        for (const input of [range, number]) if (input) observer.observe(input, {
            attributes: true, attributeFilter: ['min', 'max'],
        });
    }
    syncBounds();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    globalThis.WINDOW_SIZE_LIMITS_API = Object.freeze({
        validateForCart: validateWindowConfigurationForCart,
        estimateOpeningSashWeightKg,
    });
    installWindowSizeAndCartLimits();
}
