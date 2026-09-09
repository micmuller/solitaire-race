import strategy from '../../../bot/strategy.js';
const RED_SUITS = new Set(['D', 'H']);

const SPEEDS = Object.freeze({
  easy: { minMs: 2500, maxMs: 3500 },
  medium: { minMs: 1200, maxMs: 1800 },
  hard: { minMs: 900, maxMs: 1300 }
});

function zone(zoneName, owner, index) {
  return index === undefined ? { zone: zoneName, owner } : { zone: zoneName, owner, index };
}

function action(kind, payload) { return { kind, payload }; }
function topFaceUp(cards) { return cards.length > 0 && !cards.at(-1).faceDown; }
function oppositeColor(first, second) { return RED_SUITS.has(first.suit) !== RED_SUITS.has(second.suit); }

function faceUpSuffixStarts(cards) {
  const starts = [];
  for (let index = 0; index < cards.length; index += 1) if (!cards[index].faceDown) starts.push(index);
  return starts;
}

function validFaceUpSequence(cards) {
  if (!cards.length || cards.some((card) => card.faceDown)) return false;
  for (let index = 1; index < cards.length; index += 1) {
    const below = cards[index - 1], above = cards[index];
    if (below.rank !== above.rank + 1 || !oppositeColor(below, above)) return false;
  }
  return true;
}

function canMoveToFoundation(card, foundations) {
  return foundations.some((foundation) => foundation.suit === card.suit
    && card.rank === (foundation.cards.at(-1)?.rank || 0) + 1);
}

function canMoveToTableau(cards, target) {
  if (!validFaceUpSequence(cards)) return false;
  const bottom = cards[0];
  if (!target.length) return bottom.rank === 13;
  const top = target.at(-1);
  return !top.faceDown && top.rank === bottom.rank + 1 && oppositeColor(top, bottom);
}

function stableHash(value) {
  return strategy.attentionHash(value);
}

export function visualBotDelay(speed, actionCount, clientId = 'p1') {
  const profile = SPEEDS[speed] || SPEEDS.medium;
  const span = profile.maxMs - profile.minMs;
  return profile.minMs + (stableHash(`${speed}|${clientId}|${actionCount}`) % (span + 1));
}

export function candidateSignature(candidate) { return JSON.stringify(candidate); }

export function generateVisualBotCandidates(current, botId = 'p1') {
  const { state, rev } = current || {};
  if (!state || state.status === 'finished') return [];
  const player = state.players?.[botId];
  if (!player) return [];
  const candidates = [];
  let index = 0;
  const add = (priority, candidate) => candidates.push({ priority, index:index++, candidate });
  const foundationTarget = zone('foundation', 'global', 0);

  if (topFaceUp(player.waste) && canMoveToFoundation(player.waste.at(-1), state.foundations)) {
    add(1, action('foundationMove', { source:zone('waste', botId), target:foundationTarget }));
  }
  player.tableau.forEach((cards, tableauIndex) => {
    if (topFaceUp(cards) && canMoveToFoundation(cards.at(-1), state.foundations)) {
      add(1, action('foundationMove', { source:zone('tableau', botId, tableauIndex), target:foundationTarget }));
    }
  });
  if (topFaceUp(player.waste)) {
    player.tableau.forEach((target, targetIndex) => {
      if (canMoveToTableau([player.waste.at(-1)], target)) {
        add(2, action('tableauMove', { source:zone('waste', botId), target:zone('tableau', botId, targetIndex), count:1 }));
      }
    });
  }
  player.tableau.forEach((cards, sourceIndex) => {
    for (const start of faceUpSuffixStarts(cards)) {
      const moving = cards.slice(start), count = moving.length;
      player.tableau.forEach((target, targetIndex) => {
        if (targetIndex !== sourceIndex && canMoveToTableau(moving, target)) {
          add(3, action('tableauMove', { source:zone('tableau', botId, sourceIndex), target:zone('tableau', botId, targetIndex), count }));
        }
      });
    }
  });
  player.tableau.forEach((cards, tableauIndex) => {
    if (cards.length && cards.at(-1).faceDown) add(4, action('flip', { source:zone('tableau', botId, tableauIndex) }));
  });
  if (player.stock.length) {
    add(5, action('draw', { source:zone('stock', botId), target:zone('waste', botId) }));
  } else if (player.waste.length) {
    add(5, action('recycle', { source:zone('waste', botId), target:zone('stock', botId) }));
  }

  return candidates
    .sort((a, b) => a.priority - b.priority
      || stableHash(`${state.seed}|${botId}|${rev}|${a.index}`) - stableHash(`${state.seed}|${botId}|${rev}|${b.index}`)
      || a.index - b.index)
    .map(({ candidate }) => candidate);
}

