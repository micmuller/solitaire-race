 'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ProfileAdmin } = require('../../vnext/server/profileAdmin');
(async () => {
  process.umask(0o077);
  const root = process.env.BACKUP_ROOT || '/backups';
  const revision = process.env.RELEASE_REVISION;
  if (!/^[0-9a-f]{40}$/.test(revision || '')) throw new Error('RELEASE_REVISION must be a full Git SHA');
  fs.mkdirSync(root, { recursive: true });
  const staging = fs.mkdtempSync(path.join(root, '.pending-'));
  const admin = new ProfileAdmin({ databasePath: process.env.VNEXT_PROFILE_DATABASE || '/data/highnoon.sqlite', backupDirectory: staging });
  const backupPath = await admin.createBackup({ suffix: 'daily' });
  const checked = admin.verifyBackup(backupPath);
  fs.writeFileSync(path.join(staging, 'release.json'), JSON.stringify({ revision, createdAt: new Date().toISOString(), schemaVersion: checked.schemaVersion, sha256: checked.sha256 }) + '\n', { mode: 0o600 });
  const destination = path.join(root, new Date().toISOString().replace(/[:.]/g, '-') + '-' + path.basename(staging).slice(9));
  fs.renameSync(staging, destination);
  console.log(JSON.stringify({ backupDirectory: destination, sha256: checked.sha256 }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
