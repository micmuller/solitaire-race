'use strict';

const crypto = require('node:crypto');
const { MODES } = require('../core');

const PLAYER_HISTORY_TEMPLATE = Object.freeze({
  gamesPlayed: 0,
  gamesWon: 0,
  totalScore: 0,
  bestScore: 0,
  lastGameAt: null
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeNickname(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);
}

function publicPlayer(player) {
  return {
    playerId: player.playerId,
    sessionId: player.sessionId,
    nickname: player.nickname,
    stats: { ...player.stats }
  };
}

function publicSeat(seat) {
  if (!seat) return null;
  return {
    playerId: seat.playerId,
    sessionId: seat.sessionId,
    nickname: seat.nickname
  };
}

function publicGame(game) {
  return {
    gameId: game.gameId,
    matchId: game.matchId,
    name: game.name,
    seed: game.seed,
    mode: game.mode,
    status: game.status,
    players: {
      p1: publicSeat(game.players.p1),
      p2: publicSeat(game.players.p2)
    },
    hostPlayerId: game.players.p1?.playerId || null,
    guestPlayerId: game.players.p2?.playerId || null,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    historyPrepared: true
  };
}

class LobbyStore {
  constructor({ idFactory = () => crypto.randomUUID(), clock = nowIso } = {}) {
    this.idFactory = idFactory;
    this.clock = clock;
    this.players = new Map();
    this.games = new Map();
    this.matchToGame = new Map();
  }

  createOrUpdatePlayer({ sessionId, nickname }) {
    const normalizedNickname = normalizeNickname(nickname);
    if (!normalizedNickname) {
      const error = new Error('nickname is required');
      error.statusCode = 400;
      throw error;
    }
    const resolvedSessionId = typeof sessionId === 'string' && sessionId.length > 0
      ? sessionId
      : `ps-${this.idFactory()}`;
    const existing = this.players.get(resolvedSessionId);
    const player = existing || {
      playerId: `pl-${this.idFactory()}`,
      sessionId: resolvedSessionId,
      nickname: normalizedNickname,
      stats: { ...PLAYER_HISTORY_TEMPLATE },
      createdAt: this.clock()
    };
    player.nickname = normalizedNickname;
    player.lastSeenAt = this.clock();
    this.players.set(resolvedSessionId, player);
    return publicPlayer(player);
  }

  requirePlayer(sessionId) {
    const player = this.players.get(sessionId);
    if (!player) {
      const error = new Error('lobby session not found');
      error.statusCode = 404;
      throw error;
    }
    player.lastSeenAt = this.clock();
    return player;
  }

  listGames() {
    return [...this.games.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(publicGame);
  }

  createGame({ sessionId, matchId, seed, mode, name }) {
    const host = this.requirePlayer(sessionId);
    if (typeof matchId !== 'string' || matchId.length === 0) {
      const error = new Error('matchId is required');
      error.statusCode = 400;
      throw error;
    }
    if (typeof seed !== 'string' || seed.length === 0 || !MODES.includes(mode)) {
      const error = new Error('seed and mode (split|shared) are required');
      error.statusCode = 400;
      throw error;
    }
    const gameId = `g-${this.idFactory()}`;
    const timestamp = this.clock();
    const game = {
      gameId,
      matchId,
      name: String(name || `${host.nickname}s Spiel`).trim().slice(0, 48) || `${host.nickname}s Spiel`,
      seed,
      mode,
      status: 'waiting',
      players: {
        p1: publicSeat(host),
        p2: null
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      history: {
        resultRecorded: false,
        scoreSnapshot: null
      }
    };
    this.games.set(gameId, game);
    this.matchToGame.set(matchId, gameId);
    return publicGame(game);
  }

  joinGame({ gameId, sessionId }) {
    const game = this.games.get(gameId);
    if (!game) {
      const error = new Error('lobby game not found');
      error.statusCode = 404;
      throw error;
    }
    if (game.status === 'finished') {
      const error = new Error('lobby game is already finished');
      error.statusCode = 409;
      throw error;
    }
    const guest = this.requirePlayer(sessionId);
    if (game.players.p1?.sessionId === guest.sessionId) {
      return { game: publicGame(game), role: 'p1', matchId: game.matchId };
    }
    if (game.players.p2 && game.players.p2.sessionId !== guest.sessionId) {
      const error = new Error('p2 seat is already occupied');
      error.statusCode = 409;
      throw error;
    }
    game.players.p2 = publicSeat(guest);
    game.status = 'active';
    game.updatedAt = this.clock();
    return { game: publicGame(game), role: 'p2', matchId: game.matchId };
  }

  leaveGame({ gameId, sessionId }) {
    const game = this.games.get(gameId);
    if (!game) {
      const error = new Error('lobby game not found');
      error.statusCode = 404;
      throw error;
    }
    if (game.players.p2?.sessionId === sessionId) {
      game.players.p2 = null;
      game.status = 'waiting';
      game.updatedAt = this.clock();
    }
    return publicGame(game);
  }

  endGameByMatch({ matchId, sessionId }) {
    const game = this.gameByMatchId(matchId);
    if (!game) {
      const error = new Error('lobby game not found');
      error.statusCode = 404;
      throw error;
    }
    if (game.players.p1?.sessionId !== sessionId) {
      const error = new Error('only p1 can end the lobby game');
      error.statusCode = 403;
      throw error;
    }
    game.status = 'finished';
    game.updatedAt = this.clock();
    return publicGame(game);
  }

  markMatchActive(matchId) {
    const game = this.gameByMatchId(matchId);
    if (!game || game.status === 'finished') return null;
    game.status = game.players.p2 ? 'active' : 'waiting';
    game.updatedAt = this.clock();
    return publicGame(game);
  }

  markMatchFinished(matchId, state) {
    const game = this.gameByMatchId(matchId);
    if (!game || game.status === 'finished') return null;
    game.status = 'finished';
    game.updatedAt = this.clock();
    game.history.resultRecorded = false;
    game.history.scoreSnapshot = state?.players ? {
      p1: state.players.p1?.score || 0,
      p2: state.players.p2?.score || 0,
      winner: state.winner || null,
      endedReason: state.endedReason || null
    } : null;
    return publicGame(game);
  }

  gameByMatchId(matchId) {
    const gameId = this.matchToGame.get(matchId);
    return gameId ? this.games.get(gameId) : null;
  }
}

module.exports = {
  LobbyStore,
  normalizeNickname
};
