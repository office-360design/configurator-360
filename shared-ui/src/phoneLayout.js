// On a phone the configurator opens with the 3D model visible and the settings
// panel closed; the visitor opens it with the panel toggle. A phone held in
// landscape is wider than the 760 px layout breakpoint, so a short touch
// screen counts as a phone too.
export const PHONE_LAYOUT_QUERY = '(max-width: 760px), (pointer: coarse) and (max-height: 560px)';

export function startsWithPanelClosed() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(PHONE_LAYOUT_QUERY).matches;
}
