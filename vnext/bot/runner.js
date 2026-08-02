'use strict';

const crypto = require('node:crypto');
const { ProtocolClient, createMatch } = require('../client/protocolClient');
const { canonicalize } = require('../core');
const { candidateSignature, generateActionCandidates } = require('./actionGenerator');

const SPEEDS = Object.freeze({
  slow: { minMs: 900, maxMs: 1200 },
  normal: { minMs: 250, maxMs: 400 },
  fast: { minMs: 0, maxMs: 0 }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function actionLogHash(actionLog) {
  const normalized = structuredClone(actionLog);
  if (normalized.header) normalized.header.startedAt = '<normalized>';
  return crypto.createHash('sha256').update(canonicalize(normalized)).digest('hex');
}

function speedDelay(speed, actionCount, clientId) {
  const profile = SPEEDS[speed];
  if (!profile) throw new Error(`Unknown speed: ${speed}`);
  if (profile.maxMs === 0) return 0;
  const span = profile.maxMs - profile.minMs;
  const hash = crypto.createHash('sha256').update(`${speed}|${clientId}|${actionCount}`).digest();
  return profile.minMs + (hash[0] % (span + 1));
}

class BotActor {
  constructor({ client, maxRejectsPerState = 256 }) {
    this.client = client;
    this.maxRejectsPerState = maxRejectsPerState;
    this.rejects = 0;
    this.acks = 0;
    this.snapshots = 0;
    this.noCandidate = false;
    this.rejectedByState = new Map();
  }

  rejectedSet() {
    const key = `${this.client.current.rev}:${this.client.current.stateHash}`;
    if (!this.rejectedByState.has(key)) this.rejectedByState.set(key, new Set());
    return this.rejectedByState.get(key);
  }

  nextCandidate() {
    const rejected = this.rejectedSet();
    const candidates = generateActionCandidates(this.client.current, this.client.clientId);
    return candidates.find((candidate) => !rejected.has(candidateSignature(candidate))) || null;
  }

  async step() {
    const candidate = this.nextCandidate();
    if (!candidate) {
      this.noCandidate = true;
      return { status: 'NO_CANDIDATE' };
    }
    const response = await this.client.sendIntent(candidate.kind, candidate.payload);
    if (response.kind === 'ack') {
      this.acks += 1;
      this.noCandidate = false;
    } else if (response.kind === 'reject') {
      this.rejects += 1;
      this.rejectedSet().add(candidateSignature(candidate));
      if (this.rejectedSet().size >= this.maxRejectsPerState) this.noCandidate = true;
    } else if (response.kind === 'snapshot') {
      this.snapshots += 1;
      this.noCandidate = false;
    }
    return { status: response.kind.toUpperCase(), candidate, response };
  }

  report() {
    return {
      clientId: this.client.clientId,
      acks: this.acks,
      rejects: this.rejects,
      snapshots: this.snapshots,
      nextSeq: this.client.nextSeq,
      noCandidate: this.noCandidate
    };
  }
}

async function fetchReplay(baseUrl, matchId, fetchImpl = fetch) {
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/vnext/matches/${encodeURIComponent(matchId)}/replay`);
  if (!response.ok) throw new Error(`Replay export failed: HTTP ${response.status}`);
  return response.json();
}

async function drainClients(clients) {
  await Promise.all(clients.map((client) => client.messageQueue));
}

function waitForRev(client, rev, timeoutMs = 2000) {
  if (client.current?.rev >= rev) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`${client.clientId} did not reach revision ${rev}`));
    }, timeoutMs);
    const unsubscribe = client.subscribe((event) => {
      if (event.type === 'state' && event.current.rev >= rev) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });
}

async function runHumanVsBot({
  baseUrl,
  matchId,
  seed = 'BOT-HUMAN-001',
  mode = 'split',
  clientId = 'p2',
  speed = 'normal',
  maxActions = 200
}) {
  const url = baseUrl.replace(/\/$/, '');
  const match = matchId ? { matchId, seed, mode } : await createMatch(url, { seed, mode });
  const client = new ProtocolClient({ baseUrl: url, matchId: match.matchId, clientId });
  const bot = new BotActor({ client });
  try {
    await client.connect();
    for (let actionCount = 0; actionCount < maxActions && !bot.noCandidate; actionCount += 1) {
      const delay = speedDelay(speed, actionCount, clientId);
      if (delay > 0) await sleep(delay);
      await bot.step();
      await drainClients([client]);
    }
    return {
      mode: 'human-vs-bot',
      matchId: match.matchId,
      seed: client.current.state.seed,
      gameMode: client.current.state.mode,
      speed,
      maxActions,
      finalRev: client.current.rev,
      finalStateHash: client.current.stateHash,
      stopReason: bot.noCandidate ? 'NO_CANDIDATE' : 'MAX_ACTIONS',
      bot: bot.report()
    };
  } finally {
    client.close();
  }
}

async function runBotVsBot({
  baseUrl,
  seed = 'BOT-VS-BOT-001',
  mode = 'split',
  speed = 'fast',
  maxActions = 200
}) {
  const url = baseUrl.replace(/\/$/, '');
  const match = await createMatch(url, { seed, mode });
  const p1 = new ProtocolClient({ baseUrl: url, matchId: match.matchId, clientId: 'p1' });
  const p2 = new ProtocolClient({ baseUrl: url, matchId: match.matchId, clientId: 'p2' });
  const bots = [new BotActor({ client: p1 }), new BotActor({ client: p2 })];
  try {
    await Promise.all([p1.connect(), p2.connect()]);
    let stopReason = 'MAX_ACTIONS';
    for (let actionCount = 0; actionCount < maxActions; actionCount += 1) {
      const bot = bots[actionCount % bots.length];
      if (bot.noCandidate && bots.every((candidate) => candidate.noCandidate)) {
        stopReason = 'NO_CANDIDATE';
        break;
      }
      if (bot.noCandidate) continue;
      const delay = speedDelay(speed, actionCount, bot.client.clientId);
      if (delay > 0) await sleep(delay);
      const result = await bot.step();
      await drainClients([p1, p2]);
      if (result.response?.kind === 'ack') {
        await Promise.all([waitForRev(p1, result.response.rev), waitForRev(p2, result.response.rev)]);
      }
    }
    await drainClients([p1, p2]);
    const replay = await fetchReplay(url, match.matchId);
    return {
      mode: 'bot-vs-bot',
      matchId: match.matchId,
      seed,
      gameMode: mode,
      speed,
      maxActions,
      finalRev: p1.current.rev,
      finalStateHash: p1.current.stateHash,
      actionLogHash: actionLogHash(replay),
      actionLogSteps: replay.steps.length,
      stopReason,
      bots: Object.fromEntries(bots.map((bot) => [bot.client.clientId, bot.report()]))
    };
  } finally {
    p1.close();
    p2.close();
  }
}

module.exports = {
  BotActor,
  SPEEDS,
  actionLogHash,
  runBotVsBot,
  runHumanVsBot,
  speedDelay
};
