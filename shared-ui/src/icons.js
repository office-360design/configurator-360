export function sharedIcon(type) {
  const icons = {
    cloud: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 18.2H6.2a4.2 4.2 0 0 1-.5-8.37A6.4 6.4 0 0 1 18 8.5a4.85 4.85 0 0 1-.2 9.7h-1.2"/><path d="M12 11.4v8"/><path d="m8.9 14.5 3.1-3.1 3.1 3.1"/></svg>`,
    success: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.2 2.35 2.35 5.2-5.35"/></svg>`,
    failure: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.7v5.5"/><path d="M12 16.6h.01"/></svg>`,
    undo: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 8-4 4 4 4"/><path d="M5 12h7.2a6.3 6.3 0 0 1 6.3 6.3"/></svg>`,
    reset: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8.2A7.5 7.5 0 0 1 19.3 12"/><path d="M17.9 15.8A7.5 7.5 0 0 1 4.7 12"/></svg>`,
    newConfiguration: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>`,
    account: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.7 19a6.3 6.3 0 0 1 12.6 0"/><circle cx="12" cy="12" r="9"/></svg>`,
    share: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.2"/><circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="19" r="2.2"/><path d="m8 11 7.9-4.7"/><path d="m8 13 7.9 4.7"/></svg>`,
    cart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5h2.2l1.8 9.1h9.8l2.1-6.4H6.3"/><path d="M9.2 17.2h7.1"/><circle cx="9.2" cy="19.2" r="1.15"/><circle cx="16.3" cy="19.2" r="1.15"/></svg>`,
    ar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.4 7.7 7.6 4.2 7.6-4.2"/><path d="M12 12v9"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2 2H20.5v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.5Z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7.2 7.2 0 0 0-.1-1l2-1.5-2-3.4-2.5 1a7.4 7.4 0 0 0-1.8-1L14.2 3h-4.4l-.4 3.1a7.4 7.4 0 0 0-1.8 1l-2.5-1-2 3.4 2 1.5a7.2 7.2 0 0 0 0 2l-2 1.5 2 3.4 2.5-1a7.4 7.4 0 0 0 1.8 1l.4 3.1h4.4l.4-3.1a7.4 7.4 0 0 0 1.8-1l2.5 1 2-3.4-2-1.5a7.2 7.2 0 0 0 .1-1Z"/></svg>`,
    help: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .65-1.5 1.25-1.5 2.35"/><circle cx="12" cy="17" r="1.05" fill="currentColor" stroke="none"/></svg>`,
    signout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5.5A1.5 1.5 0 0 0 4 6.5v11A1.5 1.5 0 0 0 5.5 19H10"/><path d="m15 8 4 4-4 4"/><path d="M19 12H9"/></svg>`,
    cookies: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13.2A8 8 0 1 1 10.8 4a4.3 4.3 0 0 0 4.7 5.3A4 4 0 0 0 20 13.2Z"/><circle cx="9" cy="10" r=".8"/><circle cx="8" cy="15" r=".8"/><circle cx="13" cy="16" r=".8"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5 5.6 15l9.9-9.9a2.1 2.1 0 0 1 3 0l.4.4a2.1 2.1 0 0 1 0 3L9 18.4l-4.5 1.1Z"/><path d="m13.9 6.7 3.4 3.4"/></svg>`,
    mail: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m5 7 7 5.5L19 7"/></svg>`,
    supportMail: `<svg class="support-mail-svg" viewBox="0 0 24 24" aria-hidden="true"><g class="support-mail-svg__paper"><path d="M7.5 3.7h9v9.1h-9z"/><path d="M9.6 6.4h4.8"/><path d="M9.6 8.8h3.7"/></g><path class="support-mail-svg__envelope" d="M4 9.2h16v9.8a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19V9.2Z"/><path class="support-mail-svg__envelope" d="m4.7 10 7.3 5.2 7.3-5.2"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 .7 13h8.6L17 7"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>`,
  };
  return icons[type] ?? '';
}
