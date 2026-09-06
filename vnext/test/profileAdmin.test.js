'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { acquireDatabaseLock, readDatabaseLock } = require('../server/databaseLock');
const { ProfileAdmin } = require('../server/profileAdmin');
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
  const backupAdmin = new ProfileAdmin({ databasePath: backupPath });
  assert.deepEqual(backupAdmin.listProfiles().map((profile) => profile.nickname).sort(), ['Alice Test', 'Bob Test']);
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
