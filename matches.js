// matches.js
// In-memory Match Management für Solitaire HighNoon
// Phase 1: create_match / join_match

const matches = new Map(); // key = matchId, value = Match-Objekt

// Optional: Bot-Unterstützung auf Match-Ebene.
// Ein Bot wird wie ein Spieler in der players-Liste geführt, kann aber
// zusätzlich mit isBot/difficulty gekennzeichnet werden.
// v1.2: Bot erweiterungen

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
    lastGameState: null,
    botState: null,
    botStateTick: 0,
    players: [
      {
        playerId: 'p1',
        clientId: ws.__cid,
        nick: nick || 'Player 1',
        role: 'host',
        connected: true,
        isBot: false,
        difficulty: null
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
    connected: true,
    isBot: false,
    difficulty: null
  };

  match.players.push(player);
  match.status = 'ready';
  match.lastActivityAt = Date.now();

  ws.__matchId = matchId;
  ws.__playerId = playerId;

  return match;
}

function addBotToMatch(matchId, difficulty = 'easy') {
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

  const playerId = 'bot';
  const nick =
    difficulty === 'hard'   ? 'Bot-Hard'   :
    difficulty === 'medium' ? 'Bot-Medium' :
    'Bot-Easy';

  const player = {
    playerId,
    clientId: null, // Bot hängt nicht an einem echten WebSocket
    nick,
    role: match.players.length === 0 ? 'host' : 'guest',
    connected: true,
    isBot: true,
    difficulty
  };

  match.players.push(player);
  match.status = 'ready';
  match.lastActivityAt = Date.now();

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

function updateMatchGameState(matchId, gameState) {
  const match = matches.get(matchId);
  if (!match) return;
  match.lastGameState = gameState;
  match.lastActivityAt = Date.now();
}

function updateBotState(matchId, botState) {
  const match = matches.get(matchId);
  if (!match) return;
  if (!botState || typeof botState !== 'object') return;

  // Normalisierte, für den Bot relevante Sicht auf den Spielzustand speichern.
  // Erwartete Struktur (vom Client geliefert):
  // {
  //   tick: number,
  //   stockCount: number,
  //   wasteTop: { rank: number, suit: string } | null,
  //   foundation: { [suit: string]: number }, // höchste Ränge pro Farbe
  //   tableauHeights: number[],               // Kartenanzahl pro Tableau-Stack
  //   movesSinceLastFlip: number
  // }
  const prevTick = match.botState && typeof match.botState.tick === 'number'
    ? match.botState.tick
    : 0;

  const normalized = {
    tick: typeof botState.tick === 'number' ? botState.tick : prevTick + 1,
    stockCount:
      typeof botState.stockCount === 'number'
        ? botState.stockCount
        : null,
    wasteTop:
      botState.wasteTop && typeof botState.wasteTop === 'object'
        ? {
            rank: botState.wasteTop.rank ?? null,
            suit: botState.wasteTop.suit ?? null
          }
        : null,
    foundation:
      botState.foundation && typeof botState.foundation === 'object'
        ? botState.foundation
        : null,
    tableauHeights:
      Array.isArray(botState.tableauHeights)
        ? botState.tableauHeights.slice()
        : null,
    movesSinceLastFlip:
      typeof botState.movesSinceLastFlip === 'number'
        ? botState.movesSinceLastFlip
        : null
  };

  match.botState = normalized;
  match.botStateTick = normalized.tick;
  match.lastActivityAt = Date.now();
}

function getBotState(matchId) {
  const match = matches.get(matchId);
  return match ? match.botState || null : null;
}

function getMatch(matchId) {
  return matches.get(matchId) || null;
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
      connected: !!p.connected,
      isBot: !!p.isBot,
      difficulty: p.difficulty || null
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
  addBotToMatch,
  markPlayerDisconnected,
  getPublicMatchView,
  cleanupOldMatches,
  getMatch,
  updateMatchGameState,
  updateBotState,
  getBotState
};