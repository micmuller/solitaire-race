'use strict';

const {
  PLAYER_IDS,
  PROTOCOL_VERSION,
  RULES_VERSION,
  applyAction,
  expireForInactivity,
  initMatch
} = require('../core');

const PROGRESS_LIMITS = Object.freeze([0, 2, 3, 5]);

function normalizeProgressLimit(value) {
  const numeric = Number(value || 0);
  if (!PROGRESS_LIMITS.includes(numeric)) {
    const error = new TypeError('progressLimitMinutes must be 0, 2, 3 or 5');
    error.statusCode = 400;
    throw error;
  }
  return numeric;
}

function faceDownTableauCount(state, playerId) {
  return state.players[playerId].tableau.reduce(
    (total, stack) => total + stack.filter((card) => card.faceDown).length,
    0
  );
}

function foundationCardCount(state) {
  return state.foundations.reduce((total, foundation) => total + foundation.cards.length, 0);
}

function madeProgress(before, after, playerId) {
  return foundationCardCount(after) > foundationCardCount(before)
    || faceDownTableauCount(after, playerId) < faceDownTableauCount(before, playerId);
}

function snapshot(session, reason) {
  return {
    kind: 'snapshot',
    matchId: session.matchId,
    protocolVersion: PROTOCOL_VERSION,
    reason,
    ...session.current,
    progressClock: session.progressClock()
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
  constructor({ matchId, seed, mode, startedAt = new Date().toISOString(), progressLimitMinutes = 0, clockActive = true, dealDurationMs = 0, now = Date.now }) {
    if (typeof matchId !== 'string' || matchId.length === 0) throw new TypeError('matchId is required');
    this.matchId = matchId;
    this.now = now;
    this.dealDurationMs = dealDurationMs === 1800 ? 1800 : 0;
    this.dealGeneration = 0;
    this.dealEndsAt = null;
    this.progressLimitMinutes = normalizeProgressLimit(progressLimitMinutes);
    this.clockActive = Boolean(clockActive && this.progressLimitMinutes);
    this.deadlines = { p1: null, p2: null };
    this.current = initMatch(seed, mode);
    this.header = { seed, protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION, mode, startedAt, progressLimitMinutes: this.progressLimitMinutes };
    this.lastAcceptedSeq = { p1: -1, p2: -1 };
    this.steps = [];
    if (this.clockActive) this.resetDeadlines();
    if (clockActive) this.beginDeal();
  }

  beginDeal() {
    if (!this.dealDurationMs || this.current.state.status !== 'active') return;
    this.pauseClock();
    this.dealGeneration += 1;
    this.dealEndsAt = this.now() + this.dealDurationMs;
  }

  finishDealIfDue() {
    if (this.dealEndsAt === null || this.now() < this.dealEndsAt) return null;
    const startAt = this.dealEndsAt;
    this.dealEndsAt = null;
    this.clockActive = Boolean(this.progressLimitMinutes && this.current.state.status === 'active');
    if (this.clockActive) this.deadlines = { p1: startAt + this.progressLimitMinutes * 60000, p2: startAt + this.progressLimitMinutes * 60000 };
    return snapshot(this, 'DEAL_READY');
  }

  resetDeadlines() {
    const deadline = this.now() + (this.progressLimitMinutes * 60_000);
    this.deadlines = { p1: deadline, p2: deadline };
  }

  progressClock() {
    return {
      enabled: this.progressLimitMinutes > 0,
      running: this.clockActive && this.current.state.status === 'active',
      limitSeconds: this.progressLimitMinutes * 60,
      serverNow: this.now(),
      ...(this.dealEndsAt !== null ? { dealId: `${this.matchId}:${this.dealGeneration}`, dealEndsAt: this.dealEndsAt } : {}),
      deadlines: { ...this.deadlines }
    };
  }

  activateClock() {
    if (this.dealDurationMs) { if (this.dealEndsAt === null) this.beginDeal(); return; }
    if (!this.progressLimitMinutes || this.current.state.status !== 'active') return;
    this.clockActive = true;
    this.resetDeadlines();
  }

  pauseClock() {
    this.dealEndsAt = null;
    this.clockActive = false;
    this.deadlines = { p1: null, p2: null };
  }

  expireIfDue() {
    this.finishDealIfDue();
    if (!this.clockActive || !this.progressLimitMinutes || this.current.state.status !== 'active') return null;
    const now = this.now();
    const expired = PLAYER_IDS.filter((playerId) => this.deadlines[playerId] <= now)
      .sort((left, right) => this.deadlines[left] - this.deadlines[right] || left.localeCompare(right));
    if (expired.length === 0) return null;
    const playerId = expired[0];
    const coreResult = expireForInactivity(this.current, playerId);
    this.current = { rev: coreResult.rev, state: coreResult.state, stateHash: coreResult.stateHash };
    this.pauseClock();
    this.steps.push({
      i: this.steps.length,
      clientId: 'server',
      action: { kind: 'inactivity', payload: { playerId } },
      expectedResult: 'ack',
      expectedStateHashAfter: coreResult.stateHash
    });
    return snapshot(this, 'INACTIVITY_TIMEOUT');
  }

  initialSnapshot() {
    return snapshot(this, 'INITIAL_CONNECT');
  }

  restart({ seed = this.header.seed, mode = this.header.mode, startedAt = new Date().toISOString(), progressLimitMinutes = this.progressLimitMinutes, clockActive = this.clockActive } = {}) {
    this.progressLimitMinutes = normalizeProgressLimit(progressLimitMinutes);
    this.clockActive = Boolean(clockActive && this.progressLimitMinutes);
    this.current = initMatch(seed, mode);
    this.header = { seed, protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION, mode, startedAt, progressLimitMinutes: this.progressLimitMinutes };
    this.lastAcceptedSeq = { p1: -1, p2: -1 };
    this.steps = [];
    if (this.clockActive) this.resetDeadlines();
    else this.deadlines = { p1: null, p2: null };
    this.dealEndsAt = null;
    if (clockActive) this.beginDeal();
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

    this.finishDealIfDue();
    if (this.dealEndsAt !== null) {
      return { response: snapshot(this, 'DEALING'), broadcast: false };
    }

    const expectedSeq = this.lastAcceptedSeq[actorId] + 1;
    const previous = this.current;
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
      if (this.clockActive && madeProgress(previous.state, this.current.state, actorId)) {
        this.deadlines[actorId] = this.now() + (this.progressLimitMinutes * 60_000);
      }
      const response = {
        kind: 'ack',
        matchId: this.matchId,
        clientId: actorId,
        seq: envelope.seq,
        protocolVersion: PROTOCOL_VERSION,
        ...this.current,
        progressClock: this.progressClock()
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

module.exports = { MatchSession, PROGRESS_LIMITS, normalizeProgressLimit };
