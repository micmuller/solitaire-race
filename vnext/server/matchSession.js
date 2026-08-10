'use strict';

const {
  PLAYER_IDS,
  PROTOCOL_VERSION,
  RULES_VERSION,
  applyAction,
  initMatch
} = require('../core');

function snapshot(session, reason) {
  return {
    kind: 'snapshot',
    matchId: session.matchId,
    protocolVersion: PROTOCOL_VERSION,
    reason,
    ...session.current
  };
}

function reject(session, clientId, code, metadata = {}) {
  return {
    kind: 'reject',
    matchId: session.matchId,
    clientId,
    protocolVersion: PROTOCOL_VERSION,
    code,
    rev: session.current.rev,
    stateHash: session.current.stateHash,
    ...metadata
  };
}

function validateEnvelope(session, actorId, envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return 'MALFORMED_MESSAGE';
  if (envelope.matchId !== session.matchId || envelope.clientId !== actorId) return 'MALFORMED_MESSAGE';
  if (envelope.protocolVersion !== PROTOCOL_VERSION) return 'MALFORMED_MESSAGE';
  if (!Number.isSafeInteger(envelope.seq) || envelope.seq < 0) return 'MALFORMED_MESSAGE';
  if (!Number.isSafeInteger(envelope.baseRev) || envelope.baseRev < 0) return 'MALFORMED_MESSAGE';
  if (typeof envelope.kind !== 'string' || envelope.kind.length === 0) return 'MALFORMED_MESSAGE';
  if (!envelope.payload || typeof envelope.payload !== 'object' || Array.isArray(envelope.payload)) {
    return 'MALFORMED_MESSAGE';
  }
  return null;
}

class MatchSession {
  constructor({ matchId, seed, mode, startedAt = new Date().toISOString() }) {
    if (typeof matchId !== 'string' || matchId.length === 0) throw new TypeError('matchId is required');
    this.matchId = matchId;
    this.current = initMatch(seed, mode);
    this.header = { seed, protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION, mode, startedAt };
    this.lastAcceptedSeq = { p1: -1, p2: -1 };
    this.steps = [];
  }

  initialSnapshot() {
    return snapshot(this, 'INITIAL_CONNECT');
  }

  restart({ seed = this.header.seed, mode = this.header.mode, startedAt = new Date().toISOString() } = {}) {
    this.current = initMatch(seed, mode);
    this.header = { seed, protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION, mode, startedAt };
    this.lastAcceptedSeq = { p1: -1, p2: -1 };
    this.steps = [];
    return snapshot(this, 'RESTART');
  }

  actionLog() {
    return { header: structuredClone(this.header), steps: structuredClone(this.steps) };
  }

  process(actorId, envelope) {
    if (!PLAYER_IDS.includes(actorId)) {
      return { response: reject(this, actorId, 'MALFORMED_MESSAGE'), broadcast: false };
    }
    const envelopeError = validateEnvelope(this, actorId, envelope);
    if (envelopeError) {
      return { response: reject(this, actorId, envelopeError), broadcast: false };
    }

    const expectedSeq = this.lastAcceptedSeq[actorId] + 1;
    let coreResult;
    if (envelope.seq < expectedSeq) {
      coreResult = { result: 'reject', code: 'DUPLICATE_SEQ', expectedSeq, ...this.current };
    } else if (envelope.seq > expectedSeq || envelope.baseRev > this.current.rev) {
      coreResult = { result: 'snapshot', reason: 'OUT_OF_SYNC', ...this.current };
    } else {
      // A stale baseRev is expected when both players act from the same
      // broadcast snapshot. Revalidate the intent against the latest
      // authoritative state instead of rejecting an otherwise independent
      // move. applyAction remains the collision and invariant boundary.
      coreResult = applyAction(this.current, actorId, { kind: envelope.kind, payload: envelope.payload });
    }

    const step = {
      i: this.steps.length,
      clientId: actorId,
      seq: envelope.seq,
      baseRev: envelope.baseRev,
      action: { kind: envelope.kind, payload: structuredClone(envelope.payload) },
      expectedResult: coreResult.result,
      expectedStateHashAfter: coreResult.stateHash
    };
    if (coreResult.result === 'reject') step.expectedRejectCode = coreResult.code;
    this.steps.push(step);

    if (coreResult.result === 'ack') {
      this.lastAcceptedSeq[actorId] = envelope.seq;
      this.current = { rev: coreResult.rev, state: coreResult.state, stateHash: coreResult.stateHash };
      const response = {
        kind: 'ack',
        matchId: this.matchId,
        clientId: actorId,
        seq: envelope.seq,
        protocolVersion: PROTOCOL_VERSION,
        ...this.current
      };
      if (coreResult.resolvedFoundationIndex !== undefined) {
        response.resolvedFoundationIndex = coreResult.resolvedFoundationIndex;
      }
      return { response, broadcast: true };
    }
    if (coreResult.result === 'snapshot') {
      return { response: snapshot(this, coreResult.reason), broadcast: coreResult.reason === 'AIRBAG' };
    }
    return {
      response: reject(this, actorId, coreResult.code, coreResult.expectedSeq === undefined ? {} : { expectedSeq: coreResult.expectedSeq }),
      broadcast: false
    };
  }
}

module.exports = { MatchSession };
