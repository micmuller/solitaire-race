'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { backup, DatabaseSync } = require('node:sqlite');
const { acquireDatabaseLock } = require('./databaseLock');
const { ProfileStore } = require('./profileStore');

const BACKUP_FORMAT = 'highnoon-sqlite-backup/v1';
const CURRENT_SCHEMA_VERSION = 2;
const REQUIRED_TABLES = Object.freeze([
  'schema_migrations',
  'players',
  'player_sessions',
  'match_results',
  'match_player_results'
]);

function backupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function manifestPathFor(backupPath) {
  return `${backupPath}.manifest.json`;
}

function removeIfPresent(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

class ProfileAdmin {
  constructor({ databasePath, backupDirectory } = {}) {
    if (!databasePath || databasePath === ':memory:') throw new TypeError('a file database path is required');
    this.databasePath = path.resolve(databasePath);
    this.backupDirectory = path.resolve(backupDirectory || path.join(path.dirname(this.databasePath), 'backups'));
  }

  open({ readOnly = true } = {}) {
    return this.openPath(this.databasePath, { readOnly });
  }

  openPath(databasePath, { readOnly = true } = {}) {
    const resolved = path.resolve(databasePath);
    if (!fs.existsSync(resolved)) throw new Error(`database not found: ${resolved}`);
    const database = new DatabaseSync(resolved, { readOnly });
    database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
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
    return this.verifyDatabase(this.databasePath).integrity;
  }

  verifyDatabase(databasePath = this.databasePath) {
    const resolved = path.resolve(databasePath);
    const database = this.openPath(resolved);
    try {
      const integrity = database.prepare('PRAGMA integrity_check;').all().map((row) => row.integrity_check);
      const foreignKeyViolations = database.prepare('PRAGMA foreign_key_check;').all();
      const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
      const missingTables = REQUIRED_TABLES.filter((table) => !tables.has(table));
      const schemaVersion = missingTables.includes('schema_migrations')
        ? 0
        : Number(database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get().version);
      const valid = integrity.length === 1
        && integrity[0] === 'ok'
        && foreignKeyViolations.length === 0
        && missingTables.length === 0
        && schemaVersion > 0
        && schemaVersion <= CURRENT_SCHEMA_VERSION;
      if (!valid) {
        const error = new Error([
          `database verification failed: ${resolved}`,
          `integrity=${integrity.join(',') || 'missing'}`,
          `foreignKeys=${foreignKeyViolations.length}`,
          `missingTables=${missingTables.join(',') || 'none'}`,
          `schemaVersion=${schemaVersion}`
        ].join('; '));
        error.code = 'DATABASE_VERIFICATION_FAILED';
        throw error;
      }
      return {
        databasePath: resolved,
        integrity,
        foreignKeyViolations: foreignKeyViolations.length,
        schemaVersion,
        size: fs.statSync(resolved).size,
        sha256: sha256File(resolved)
      };
    } finally {
      database.close();
    }
  }

  verifyBackup(backupPath, { requireManifest = true } = {}) {
    const resolved = path.resolve(backupPath);
    const verification = this.verifyDatabase(resolved);
    const manifestPath = manifestPathFor(resolved);
    if (!fs.existsSync(manifestPath)) {
      if (requireManifest) {
        const error = new Error(`backup manifest not found: ${manifestPath}`);
        error.code = 'BACKUP_MANIFEST_NOT_FOUND';
        throw error;
      }
      return { ...verification, manifestPath: null, manifest: null };
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.format !== BACKUP_FORMAT
      || manifest.sha256 !== verification.sha256
      || manifest.size !== verification.size
      || manifest.schemaVersion !== verification.schemaVersion) {
      const error = new Error(`backup manifest verification failed: ${manifestPath}`);
      error.code = 'BACKUP_MANIFEST_MISMATCH';
      throw error;
    }
    return { ...verification, manifestPath, manifest };
  }

  async createBackup({ suffix = 'manual' } = {}) {
    fs.mkdirSync(this.backupDirectory, { recursive: true });
    const parsed = path.parse(this.databasePath);
    const safeSuffix = String(suffix || 'manual').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 64) || 'manual';
    const baseDestination = path.join(
      this.backupDirectory,
      `${parsed.name}-${backupTimestamp()}-${safeSuffix}${parsed.ext || '.sqlite'}`
    );
    let destination = baseDestination;
    for (let copy = 1; fs.existsSync(destination); copy += 1) {
      const extension = parsed.ext || '.sqlite';
      destination = `${baseDestination.slice(0, -extension.length)}-${copy}${extension}`;
    }
    const source = this.open();
    try {
      await backup(source, destination);
    } finally {
      source.close();
    }
    fs.chmodSync(destination, 0o600);
    const verification = this.verifyDatabase(destination);
    const manifestPath = manifestPathFor(destination);
    const manifest = {
      format: BACKUP_FORMAT,
      createdAt: new Date().toISOString(),
      sourceDatabase: path.basename(this.databasePath),
      backupFile: path.basename(destination),
      schemaVersion: verification.schemaVersion,
      size: verification.size,
      sha256: verification.sha256,
      integrity: 'ok',
      foreignKeyViolations: 0
    };
    const manifestStagingPath = `${manifestPath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(manifestStagingPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(manifestStagingPath, manifestPath);
    return destination;
  }

  async restoreBackup({ backupPath, confirmedTarget, requireManifest = true }) {
    const sourcePath = path.resolve(backupPath || '');
    if (confirmedTarget !== this.databasePath) {
      const error = new Error(`restore confirmation must exactly match target: ${this.databasePath}`);
      error.code = 'RESTORE_CONFIRMATION_REQUIRED';
      throw error;
    }
    if (sourcePath === this.databasePath) throw new Error('backup and restore target must be different files');
    const sourceVerification = this.verifyBackup(sourcePath, { requireManifest });
    const releaseLock = acquireDatabaseLock(this.databasePath, 'HighNoon profile restore');
    const stagingPath = `${this.databasePath}.restore-${crypto.randomUUID()}.tmp`;
    const previousPath = `${this.databasePath}.previous-${crypto.randomUUID()}.tmp`;
    let safetyBackupPath = null;
    let previousMoved = false;
    let replacementInstalled = false;
    try {
      fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
      if (fs.existsSync(this.databasePath)) {
        safetyBackupPath = await this.createBackup({ suffix: 'before-restore' });
      }
      const source = this.openPath(sourcePath);
      try {
        await backup(source, stagingPath);
      } finally {
        source.close();
      }
      fs.chmodSync(stagingPath, 0o600);
      this.verifyDatabase(stagingPath);

      removeIfPresent(`${this.databasePath}-wal`);
      removeIfPresent(`${this.databasePath}-shm`);
      if (fs.existsSync(this.databasePath)) {
        fs.renameSync(this.databasePath, previousPath);
        previousMoved = true;
      }
      fs.renameSync(stagingPath, this.databasePath);
      replacementInstalled = true;

      const migrated = new ProfileStore({ databasePath: this.databasePath });
      migrated.close();
      const targetVerification = this.verifyDatabase(this.databasePath);
      removeIfPresent(previousPath);
      previousMoved = false;
      return {
        backupPath: sourcePath,
        databasePath: this.databasePath,
        safetyBackupPath,
        sourceSha256: sourceVerification.sha256,
        targetSha256: targetVerification.sha256,
        schemaVersion: targetVerification.schemaVersion,
        integrity: 'ok'
      };
    } catch (error) {
      removeIfPresent(stagingPath);
      if (previousMoved) {
        if (replacementInstalled) removeIfPresent(this.databasePath);
        fs.renameSync(previousPath, this.databasePath);
      } else if (replacementInstalled) {
        removeIfPresent(this.databasePath);
      }
      throw error;
    } finally {
      removeIfPresent(stagingPath);
      releaseLock();
    }
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

module.exports = {
  BACKUP_FORMAT,
  CURRENT_SCHEMA_VERSION,
  ProfileAdmin,
  backupTimestamp,
  manifestPathFor,
  sha256File
};
