'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { backup, DatabaseSync } = require('node:sqlite');
const { acquireDatabaseLock } = require('./databaseLock');

function backupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

class ProfileAdmin {
  constructor({ databasePath, backupDirectory } = {}) {
    if (!databasePath || databasePath === ':memory:') throw new TypeError('a file database path is required');
    this.databasePath = path.resolve(databasePath);
    this.backupDirectory = path.resolve(backupDirectory || path.join(path.dirname(this.databasePath), 'backups'));
  }

  open({ readOnly = true } = {}) {
    if (!fs.existsSync(this.databasePath)) throw new Error(`database not found: ${this.databasePath}`);
    const database = new DatabaseSync(this.databasePath, { readOnly });
    database.exec('PRAGMA foreign_keys = ON;');
    const schema = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'players'").get();
    if (!schema) {
      database.close();
      throw new Error('database does not contain the HighNoon profile schema');
    }
    return database;
  }

  listProfiles() {
    const database = this.open();
    try {
      return database.prepare(`
        SELECT p.player_id, p.nickname, p.games_played, p.games_won, p.total_score,
               p.best_score, p.last_game_at, p.created_at, p.last_seen_at,
               COUNT(DISTINCT s.session_id) AS session_count,
               COUNT(DISTINCT pr.result_key) AS match_count
        FROM players p
        LEFT JOIN player_sessions s ON s.player_id = p.player_id
        LEFT JOIN match_player_results pr ON pr.player_id = p.player_id
        GROUP BY p.player_id
        ORDER BY p.last_seen_at DESC, p.nickname COLLATE NOCASE ASC
      `).all().map((row) => ({
        playerId: row.player_id,
        nickname: row.nickname,
        gamesPlayed: Number(row.games_played),
        gamesWon: Number(row.games_won),
        totalScore: Number(row.total_score),
        bestScore: Number(row.best_score),
        lastGameAt: row.last_game_at || null,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        sessionCount: Number(row.session_count),
        matchCount: Number(row.match_count)
      }));
    } finally {
      database.close();
    }
  }

  profileDetails(playerId) {
    return this.listProfiles().find((profile) => profile.playerId === playerId) || null;
  }

  integrityCheck() {
    const database = this.open();
    try {
      return database.prepare('PRAGMA integrity_check;').all().map((row) => row.integrity_check);
    } finally {
      database.close();
    }
  }

  async createBackup({ suffix = 'manual' } = {}) {
    fs.mkdirSync(this.backupDirectory, { recursive: true });
    const parsed = path.parse(this.databasePath);
    const destination = path.join(
      this.backupDirectory,
      `${parsed.name}-${backupTimestamp()}-${suffix}${parsed.ext || '.sqlite'}`
    );
    const source = this.open();
    try {
      await backup(source, destination);
    } finally {
      source.close();
    }
    return destination;
  }

  async deleteProfile(playerId) {
    const releaseLock = acquireDatabaseLock(this.databasePath, 'HighNoon profile admin');
    try {
      const preview = this.profileDetails(playerId);
      if (!preview) {
        const error = new Error(`profile not found: ${playerId}`);
        error.code = 'PROFILE_NOT_FOUND';
        throw error;
      }
      const backupPath = await this.createBackup({ suffix: 'before-profile-delete' });
      const database = this.open({ readOnly: false });
      try {
        database.exec('BEGIN IMMEDIATE;');
        try {
          const result = database.prepare('DELETE FROM players WHERE player_id = ?').run(playerId);
          if (result.changes !== 1) throw new Error('profile changed before deletion');
          database.exec('COMMIT;');
        } catch (error) {
          database.exec('ROLLBACK;');
          throw error;
        }
        const integrity = database.prepare('PRAGMA integrity_check;').all().map((row) => row.integrity_check);
        if (integrity.length !== 1 || integrity[0] !== 'ok') {
          const error = new Error(`integrity check failed: ${integrity.join(', ')}`);
          error.code = 'INTEGRITY_CHECK_FAILED';
          throw error;
        }
      } finally {
        database.close();
      }
      return { profile: preview, backupPath, integrity: 'ok' };
    } finally {
      releaseLock();
    }
  }
}

module.exports = { ProfileAdmin, backupTimestamp };
