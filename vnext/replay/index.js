'use strict';

const {
  PLAYER_IDS,
  PROTOCOL_VERSION,
  RULES_VERSION,
  applyAction,
  initMatch
} = require('../core');

const REQUIRED_HEADER_FIELDS = Object.freeze([
  'seed',
  'protocolVersion',
  'rulesVersion',
  'mode'
]);
const EXPECTED_RESULTS = new Set(['ack', 'reject', 'snapshot']);

function fail(current, failureReason, failureStep) {
  const report = {
    status: 'FAIL',
    finalRev: current ? current.rev : null,
    finalStateHash: current ? current.stateHash : null,
    failureReason
  };
  if (failureStep !== undefined) report.failureStep = failureStep;
  return report;
}

function validExpectedConfig(config) {
  return config
    && typeof config === 'object'
    && REQUIRED_HEADER_FIELDS.every((field) => typeof config[field] === 'string' && config[field].length > 0);
}

function validateHeader(header, expectedConfig) {
  if (!header || typeof header !== 'object' || Array.isArray(header)) {
    return 'ActionLog header must be an object';
  }
  for (const field of REQUIRED_HEADER_FIELDS) {
    if (typeof header[field] !== 'string' || header[field].length === 0) {
      return `ActionLog header.${field} must be a non-empty string`;
    }
    if (header[field] !== expectedConfig[field]) {
      return `ActionLog header.${field} does not match expected configuration`;
    }
  }
  return null;
}

function validateStep(step, position) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return 'Step must be an object';
  if (step.i !== position) return `Step index must be ${position}`;
  if (!PLAYER_IDS.includes(step.clientId)) return 'Step clientId must be p1 or p2';
  if (!Number.isSafeInteger(step.seq) || step.seq < 0) return 'Step seq must be a non-negative safe integer';
  if (!Number.isSafeInteger(step.baseRev) || step.baseRev < 0) return 'Step baseRev must be a non-negative safe integer';
  if (!step.action || typeof step.action !== 'object' || Array.isArray(step.action)) return 'Step action must be an object';
  if (typeof step.action.kind !== 'string' || step.action.kind.length === 0) return 'Step action.kind must be a non-empty string';
  if (!step.action.payload || typeof step.action.payload !== 'object' || Array.isArray(step.action.payload)) {
    return 'Step action.payload must be an object';
  }
  if (!EXPECTED_RESULTS.has(step.expectedResult)) return 'Step expectedResult is invalid';
  if (step.expectedRejectCode !== undefined && typeof step.expectedRejectCode !== 'string') {
    return 'Step expectedRejectCode must be a string';
  }
  if (step.expectedStateHashAfter !== undefined
    && !/^[0-9a-f]{64}$/.test(step.expectedStateHashAfter)) {
    return 'Step expectedStateHashAfter must be a lowercase SHA-256 hash';
  }
  return null;
}

function protocolResult(current, step, lastAcceptedSeq) {
  const expectedSeq = lastAcceptedSeq[step.clientId] + 1;
  if (step.seq < expectedSeq) {
    return {
      result: 'reject',
      code: 'DUPLICATE_SEQ',
      rev: current.rev,
      state: current.state,
      stateHash: current.stateHash
    };
  }
  if (step.seq > expectedSeq || step.baseRev > current.rev) {
    return {
      result: 'snapshot',
      reason: 'OUT_OF_SYNC',
      rev: current.rev,
      state: current.state,
      stateHash: current.stateHash
    };
  }
  return applyAction(current, step.clientId, step.action);
}

function replay(actionLog, expectedConfig) {
  if (!validExpectedConfig(expectedConfig)) {
    return fail(null, 'Expected replay configuration is invalid');
  }
  if (!actionLog || typeof actionLog !== 'object' || Array.isArray(actionLog)) {
    return fail(null, 'ActionLog must be an object');
  }
  const headerFailure = validateHeader(actionLog.header, expectedConfig);
  if (headerFailure) return fail(null, headerFailure);
  if (!Array.isArray(actionLog.steps)) return fail(null, 'ActionLog steps must be an array');

  let current;
  try {
    current = initMatch(actionLog.header.seed, actionLog.header.mode);
  } catch (error) {
    return fail(null, `Unable to initialize replay: ${error.message}`);
  }

  const lastAcceptedSeq = { p1: -1, p2: -1 };
  for (let position = 0; position < actionLog.steps.length; position += 1) {
    const step = actionLog.steps[position];
    const stepFailure = validateStep(step, position);
    if (stepFailure) return fail(current, stepFailure, position);

    const actual = protocolResult(current, step, lastAcceptedSeq);
    if (actual.reason === 'AIRBAG') {
      return fail(current, 'AIRBAG snapshot indicates an invariant breach', step.i);
    }
    if (actual.result !== step.expectedResult) {
      return fail(current, `Expected result ${step.expectedResult}, received ${actual.result}`, step.i);
    }
    if (step.expectedRejectCode !== undefined && actual.code !== step.expectedRejectCode) {
      return fail(current, `Expected reject code ${step.expectedRejectCode}, received ${actual.code || 'none'}`, step.i);
    }
    if (step.expectedStateHashAfter !== undefined && actual.stateHash !== step.expectedStateHashAfter) {
      return fail(current, `Expected stateHash ${step.expectedStateHashAfter}, received ${actual.stateHash}`, step.i);
    }

    if (actual.result === 'ack') lastAcceptedSeq[step.clientId] = step.seq;
    if (actual.result === 'ack' || actual.result === 'snapshot') {
      current = { rev: actual.rev, state: actual.state, stateHash: actual.stateHash };
    }
  }

  return {
    status: 'SUCCESS',
    finalRev: current.rev,
    finalStateHash: current.stateHash
  };
}

function defaultExpectedConfig(seed, mode) {
  return { seed, mode, protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION };
}

module.exports = { defaultExpectedConfig, replay };
