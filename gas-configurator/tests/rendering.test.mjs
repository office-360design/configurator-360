import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateProject } from '../src/domain/calculations.js';
import { routeProfileSamples } from '../src/domain/geometry.js';
import { routeElevationKey } from '../src/elevation/routeElevation.js';
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

function findByClass(element, className) {
  if (String(element.attributes.class || '').split(/\s+/).includes(className)) return element;
  return element.children.map((child) => findByClass(child, className)).find(Boolean) || null;
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
    state.crossing.enabled = true;
    const calculation = calculateProject(state);
    const profile = new FakeSvgElement('svg');
    const section = new FakeSvgElement('svg');
    const translate = (key) => key;

    renderProfile(profile, state, calculation);
    renderCrossSection(section, state, calculation, translate);

    const attributes = [...collectAttributes(profile), ...collectAttributes(section)];
    assert.ok(attributes.length > 0);
    assert.ok(attributes.every((value) => !/NaN|Infinity/.test(value)));
    assert.ok(findByClass(profile, 'gas-profile-crossing-line'));
    assert.ok(findByClass(profile, 'gas-profile-crossing-point'));
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('a matching terrain profile renders as live rather than fallback data', () => {
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
    const samples = routeProfileSamples(state.route.points, 24).map((sample, index) => ({
      chainageM: sample.chainageM,
      progress: sample.progress,
      coordinate: sample.coordinate,
      elevationM: 75 + index * 0.1,
    }));
    renderProfile(profile, state, calculation, {
      status: 'ready',
      routeKey: routeElevationKey(state.route.points),
      samples,
    });

    const ground = findByClass(profile, 'gas-profile-ground');
    assert.ok(ground);
    assert.equal(String(ground.attributes.class).includes('fallback'), false);
    assert.equal(String(ground.attributes.points).split(' ').length, samples.length);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('an empty shared tool set renders no launcher', () => {
  assert.equal(renderToolsMenu(false, { items: [] }), '');
});

test('hidden map overlays cannot override their hidden state', () => {
  const stylesheet = readFileSync(
    new URL('../src/styles/gas.css', import.meta.url),
    'utf8',
  );
  assert.match(
    stylesheet,
    /\.gas-map-state\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/,
  );
});