function inverseTableauMove(candidate) {
  return {
    ...candidate,
    payload: { ...candidate.payload, source:candidate.payload.target, target:candidate.payload.source }
  };
}

export class VisualBotController {
  constructor({ getCurrent, sendIntent, waitForVisualIdle = async () => {}, speed = 'medium', clientId = 'p1', onStatus = () => {}, onStop = () => {} }) {
    this.getCurrent = getCurrent;
    this.sendIntent = sendIntent;
    this.waitForVisualIdle = waitForVisualIdle;
    this.speed = SPEEDS[speed] ? speed : 'medium';
    this.clientId = clientId;
    this.onStatus = onStatus;
    this.onStop = onStop;
    this.running = false;
    this.actionCount = 0;
    this.recentAccepted = [];
    this.rejectedByState = new Map();
    this.timer = null;
    this.releaseWait = null;
  }

  rejectedSet(current) {
    const key = `${current.rev}:${current.stateHash}`;
    if (!this.rejectedByState.has(key)) this.rejectedByState.clear();
    if (!this.rejectedByState.has(key)) this.rejectedByState.set(key, new Set());
    return this.rejectedByState.get(key);
  }

  nextCandidate(current) {
    const progress = strategy.progressKey(current);
    if (this.lastProgress !== undefined && this.lastProgress !== progress) this.recentAccepted = [];
    this.lastProgress = progress;
    const rejected = this.rejectedSet(current);
    const available = strategy.rankCandidates(current, this.clientId,
      generateVisualBotCandidates(current, this.clientId), this.speed).filter((candidate) => {
      const signature = candidateSignature(candidate);
      if (rejected.has(signature)) return false;
      if (candidate.kind !== 'tableauMove') return true;
      return !this.recentAccepted.includes(signature)
        && !this.recentAccepted.includes(candidateSignature(inverseTableauMove(candidate)));
    });
    this.waitingForClock = strategy.shouldReserveProgress(current, this.clientId, available, this.speed);
    return this.waitingForClock ? null : available[0] || null;
  }

  rememberAccepted(candidate) {
    if (candidate.kind !== 'tableauMove') return;
    this.recentAccepted.unshift(candidateSignature(candidate));
    this.recentAccepted = this.recentAccepted.slice(0, 12);
  }

  wait(ms) {
    return new Promise((resolve) => {
      this.releaseWait = resolve;
      this.timer = setTimeout(() => { this.timer=null;this.releaseWait=null;resolve(); }, ms);
    });
  }

  stop(reason = 'stopped') {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.releaseWait?.();
    this.releaseWait = null;
    this.onStop(reason);
  }

  start() {
    if (this.running) return this.done;
    this.running = true;
    this.done = this.run();
    return this.done;
  }

  async run() {
    this.onStatus('P1-Client-Bot wartet auf seinen ersten Zug');
    try {
      while (this.running) {
        const current = this.getCurrent();
        if (!current || current.state.status === 'finished') break;
        await this.wait(visualBotDelay(this.speed, this.actionCount, this.clientId));
        if (!this.running) break;
        await this.waitForVisualIdle();
        if (!this.running) break;
        const latest = this.getCurrent();
        if (!latest || latest.state.status === 'finished') break;
        const candidate = this.nextCandidate(latest);
        if (this.waitingForClock) { this.onStatus('P1-Client-Bot: Karten werden ausgeteilt'); continue; }
        if (!candidate) { this.onStatus('P1-Client-Bot findet keinen weiteren Zug');break; }
        this.onStatus(`P1-Client-Bot: ${candidate.kind}`);
        const response = await this.sendIntent(candidate.kind, candidate.payload);
        if (!this.running) break;
        if (response?.kind === 'ack') this.rememberAccepted(candidate);
        else if (response?.kind === 'reject') this.rejectedSet(latest).add(candidateSignature(candidate));
        this.actionCount += 1;
        await this.waitForVisualIdle();
      }
    } catch (error) {
      if (this.running) this.onStatus(`P1-Client-Bot gestoppt: ${error.message}`);
    } finally {
      const wasRunning = this.running;
      this.running = false;
      if (wasRunning) this.onStop('completed');
    }
  }
}
