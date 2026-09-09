'use strict';

// Offline equal-turn experiment: never opens a server or writes player history.
const { BotActor, speedDelay } = require('./runner');
const { MatchSession } = require('../server/matchSession');
const { PROTOCOL_VERSION } = require('../core');

function play(seed, mode, levels, maxActions = 1600, timing = 'equal') {
  let now = 0;
  const equal = timing.startsWith('equal');
  const session = new MatchSession({ matchId: 'comparison', seed, mode,
    progressLimitMinutes: timing.endsWith('no-clock') ? 0 : 2, now: () => now });
  let current = session.current;
  const seq = [0,0];
  const nextAt = levels.map((level, index) => equal ? 750 * (index + 1) : speedDelay(level, 0, `p${index + 1}`));
  const actors = ['p1','p2'].map((clientId,index) => new BotActor({
    client: { clientId, current }, difficulty: levels[index], now: () => now
  }));
  let waits=0;
  for (let turn = 0; turn < 20000 && current.rev < maxActions && now < 7200000 && current.state.status !== 'finished'; turn++) {
    const playerIndex = nextAt[0] <= nextAt[1] ? 0 : 1;
    now = nextAt[playerIndex];
    nextAt[playerIndex] += equal ? 1500 : speedDelay(levels[playerIndex], seq[playerIndex] + 1, `p${playerIndex + 1}`);
    session.expireIfDue();
    current = session.current;
    if (current.state.status === 'finished') break;
    const actor = actors[playerIndex];
    actor.client.current = { ...current, progressClock: session.progressClock(), clockReceivedAt: now };
    const action = actor.nextCandidate();
    if (!action) {
      if (actor.waitingForClock) {
        waits++;
        nextAt[playerIndex] = session.deadlines[actor.client.clientId] - (levels[playerIndex] === 'hard' ? 12000 : 30000);
      }
      continue;
    }
    const next = session.process(actor.client.clientId, { ...action, matchId: session.matchId,
      clientId: actor.client.clientId, protocolVersion: PROTOCOL_VERSION, seq: seq[playerIndex]++, baseRev: current.rev }).response;
    if (next.kind !== 'ack') throw new Error(`Unexpected ${JSON.stringify(next)}`);
    actor.rememberAccepted(action);
    current = session.current;
    const other=1-playerIndex;
    if (actors[other].waitingForClock) nextAt[other]=Math.min(nextAt[other],now+(equal?1500:speedDelay(levels[other],seq[other],`p${other+1}`)));
  }
  return { winner: current.state.winner || null, rev: current.rev, reason: current.state.endedReason, waits, durationMs: now,
    hidden: ['p1','p2'].map(id => current.state.players[id].tableau.flat().filter(c => c.faceDown).length),
    scores: ['p1','p2'].map(id=>current.state.players[id].score) };
}

function compare(seedCount = 8, prefix = 'TASK246', timing = 'equal') {
  const rows = [];
  for (const mode of ['split','shared']) for (const pair of [['easy','medium'],['medium','hard'],['easy','hard']]) {
    const row = { mode, timing, pair, games: seedCount * 2, wins: [0,0], unfinished: 0, points: [0,0], hidden: [0,0], reasons: {} };
    for (let seed = 0; seed < seedCount; seed++) for (const swap of [false,true]) {
      const levels = swap ? [...pair].reverse() : pair;
      const result = play(`${prefix}-${seed}`,mode,levels,1600,timing);
      row.reasons[result.reason || 'action-limit'] = (row.reasons[result.reason || 'action-limit'] || 0) + 1;
      if (result.winner) row.wins[pair.indexOf(levels[result.winner === 'p1' ? 0 : 1])]++;
      else row.unfinished++;
      result.scores.forEach((score,index)=>{ row.points[pair.indexOf(levels[index])] += score; });
      result.hidden.forEach((count,index)=>{ row.hidden[pair.indexOf(levels[index])] += count; });
    }
    rows.push(row);
  }
  return rows;
}
if (require.main === module) console.log(JSON.stringify(compare(Number(process.argv[2] || 8),process.argv[3],process.argv[4]),null,2));
module.exports = { play, compare };
