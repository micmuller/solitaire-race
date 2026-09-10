'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { acquireDatabaseLock, readDatabaseLock } = require('../server/databaseLock');
const { ProfileAdmin, manifestPathFor } = require('../server/profileAdmin');
const { ProfileStore } = require('../server/profileStore');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'highnoon-admin-'));
  const databasePath = path.join(directory, 'profiles.sqlite');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new ProfileStore({ databasePath });
  const alice = store.openSession({ nickname: 'Alice Test' });
  const bob = store.openSession({ nickname: 'Bob Test' });
  store.recordMatch({
    resultId: 'mr-admin-test',
    matchId: 'm-admin-test',
    seed: 'ADMIN-SEED',
    mode: 'split',
    endedReason: 'completed',
    winner: 'p1',
    endedAt: '2026-09-06T14:00:00.000Z',
    players: {
      p1: { playerId: alice.player.playerId, nickname: alice.player.nickname, score: 24 },
      p2: { playerId: bob.player.playerId, nickname: bob.player.nickname, score: 17 }
    }
  });
  store.close();
  return { directory, databasePath, alice, bob };
}

test('ProfileAdmin lists profiles and creates a consistent backup', async (t) => {
  const { directory, databasePath } = fixture(t);
  const admin = new ProfileAdmin({ databasePath, backupDirectory: path.join(directory, 'backups') });
  const profiles = admin.listProfiles();
  assert.deepEqual(profiles.map((profile) => profile.nickname).sort(), ['Alice Test', 'Bob Test']);
  assert.ok(profiles.every((profile) => profile.sessionCount === 1));
  assert.ok(profiles.every((profile) => profile.matchCount === 1));
  assert.deepEqual(admin.integrityCheck(), ['ok']);

  const backupPath = await admin.createBackup({ suffix: 'test' });
  assert.equal(fs.existsSync(backupPath), true);
  assert.equal(fs.existsSync(manifestPathFor(backupPath)), true);
  const verified = admin.verifyBackup(backupPath);
  assert.equal(verified.integrity[0], 'ok');
  assert.equal(verified.foreignKeyViolations, 0);
  assert.equal(verified.schemaVersion, 2);
  assert.match(verified.sha256, /^[a-f0-9]{64}$/);
  const backupAdmin = new ProfileAdmin({ databasePath: backupPath });
  assert.deepEqual(backupAdmin.listProfiles().map((profile) => profile.nickname).sort(), ['Alice Test', 'Bob Test']);
});

test('ProfileAdmin restores a verified backup atomically and creates a safety backup', async (t) => {
  const { directory, databasePath, alice } = fixture(t);
  const backupDirectory = path.join(directory, 'backups');
  const admin = new ProfileAdmin({ databasePath, backupDirectory });
  const backupPath = await admin.createBackup({ suffix: 'migration' });

  const writable = admin.open({ readOnly: false });
  writable.prepare('UPDATE players SET nickname = ? WHERE player_id = ?').run('Changed After Backup', alice.player.playerId);
  writable.close();
  assert.equal(admin.profileDetails(alice.player.playerId).nickname, 'Changed After Backup');

  await assert.rejects(
    admin.restoreBackup({ backupPath, confirmedTarget: 'not-the-target' }),
    (error) => error.code === 'RESTORE_CONFIRMATION_REQUIRED'
  );
  const restored = await admin.restoreBackup({ backupPath, confirmedTarget: admin.databasePath });
  assert.equal(restored.integrity, 'ok');
  assert.equal(restored.schemaVersion, 2);
  assert.equal(fs.existsSync(restored.safetyBackupPath), true);
  assert.equal(fs.existsSync(manifestPathFor(restored.safetyBackupPath)), true);
  assert.equal(admin.profileDetails(alice.player.playerId).nickname, 'Alice Test');
});

test('ProfileAdmin rejects a changed backup and blocks restore while the server owns the database', async (t) => {
  const { directory, databasePath } = fixture(t);
  const admin = new ProfileAdmin({ databasePath, backupDirectory: path.join(directory, 'backups') });
  const backupPath = await admin.createBackup({ suffix: 'tamper-test' });
  fs.appendFileSync(backupPath, 'changed');
  assert.throws(
    () => admin.verifyBackup(backupPath),
    (error) => error.code === 'BACKUP_MANIFEST_MISMATCH'
  );

  const cleanBackup = await admin.createBackup({ suffix: 'lock-test' });
  const release = acquireDatabaseLock(databasePath, 'vNext server');
  t.after(release);
  await assert.rejects(
    admin.restoreBackup({ backupPath: cleanBackup, confirmedTarget: admin.databasePath }),
    (error) => error.code === 'DATABASE_IN_USE'
  );
});

test('ProfileAdmin backs up then deletes a profile while retaining anonymous match history', async (t) => {
  const { directory, databasePath, alice, bob } = fixture(t);
  const admin = new ProfileAdmin({ databasePath, backupDirectory: path.join(directory, 'backups') });
  const result = await admin.deleteProfile(alice.player.playerId);
  assert.equal(result.integrity, 'ok');
  assert.equal(fs.existsSync(result.backupPath), true);
  assert.equal(admin.profileDetails(alice.player.playerId), null);
  assert.equal(admin.profileDetails(bob.player.playerId).gamesPlayed, 1);

  const database = admin.open();
  const retained = database.prepare(`
    SELECT nickname, player_id FROM match_player_results
    WHERE result_key = 'mr-admin-test' AND seat = 'p1'
  `).get();
  database.close();
  assert.equal(retained.nickname, 'Alice Test');
  assert.equal(retained.player_id, null);
});

test('database lock blocks profile deletion while the server owns the database', async (t) => {
  const { directory, databasePath, alice } = fixture(t);
  const release = acquireDatabaseLock(databasePath, 'vNext server');
  t.after(release);
  assert.equal(readDatabaseLock(databasePath).active, true);
  const admin = new ProfileAdmin({ databasePath, backupDirectory: path.join(directory, 'backups') });
  await assert.rejects(
    admin.deleteProfile(alice.player.playerId),
    (error) => error.code === 'DATABASE_IN_USE'
  );
  assert.notEqual(admin.profileDetails(alice.player.playerId), null);
});


test('Linux lock detects PID reuse after container restart', { skip: process.platform !== 'linux' }, (t) => {
  const { databasePath } = fixture(t);
  const release = acquireDatabaseLock(databasePath, 'old container');
  const record = readDatabaseLock(databasePath);
  assert.ok(record.processIdentity);
  assert.equal(record.active, true);
  fs.writeFileSync(record.lockPath, JSON.stringify({ ...record, processIdentity: 'previous-boot:1' }));
  assert.equal(readDatabaseLock(databasePath).active, false);
  const releaseNew = acquireDatabaseLock(databasePath, 'new container');
  release();
  assert.equal(readDatabaseLock(databasePath).active, true);
  releaseNew();
  assert.equal(readDatabaseLock(databasePath), null);
});
