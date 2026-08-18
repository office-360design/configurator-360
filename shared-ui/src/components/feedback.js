import { sharedIcon } from '../icons.js';

export function renderActionFeedback() {
  return `
    <div class="save-feedback" data-save-feedback role="status" aria-live="polite">
      <span class="save-feedback__icon save-feedback__icon--success">${sharedIcon('success')}</span>
      <strong data-save-feedback-text>Saved</strong>
    </div>
  `;
}
