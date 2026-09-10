'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ProfileStore } = require('../server/profileStore');
const { ProfileAdmin } = require('../server/profileAdmin');
test('deployment backup atomically publishes and restores a verified profile snapshot', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'highnoon-deploy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const databasePath = path.join(root, 'live.sqlite');
  const store = new ProfileStore({ databasePath });
  t.after(() => store.close());
  const opened = store.openSession({ nickname: 'Backup test' });
  const backupRoot = path.join(root, 'backups');
  const env = { ...process.env, VNEXT_PROFILE_DATABASE: databasePath, BACKUP_ROOT: backupRoot, RELEASE_REVISION: 'a'.repeat(40) };
  const script = path.resolve(__dirname, '../../deploy/highnoon-beta/backup.cjs');
  const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(fs.readdirSync(backupRoot).length, 1);
  assert.ok(!path.basename(output.backupDirectory).startsWith('.'));
  const files = fs.readdirSync(output.backupDirectory);
  const backup = path.join(output.backupDirectory, files.find(file => file.endsWith('.sqlite')));
  assert.equal(fs.statSync(backup).mode & 0o777, 0o600);
  const release = JSON.parse(fs.readFileSync(path.join(output.backupDirectory, 'release.json')));
  assert.equal(release.revision, env.RELEASE_REVISION);
  const admin = new ProfileAdmin({ databasePath: path.join(root, 'restored.sqlite') });
  assert.equal(admin.verifyBackup(backup).sha256, release.sha256);
  await admin.restoreBackup({ backupPath: backup, confirmedTarget: admin.databasePath });
  const restored = new ProfileStore({ databasePath: admin.databasePath });
  try { assert.equal(restored.requirePlayer(opened.sessionToken).nickname, 'Backup test'); }
  finally { restored.close(); }
  const failed = spawnSync(process.execPath, [script], { env: { ...env, RELEASE_REVISION: '' }, encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.equal(fs.readdirSync(backupRoot).length, 1);
});
