import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateCrossingAngle,
  evaluateCrossingOwnerApproval,
  evaluateCrossingVerticalSeparation,
  evaluateMinimumCover,
  evaluateRegulatoryRules,
} from '../src/regulatory/ruleEngine.js';
import { REGULATORY_RULE_PACK, REGULATORY_RULES } from '../src/regulatory/ruleRegistry.js';
import { DEFAULT_STATE } from '../src/state.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('the regulatory registry is versioned and traceable to official articles', () => {
  assert.equal(REGULATORY_RULE_PACK.jurisdiction, 'RO');
  assert.equal(REGULATORY_RULE_PACK.consolidationDate, '2023-01-26');
  assert.match(REGULATORY_RULE_PACK.source.href, /^https:\/\/legislatie\.just\.ro\//);
  assert.equal(REGULATORY_RULES.minimumCover.article, 'Art. 75');
  assert.equal(REGULATORY_RULES.crossingOwnerApproval.requiredEvidence, 'crossed-utility-owner-approval');
  assert.equal(REGULATORY_RULES.crossingAngle.exceptionalMinimumAngleDeg, 60);
  assert.equal(REGULATORY_RULES.crossingVerticalSeparation.normalMinimumM, 0.2);
});

test('normal cover passes while an unsupported reduction is blocked', () => {
  const state = clone(DEFAULT_STATE);
  assert.equal(evaluateMinimumCover(state).status, 'pass');
  state.trench.coverM = 0.8;
  assert.equal(evaluateMinimumCover(state).status, 'blocked');
});

test('reduced cover remains a warning when both exception declarations exist', () => {
  const state = clone(DEFAULT_STATE);
  state.trench.coverM = 0.8;
  state.regulatory.reducedCover.osdAgreement = true;
  state.regulatory.reducedCover.additionalProtection = true;
  assert.equal(evaluateMinimumCover(state).status, 'warning');
});

test('a crossing is not evaluated until the user declares one', () => {
  const results = evaluateRegulatoryRules(clone(DEFAULT_STATE));
  assert.equal(results.find((result) => result.id === REGULATORY_RULES.crossingAngle.id).status, 'not-evaluated');
  assert.equal(results.find((result) => result.id === REGULATORY_RULES.crossingOwnerApproval.id).status, 'not-evaluated');
  assert.equal(results.find((result) => result.id === REGULATORY_RULES.crossingVerticalSeparation.id).status, 'not-evaluated');
});

test('a declared crossing is blocked until utility-owner approval is documented', () => {
  const state = clone(DEFAULT_STATE);
  state.crossing.enabled = true;
  assert.equal(evaluateCrossingOwnerApproval(state).status, 'blocked');
  state.crossing.ownerApprovalDocumented = true;
  assert.equal(evaluateCrossingOwnerApproval(state).status, 'pass');
});

test('crossing angle distinguishes normal, exceptional and blocked geometry', () => {
  const state = clone(DEFAULT_STATE);
  state.crossing.enabled = true;
  state.crossing.angleDeg = 90;
  assert.equal(evaluateCrossingAngle(state).status, 'pass');
  state.crossing.angleDeg = 75;
  assert.equal(evaluateCrossingAngle(state).status, 'warning');
  state.crossing.angleDeg = 59;
  assert.equal(evaluateCrossingAngle(state).status, 'blocked');
});

test('crossing separation requires gas above with 0.20 m or a sleeve exception', () => {
  const state = clone(DEFAULT_STATE);
  state.crossing.enabled = true;
  state.crossing.gasPosition = 'above';
  state.crossing.verticalClearanceM = 0.2;
  assert.equal(evaluateCrossingVerticalSeparation(state).status, 'pass');

  state.crossing.verticalClearanceM = 0.15;
  assert.equal(evaluateCrossingVerticalSeparation(state).status, 'blocked');
  state.crossing.protectiveSleeve = true;
  assert.equal(evaluateCrossingVerticalSeparation(state).status, 'warning');

  state.crossing.gasPosition = 'below';
  state.crossing.verticalClearanceM = 0.4;
  state.crossing.protectiveSleeve = false;
  assert.equal(evaluateCrossingVerticalSeparation(state).status, 'blocked');
});
