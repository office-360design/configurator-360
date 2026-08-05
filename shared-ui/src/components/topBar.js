import { getLanguageProfile } from '../config.js';
import { sharedIcon } from '../icons.js';
import { escapeHtml } from '../utils.js';
import { renderAccountMenu } from './accountMenu.js';
import { renderLanguageMenu } from './languageMenu.js';

function saveButton(disabled = false) {
  return `
    <button class="topbar-icon-button save-preview-button" type="button" data-action="save-success-demo" data-tooltip="Save" aria-label="Save" ${disabled ? 'disabled aria-disabled="true"' : ''}>
      <span class="save-icon save-icon--cloud">${sharedIcon('cloud')}</span>
      <span class="save-icon save-icon--success">${sharedIcon('success')}</span>
    </button>
  `;
}

function shareButton(disabled = false) {
  return `
    <button class="topbar-icon-button share-preview-button" type="button" data-action="share" data-tooltip="Share" aria-label="Share" ${disabled ? 'disabled aria-disabled="true"' : ''}>
      <span class="share-icon share-icon--default">${sharedIcon('share')}</span>
      <span class="share-icon share-icon--success">${sharedIcon('success')}</span>
    </button>
  `;
}

export function renderTopBar({ brandSrc, brandAlt, projectName, state, capabilities = {} }) {
  const canViewAR = capabilities.viewAR !== false;
  const canSave = capabilities.save !== false;
  const canUndo = capabilities.undo !== false;
  const canReset = capabilities.reset !== false;
  const canShare = capabilities.share !== false;
  const language = getLanguageProfile(state.locale);
  return `
    <header class="site-header">
      <a class="brand" href="#" aria-label="Configurator home">
        <img src="${escapeHtml(brandSrc)}" alt="${escapeHtml(brandAlt)}" />
      </a>

      <div class="project-name-shell">
        <span class="project-name-measure" data-project-name-measure aria-hidden="true">${escapeHtml(projectName)}</span>
        <input class="project-name-input" type="text" value="${escapeHtml(projectName)}" maxlength="80" data-project-name aria-label="Project name" spellcheck="false" />
        <span class="project-dirty-indicator" data-project-dirty aria-label="Unsaved changes">*</span>
      </div>

      <div class="site-header__actions">
        <button class="topbar-icon-button" type="button" data-action="view-ar" data-tooltip="View in AR" aria-label="View in AR" ${canViewAR ? '' : 'disabled aria-disabled="true"'}>${sharedIcon('ar')}</button>
        ${saveButton(!canSave)}
        <button class="topbar-icon-button" type="button" data-action="undo" data-tooltip="Undo" aria-label="Undo" ${canUndo ? '' : 'disabled aria-disabled="true"'}>${sharedIcon('undo')}</button>
        <button class="topbar-icon-button" type="button" data-action="reset" data-tooltip="Reset" aria-label="Reset" ${canReset ? '' : 'disabled aria-disabled="true"'}>${sharedIcon('reset')}</button>
        ${shareButton(!canShare)}
        <button class="topbar-icon-button" type="button" data-action="account" data-tooltip="Account" aria-label="Account" aria-expanded="false">${sharedIcon('account')}</button>
        <button class="topbar-icon-button language-button" type="button" data-action="language" data-tooltip="${escapeHtml(language.nativeName)}" aria-label="${escapeHtml(language.nativeName)}" aria-expanded="false">
          <span class="language-flag" data-language-button-flag aria-hidden="true">${language.flag}</span>
        </button>
      </div>

      ${renderAccountMenu(state)}
      ${renderLanguageMenu(state.locale)}
    </header>
  `;
}
