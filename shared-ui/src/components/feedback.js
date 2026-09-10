import { sharedT } from '../i18n.js?v=platform-18';
import { sharedIcon } from '../icons.js?v=platform-18';

export function renderActionFeedback(locale = 'en-US') {
  return `
    <div class="save-feedback" data-save-feedback role="status" aria-live="polite">
      <span class="save-feedback__icon save-feedback__icon--success">${sharedIcon('success')}</span>
      <span class="save-feedback__icon save-feedback__icon--failure">${sharedIcon('failure')}</span>
      <strong data-save-feedback-text>${sharedT(locale, 'feedback.saved')}</strong>
    </div>
  `;
}
