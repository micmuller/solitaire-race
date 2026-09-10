'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { normalizeNickname } = require('./lobbyStore');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_OFFSET = 100_000;
const MATCH_KINDS = Object.freeze(['human-vs-human', 'human-vs-bot', 'bot-vs-bot']);

function nowIso() {
  return new Date().toISOString();
}

function boundedLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_LIMIT) : fallback;
}

function boundedOffset(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, MAX_OFFSET) : 0;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function statsFromRow(row) {
  return {
    gamesPlayed: Number(row.games_played),
    gamesWon: Number(row.games_won),
    totalScore: Number(row.total_score),
    bestScore: Number(row.best_score),
    lastGameAt: row.last_game_at || null
  };
}

function publicPlayer(row) {
  return {
    playerId: row.player_id,
    sessionId: row.session_id,
    nickname: row.nickname,
    stats: statsFromRow(row),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

class ProfileStore {
  constructor({
    databasePath = ':memory:',
    clock = nowIso,
    idFactory = () => crypto.randomUUID(),
    tokenFactory = () => `hs_${crypto.randomBytes(32).toString('base64url')}`
  } = {}) {
    if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
    this.databasePath = databasePath;
    this.clock = clock;
    this.idFactory = idFactory;
    this.tokenFactory = tokenFactory;
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (databasePath !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    const current = this.database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get().version;
    if (current < 1) {
      const appliedAt = this.clock();
      this.database.exec('BEGIN IMMEDIATE;');
      try {
        this.database.exec(`
          CREATE TABLE players (
            player_id TEXT PRIMARY KEY,
            nickname TEXT NOT NULL,
            games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
            games_won INTEGER NOT NULL DEFAULT 0 CHECK (games_won >= 0),
            total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score >= 0),
            best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score >= 0),
            last_game_at TEXT,
            created_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE player_sessions (
            session_id TEXT PRIMARY KEY,
            player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            revoked_at TEXT
          );
          CREATE TABLE match_results (
            result_key TEXT PRIMARY KEY,
            match_id TEXT NOT NULL,
            seed TEXT NOT NULL,
            mode TEXT NOT NULL CHECK (mode IN ('split', 'shared')),
            ended_reason TEXT NOT NULL CHECK (ended_reason IN ('completed', 'resign', 'inactivity')),
            winner_seat TEXT NOT NULL CHECK (winner_seat IN ('p1', 'p2')),
            ended_at TEXT NOT NULL,
            recorded_at TEXT NOT NULL
          );
          CREATE TABLE match_player_results (
            result_key TEXT NOT NULL REFERENCES match_results(result_key) ON DELETE CASCADE,
            seat TEXT NOT NULL CHECK (seat IN ('p1', 'p2')),
            player_id TEXT REFERENCES players(player_id) ON DELETE SET NULL,
            nickname TEXT NOT NULL,
            score INTEGER NOT NULL CHECK (score >= 0),
            won INTEGER NOT NULL CHECK (won IN (0, 1)),
            PRIMARY KEY (result_key, seat)
          );
          CREATE INDEX match_results_ended_at_idx ON match_results(ended_at DESC);
          CREATE INDEX match_player_results_player_idx ON match_player_results(player_id, result_key);
        `);
        this.database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(1, appliedAt);
        this.database.exec('COMMIT;');
      } catch (error) {
        this.database.exec('ROLLBACK;');
        throw error;
      }
    }
    if (current < 2) {
      const appliedAt = this.clock();
      this.database.exec('BEGIN IMMEDIATE;');
      try {
        this.database.exec(`
          ALTER TABLE match_results ADD COLUMN match_kind TEXT NOT NULL DEFAULT 'human-vs-human'
            CHECK (match_kind IN ('human-vs-human', 'human-vs-bot', 'bot-vs-bot'));
        `);
        this.database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(2, appliedAt);
        this.database.exec('COMMIT;');
      } catch (error) {
        this.database.exec('ROLLBACK;');
        throw error;
      }
    }
  }

  playerRowByToken(sessionToken) {
    if (typeof sessionToken !== 'string' || sessionToken.length < 16) return null;
    return this.database.prepare(`
      SELECT p.*, s.session_id
      FROM player_sessions s
      JOIN players p ON p.player_id = s.player_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL
    `).get(tokenHash(sessionToken)) || null;
  }

  openSession({ sessionToken, nickname }) {
    if (sessionToken) {
      const existing = this.playerRowByToken(sessionToken);
      if (!existing) {
        const error = new Error('invalid or expired session token');
        error.statusCode = 401;
        throw error;
      }
      const timestamp = this.clock();
      this.database.prepare('UPDATE player_sessions SET last_seen_at = ? WHERE session_id = ?').run(timestamp, existing.session_id);
      this.database.prepare('UPDATE players SET last_seen_at = ? WHERE player_id = ?')
        .run(timestamp, existing.player_id);
      return { created: false, sessionToken, player: this.playerById(existing.player_id) };
    }

    const normalizedNickname = normalizeNickname(nickname);
    if (!normalizedNickname) {
      const error = new Error('nickname is required');
      error.statusCode = 400;
      throw error;
    }

    const timestamp = this.clock();
    const playerId = `pl-${this.idFactory()}`;
    const sessionId = `ps-${this.idFactory()}`;
    const createdToken = this.tokenFactory();
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      this.database.prepare(`
        INSERT INTO players(player_id, nickname, created_at, last_seen_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(playerId, normalizedNickname, timestamp, timestamp, timestamp);
      this.database.prepare(`
        INSERT INTO player_sessions(session_id, player_id, token_hash, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(sessionId, playerId, tokenHash(createdToken), timestamp, timestamp);
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
    return { created: true, sessionToken: createdToken, player: this.playerById(playerId) };
  }

  requirePlayer(sessionToken) {
    const row = this.playerRowByToken(sessionToken);
    if (!row) {
      const error = new Error('invalid or expired session token');
      error.statusCode = 401;
      throw error;
    }
    const timestamp = this.clock();
    this.database.prepare('UPDATE player_sessions SET last_seen_at = ? WHERE session_id = ?').run(timestamp, row.session_id);
    this.database.prepare('UPDATE players SET last_seen_at = ? WHERE player_id = ?').run(timestamp, row.player_id);
    return this.playerById(row.player_id);
  }

  updateNickname(sessionToken, nickname) {
    const normalizedNickname = normalizeNickname(nickname);
    if (!normalizedNickname) {
      const error = new Error('nickname is required');
      error.statusCode = 400;
      throw error;
    }
    const player = this.requirePlayer(sessionToken);
    const timestamp = this.clock();
    this.database.prepare('UPDATE players SET nickname = ?, updated_at = ? WHERE player_id = ?')
      .run(normalizedNickname, timestamp, player.playerId);
    return this.playerById(player.playerId);
  }

  playerById(playerId) {
    const row = this.database.prepare(`
      SELECT p.*, s.session_id
      FROM players p
      JOIN player_sessions s ON s.player_id = p.player_id AND s.revoked_at IS NULL
      WHERE p.player_id = ?
      ORDER BY s.created_at DESC
      LIMIT 1
    `).get(playerId);
    return row ? publicPlayer(row) : null;
  }

  leaderboard(limit, offset = 0) {
    return this.database.prepare(`
      SELECT player_id, nickname, games_played, games_won, total_score, best_score,
             last_game_at, created_at, last_seen_at,
             ROW_NUMBER() OVER (
               ORDER BY games_won DESC, total_score DESC, best_score DESC,
                        nickname COLLATE NOCASE ASC, player_id ASC
             ) AS rank
      FROM players
      WHERE games_played > 0
      ORDER BY rank
      LIMIT ? OFFSET ?
    `).all(boundedLimit(limit), boundedOffset(offset)).map((row) => ({
      rank: Number(row.rank),
      playerId: row.player_id,
      nickname: row.nickname,
      stats: statsFromRow(row)
    }));
  }

  leaderboardCount() {
    return Number(this.database.prepare('SELECT COUNT(*) AS count FROM players WHERE games_played > 0').get().count);
  }

  matchHistory(sessionToken, limit, offset = 0) {
    const player = this.requirePlayer(sessionToken);
    return this.database.prepare(`
      SELECT r.result_key, r.match_id, r.seed, r.mode, r.match_kind, r.ended_reason, r.winner_seat,
             r.ended_at, pr.seat, pr.score, pr.won
      FROM match_player_results pr
      JOIN match_results r ON r.result_key = pr.result_key
      WHERE pr.player_id = ?
      ORDER BY r.ended_at DESC, r.result_key DESC
      LIMIT ? OFFSET ?
    `).all(player.playerId, boundedLimit(limit), boundedOffset(offset)).map((row) => ({
      resultId: row.result_key,
      matchId: row.match_id,
      seed: row.seed,
      mode: row.mode,
      matchKind: row.match_kind,
      endedReason: row.ended_reason,
      winner: row.winner_seat,
      seat: row.seat,
      score: Number(row.score),
      won: Boolean(row.won),
      endedAt: row.ended_at
    }));
  }

  matchHistoryCount(sessionToken) {
    const player = this.requirePlayer(sessionToken);
    return Number(this.database.prepare(`
      SELECT COUNT(*) AS count FROM match_player_results WHERE player_id = ?
    `).get(player.playerId).count);
  }

  recordMatch({ resultId, matchId, seed, mode, matchKind = 'human-vs-human', endedReason, winner, players, endedAt = this.clock() }) {
    if (!resultId || !matchId || !seed || !['split', 'shared'].includes(mode)
      || !MATCH_KINDS.includes(matchKind)
      || !['completed', 'resign', 'inactivity'].includes(endedReason)
      || !['p1', 'p2'].includes(winner) || !players) {
      throw new TypeError('complete authoritative match result is required');
    }
    const recordedAt = this.clock();
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      const inserted = this.database.prepare(`
        INSERT OR IGNORE INTO match_results(
          result_key, match_id, seed, mode, match_kind, ended_reason, winner_seat, ended_at, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(resultId, matchId, seed, mode, matchKind, endedReason, winner, endedAt, recordedAt);
      if (inserted.changes === 0) {
        const existing = this.database.prepare(`
          SELECT match_id, seed, mode, match_kind, ended_reason, winner_seat, ended_at
          FROM match_results WHERE result_key = ?
        `).get(resultId);
        const identical = existing
          && existing.match_id === matchId
          && existing.seed === seed
          && existing.mode === mode
          && existing.match_kind === matchKind
          && existing.ended_reason === endedReason
          && existing.winner_seat === winner
          && existing.ended_at === endedAt;
        if (!identical) {
          const error = new Error('result id already belongs to a different match result');
          error.code = 'RESULT_ID_CONFLICT';
          throw error;
        }
        this.database.exec('ROLLBACK;');
        return false;
      }
      for (const seat of ['p1', 'p2']) {
        const entry = players[seat] || {};
        const score = Number.isSafeInteger(entry.score) && entry.score >= 0 ? entry.score : 0;
        const won = winner === seat ? 1 : 0;
        const persistedPlayer = entry.playerId ? this.playerById(entry.playerId) : null;
        this.database.prepare(`
          INSERT INTO match_player_results(result_key, seat, player_id, nickname, score, won)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(resultId, seat, persistedPlayer?.playerId || null, String(entry.nickname || seat).slice(0, 32), score, won);
        if (persistedPlayer) {
          this.database.prepare(`
            UPDATE players
            SET games_played = games_played + 1,
                games_won = games_won + ?,
                total_score = total_score + ?,
                best_score = MAX(best_score, ?),
                last_game_at = ?,
                updated_at = ?
            WHERE player_id = ?
          `).run(won, score, score, endedAt, recordedAt, persistedPlayer.playerId);
        }
      }
      this.database.exec('COMMIT;');
      return true;
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

module.exports = { MATCH_KINDS, ProfileStore, boundedLimit, boundedOffset, tokenHash };
