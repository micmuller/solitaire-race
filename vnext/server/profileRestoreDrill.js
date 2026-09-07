#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProfileAdmin } = require('./profileAdmin');
const { ProfileStore } = require('./profileStore');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'highnoon-restore-drill-'));
  const sourcePath = path.join(directory, 'm2', 'highnoon.sqlite');
  const targetPath = path.join(directory, 'linux-host-1', 'highnoon.sqlite');
  try {
    const source = new ProfileStore({ databasePath: sourcePath });
    const host = source.openSession({ nickname: 'Migration Host' });
    const guest = source.openSession({ nickname: 'Migration Guest' });
    const result = {
      resultId: 'mr-linux-migration-drill',
      matchId: 'm-linux-migration-drill',
      seed: 'LINUX-MIGRATION-DRILL',
      mode: 'shared',
      matchKind: 'human-vs-human',
      endedReason: 'completed',
      winner: 'p1',
      endedAt: '2026-09-07T12:00:00.000Z',
      players: {
        p1: { playerId: host.player.playerId, nickname: host.player.nickname, score: 42 },
        p2: { playerId: guest.player.playerId, nickname: guest.player.nickname, score: 31 }
      }
    };
    source.recordMatch(result);
    source.close();

    const sourceAdmin = new ProfileAdmin({ databasePath: sourcePath });
    const backupPath = await sourceAdmin.createBackup({ suffix: 'linux-host-1-drill' });
    const backupVerification = sourceAdmin.verifyBackup(backupPath);
    const targetAdmin = new ProfileAdmin({ databasePath: targetPath });
    const restored = await targetAdmin.restoreBackup({
      backupPath,
      confirmedTarget: targetAdmin.databasePath
    });

    const target = new ProfileStore({ databasePath: targetPath });
    const resumed = target.openSession({ sessionToken: host.sessionToken, nickname: 'Ignored' });
    const duplicateRecorded = target.recordMatch(result);
    const restoredHistory = target.matchHistory(host.sessionToken, 10);
    target.close();

    if (resumed.player.playerId !== host.player.playerId
      || duplicateRecorded !== false
      || restoredHistory.length !== 1
      || restoredHistory[0].resultId !== result.resultId) {
      throw new Error('restored profile/session/result state did not survive the migration drill');
    }

    console.log(JSON.stringify({
      status: 'PASS',
      source: 'M2 fixture',
      target: 'linux-host-1 fixture',
      schemaVersion: restored.schemaVersion,
      integrity: restored.integrity,
      backupSha256: backupVerification.sha256,
      profiles: targetAdmin.listProfiles().length,
      historyEntries: restoredHistory.length,
      duplicateResultIgnored: !duplicateRecorded
    }, null, 2));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Restore drill failed: ${error.message}`);
  process.exitCode = 1;
});
