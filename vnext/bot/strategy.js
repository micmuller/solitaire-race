'use strict';

// Pure visible-information evaluation, shared by Node and the Pixi build.
// No simulation of unknown flips/draws and no access to stock card values.
function normalizeDifficulty(value) {
  return ['easy', 'medium', 'hard'].includes(value) ? value : 'medium';
}

function progressKey(current) {
  const state = current.state;
  return `${state.foundations.reduce((n, f) => n + f.cards.length, 0)}|${Object.values(state.players)
    .map(p => p.tableau.reduce((n, cards) => n + cards.filter(c => c.faceDown).length, 0)).join('|')}`;
}

function attentionHash(value) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(value)) hash = Math.imul(hash ^ byte, 16777619);
  return hash >>> 0;
}

function shouldReserveProgress(current, botId, candidates, difficulty, now = Date.now()) {
  // Only the shared deal barrier; never tactical clock camping.
  const clock = current?.progressClock;
  return Number.isFinite(clock?.dealEndsAt) && clock.dealEndsAt > clock.serverNow + Math.max(0, now - current.clockReceivedAt);
}

function evaluateCandidate(current, botId, candidate, difficulty) {
  const { state } = current;
  const player = state.players[botId];
  const { kind, payload } = candidate;
  if (kind === 'draw') return 0;
  if (kind === 'recycle') return -1;
  if (kind === 'flip') return difficulty === 'easy' ? 20 : 45;
  const source = payload.source.zone === 'tableau' ? player.tableau[payload.source.index] : player.waste;
  const count = kind === 'tableauMove' ? payload.count : 1;
  const card = source[source.length - count];
  if (!card || card.faceDown) return -1000;
  const remaining = source.length - count;
  const exposed = remaining > 0 ? source[remaining - 1] : null;
  let score = kind === 'foundationMove' ? 25 + card.rank * 2 : 3;
  if (difficulty === 'easy') return score;
  score = kind === 'foundationMove' ? 60 + card.rank * 2 : -5;
  if (exposed?.faceDown) score += 65;
  if (payload.source.zone === 'waste') score += 35;
  if (payload.source.zone === 'tableau' && remaining === 0) {
    // Moving a whole king column to another empty column gains nothing.
    const emptyTarget = kind === 'tableauMove' && player.tableau[payload.target.index].length === 0;
    const hasKing = [player.waste.at(-1), ...player.tableau.map(p => p.find(c => !c.faceDown))]
      .some(c => c && !c.faceDown && c.rank === 13 && c !== card);
    score += emptyTarget ? -20 : hasKing ? 25 : 0;
  }
  if (difficulty !== 'hard') return score;
  if (exposed?.faceDown) score += source.filter(c => c.faceDown).length * 5;

  if (exposed && !exposed.faceDown) {
    const red = c => c.suit === 'D' || c.suit === 'H';
    const canRelocate = player.tableau.some((pile, index) => {
      if (payload.source.zone === 'tableau' && index === payload.source.index) return false;
      // Destination top after this move, not its obsolete old top.
      const top = kind === 'tableauMove' && index === payload.target.index ? source.at(-1) : pile.at(-1);
      return top && !top.faceDown && top.rank === exposed.rank + 1 && red(top) !== red(exposed);
    });
    if (canRelocate) score += 24;
  }

  // One visible follow-up: can the newly exposed card score next?
  // Foundation target selection remains exclusively server-authoritative.
  if (exposed && !exposed.faceDown) {
    const movedIndex = kind === 'foundationMove' ? state.foundations.findIndex(f =>
      f.suit === card.suit && (f.cards.at(-1)?.rank || 0) === card.rank - 1) : -1;
    const canFollow = state.foundations.some((f, index) => {
      let rank = f.cards.at(-1)?.rank || 0;
      if (index === movedIndex) rank = card.rank;
      return f.suit === exposed.suit && exposed.rank === rank + 1;
    });
    if (canFollow) score += 18 + exposed.rank;
  }
  if (kind === 'foundationMove') {
    const opponent = state.players[botId === 'p1' ? 'p2' : 'p1'];
    const tops = opponent ? [opponent.waste.at(-1), ...opponent.tableau.map(p => p.at(-1))] : [];
    const opensOpponent = tops.some(c => c && !c.faceDown && c.suit === card.suit && c.rank === card.rank + 1);
    const alreadyOpen = state.foundations.some(f => f.suit === card.suit && f.cards.at(-1)?.rank === card.rank);
    if (opensOpponent && !alreadyOpen) score -= 4;
  }
  return score;
}

function rankCandidates(current, botId, candidates, difficulty = 'medium') {
  const level = normalizeDifficulty(difficulty);
  // Existing seed-based tie ordering is retained. Easy deliberately ignores
  // exposure and tactical follow-ups instead of choosing arbitrary bad moves.
  const ranked = candidates.map((candidate, index) => ({ candidate, index,
    score: evaluateCandidate(current, botId, candidate, level) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.candidate);
  // A novice sometimes overlooks an available move and draws too early.
  // It never resigns, emits an illegal action, or uses hidden card identities.
  if (level === 'easy' && attentionHash(`${current.state.seed}|${botId}|${current.rev}|attention`) % 4 === 0) {
    const draw = ranked.findIndex(c => c.kind === 'draw');
    if (draw > 0) ranked.unshift(...ranked.splice(draw, 1));
  }
  return ranked;
}

module.exports = { normalizeDifficulty, evaluateCandidate, rankCandidates, progressKey, attentionHash, shouldReserveProgress };
