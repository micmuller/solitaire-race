// matches.js
// In-memory Match Management für Solitaire HighNoon
// Phase 1: create_match / join_match

const matches = new Map(); // key = matchId, value = Match-Objekt

function generateMatchId() {
  // Kurzer, menschenlesbarer Code wie "DUEL4"
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function generateSeed() {
  // Ähnlich wie im Client: zufälliger String, 8 Zeichen
  return Math.random().toString(36).slice(2, 10);
}

function generateUniqueMatchId(rooms) {
  // Verhindert Kollisionen mit existierenden Matches oder Rooms
  let attempts = 0;
  while (attempts < 1000) {
    const id = generateMatchId();
    if (!matches.has(id) && !rooms.has(id)) return id;
    attempts++;
  }
  // Fallback, falls wirklich alles schiefgeht
  return `M${Date.now().toString(36).toUpperCase()}`;
}

function createMatchForClient(ws, nick, rooms) {
  const matchId = generateUniqueMatchId(rooms);
  const seed = generateSeed();
  const now = Date.now();

  const match = {
    matchId,
    seed,
    status: 'waiting', // 'waiting' | 'ready' | 'running' | 'finished'
    createdAt: now,
    lastActivityAt: now,
    players: [
      {
        playerId: 'p1',
        clientId: ws.__cid,
        nick: nick || 'Player 1',
        role: 'host',
        connected: true
      }
    ]
  };

  matches.set(matchId, match);
  ws.__matchId = matchId;
  ws.__playerId = 'p1';
  return match;
}

function joinMatchForClient(ws, matchId, nick) {
  const match = matches.get(matchId);
  if (!match) {
    const err = new Error('match_not_found');
    err.code = 'match_not_found';
    throw err;
  }
  if (match.players.length >= 2) {
    const err = new Error('match_full');
    err.code = 'match_full';
    throw err;
  }
  if (match.status === 'finished') {
    const err = new Error('match_finished');
    err.code = 'match_finished';
    throw err;
  }

  const playerId = 'p' + (match.players.length + 1);
  const player = {
    playerId,
    clientId: ws.__cid,
    nick: nick || `Player ${match.players.length + 1}`,
    role: match.players.length === 0 ? 'host' : 'guest',
    connected: true
  };

  match.players.push(player);
  match.status = 'ready';
  match.lastActivityAt = Date.now();

  ws.__matchId = matchId;
  ws.__playerId = playerId;

  return match;
}

function markPlayerDisconnected(ws) {
  const matchId = ws.__matchId;
  const playerId = ws.__playerId;
  if (!matchId || !playerId) return;
  const match = matches.get(matchId);
  if (!match) return;
  const player = match.players.find(p => p.playerId === playerId);
  if (!player) return;
  player.connected = false;
  match.lastActivityAt = Date.now();
}

function getPublicMatchView(match) {
  return {
    matchId: match.matchId,
    seed: match.seed,
    status: match.status,
    createdAt: match.createdAt,
    players: match.players.map(p => ({
      playerId: p.playerId,
      nick: p.nick,
      role: p.role,
      connected: !!p.connected
    }))
  };
}

function cleanupOldMatches(ttlMs = 60 * 60 * 1000) {
  const now = Date.now();
  let removed = 0;
  for (const [id, match] of matches.entries()) {
    if (now - match.lastActivityAt > ttlMs) {
      matches.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[MATCH] Cleaned up ${removed} old matches`);
  }
}

module.exports = {
  createMatchForClient,
  joinMatchForClient,
  markPlayerDisconnected,
  getPublicMatchView,
  cleanupOldMatches
};