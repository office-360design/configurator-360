import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateProject } from '../src/domain/calculations.js';
import { DEFAULT_STATE } from '../src/state.js';
import { renderCrossSection, renderProfile } from '../src/ui/renderers.js';
import { renderToolsMenu } from '../../shared-ui/src/components/toolsMenu.js';

class FakeSvgElement {
  constructor(name) {
    this.name = name;
    this.attributes = {};
    this.children = [];
    this.textContent = '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function collectAttributes(element) {
  return [
    ...Object.values(element.attributes),
    ...element.children.flatMap(collectAttributes),
  ];
}

test('profile and cross-section SVG attributes remain finite', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElementNS(_namespace, name) {
      return new FakeSvgElement(name);
    },
  };

  try {
    const state = clone(DEFAULT_STATE);
    const calculation = calculateProject(state);
    const profile = new FakeSvgElement('svg');
    const section = new FakeSvgElement('svg');
    const translate = (key) => key;

    renderProfile(profile, state, calculation);
    renderCrossSection(section, state, calculation, translate);

    const attributes = [...collectAttributes(profile), ...collectAttributes(section)];
    assert.ok(attributes.length > 0);
    assert.ok(attributes.every((value) => !/NaN|Infinity/.test(value)));
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('an empty shared tool set renders no launcher', () => {
  assert.equal(renderToolsMenu(false, { items: [] }), '');
});
