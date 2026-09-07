#!/usr/bin/env node
'use strict';

const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { ProfileAdmin } = require('./profileAdmin');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function commandName() {
  const candidate = process.argv[2];
  return candidate && !candidate.startsWith('--') ? candidate : 'menu';
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function runCommand(admin) {
  const command = commandName();
  if (command === 'menu') return false;
  if (command === 'backup') {
    const backupPath = await admin.createBackup({ suffix: option('--suffix', 'manual') });
    printJson(admin.verifyBackup(backupPath));
    return true;
  }
  if (command === 'verify') {
    const backupPath = option('--from');
    if (!backupPath) throw new Error('verify requires --from <backup.sqlite>');
    printJson(admin.verifyBackup(backupPath));
    return true;
  }
  if (command === 'restore') {
    const backupPath = option('--from');
    const confirmedTarget = option('--confirm-target');
    if (!backupPath) throw new Error('restore requires --from <backup.sqlite>');
    printJson(await admin.restoreBackup({ backupPath, confirmedTarget }));
    return true;
  }
  throw new Error(`unknown command: ${command}`);
}

function profileTable(profiles) {
  return profiles.map((profile, index) => ({
    Nr: index + 1,
    Nickname: profile.nickname,
    Spiele: profile.gamesPlayed,
    Siege: profile.gamesWon,
    Sessions: profile.sessionCount,
    Zuletzt: profile.lastSeenAt,
    SpielerID: profile.playerId
  }));
}

async function selectProfile(prompt, admin) {
  const profiles = admin.listProfiles();
  if (!profiles.length) {
    console.log('\nKeine Profile vorhanden.');
    return null;
  }
  console.table(profileTable(profiles));
  const answer = (await prompt.question('Nummer oder vollständige Spieler-ID: ')).trim();
  const index = Number(answer);
  const selected = Number.isSafeInteger(index) && index >= 1 && index <= profiles.length
    ? profiles[index - 1]
    : profiles.find((profile) => profile.playerId === answer);
  if (!selected) console.log('Profil nicht gefunden.');
  return selected || null;
}

function printProfile(profile) {
  console.log(`\nNickname:       ${profile.nickname}`);
  console.log(`Spieler-ID:     ${profile.playerId}`);
  console.log(`Spiele/Siege:   ${profile.gamesPlayed}/${profile.gamesWon}`);
  console.log(`Punkte/Bestwert:${profile.totalScore}/${profile.bestScore}`);
  console.log(`Sessions:       ${profile.sessionCount}`);
  console.log(`Match-Verweise: ${profile.matchCount}`);
  console.log(`Erstellt:       ${profile.createdAt}`);
  console.log(`Zuletzt aktiv:  ${profile.lastSeenAt}`);
}

async function deleteProfile(prompt, admin) {
  const profile = await selectProfile(prompt, admin);
  if (!profile) return;
  printProfile(profile);
  console.log('\nVorschau: Profil und Sessions werden gelöscht. Historische Matchresultate bleiben');
  console.log('mit ihrem damaligen Nickname erhalten, aber ohne Verknüpfung zum Profil.');
  console.log('Unmittelbar vor dem Löschen wird automatisch ein SQLite-Backup erstellt.');
  const confirmation = (await prompt.question(`\nZum Löschen die vollständige Spieler-ID eingeben:\n${profile.playerId}\n> `)).trim();
  if (confirmation !== profile.playerId) {
    console.log('Abgebrochen – keine Daten wurden geändert.');
    return;
  }
  try {
    const result = await admin.deleteProfile(profile.playerId);
    console.log(`\nProfil „${result.profile.nickname}“ wurde gelöscht.`);
    console.log(`Backup: ${result.backupPath}`);
    console.log(`Integritätsprüfung: ${result.integrity}`);
  } catch (error) {
    if (error.code === 'DATABASE_IN_USE') {
      console.log('\nLöschen blockiert: Der vNext-Server verwendet die Datenbank noch.');
      console.log('Server beenden und das Admin-Menü erneut starten.');
      return;
    }
    throw error;
  }
}

async function restoreBackup(prompt, admin) {
  console.log('\nRestore ersetzt die aktive Profildatenbank vollständig.');
  console.log('Der vNext-Server muss beendet sein. Vorher wird automatisch ein Sicherheitsbackup erstellt.');
  const backupPath = (await prompt.question('Pfad zum Backup: ')).trim();
  if (!backupPath) {
    console.log('Abgebrochen – kein Backup angegeben.');
    return;
  }
  const verification = admin.verifyBackup(backupPath);
  console.log(`Backup geprüft: Schema ${verification.schemaVersion}, SHA-256 ${verification.sha256}`);
  const confirmation = (await prompt.question(`\nZum Wiederherstellen den vollständigen Zielpfad eingeben:\n${admin.databasePath}\n> `)).trim();
  if (confirmation !== admin.databasePath) {
    console.log('Abgebrochen – keine Daten wurden geändert.');
    return;
  }
  try {
    const result = await admin.restoreBackup({ backupPath, confirmedTarget: confirmation });
    console.log(`\nRestore erfolgreich: ${result.databasePath}`);
    console.log(`Schema/Integrität: ${result.schemaVersion}/${result.integrity}`);
    if (result.safetyBackupPath) console.log(`Sicherheitsbackup: ${result.safetyBackupPath}`);
  } catch (error) {
    if (error.code === 'DATABASE_IN_USE') {
      console.log('\nRestore blockiert: Der vNext-Server verwendet die Zieldatenbank noch.');
      console.log('Server beenden und den Restore erneut starten.');
      return;
    }
    throw error;
  }
}

async function main() {
  const databasePath = option(
    '--profile-database',
    process.env.VNEXT_PROFILE_DATABASE || path.join(__dirname, '..', 'data', 'highnoon.sqlite')
  );
  const admin = new ProfileAdmin({
    databasePath,
    backupDirectory: option('--backup-directory')
  });
  if (await runCommand(admin)) return;
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  console.log('\nSolitaire HighNoon – Profilverwaltung');
  console.log(`Datenbank: ${admin.databasePath}`);
  try {
    while (true) {
      console.log('\n1  Profile anzeigen');
      console.log('2  Profildetails anzeigen');
      console.log('3  Profil sicher löschen');
      console.log('4  Manuelles Backup erstellen');
      console.log('5  Datenbankintegrität prüfen');
      console.log('6  Backup wiederherstellen');
      console.log('0  Beenden');
      const choice = (await prompt.question('\nAuswahl: ')).trim();
      if (choice === '0') break;
      if (choice === '1') {
        const profiles = admin.listProfiles();
        if (profiles.length) console.table(profileTable(profiles));
        else console.log('\nKeine Profile vorhanden.');
      } else if (choice === '2') {
        const profile = await selectProfile(prompt, admin);
        if (profile) printProfile(profile);
      } else if (choice === '3') {
        await deleteProfile(prompt, admin);
      } else if (choice === '4') {
        console.log(`\nBackup erstellt: ${await admin.createBackup()}`);
      } else if (choice === '5') {
        console.log(`\nIntegritätsprüfung: ${admin.integrityCheck().join(', ')}`);
      } else if (choice === '6') {
        await restoreBackup(prompt, admin);
      } else {
        console.log('Ungültige Auswahl.');
      }
    }
  } finally {
    prompt.close();
  }
  console.log('Profilverwaltung beendet.');
}

main().catch((error) => {
  console.error(`\nFehler: ${error.message}`);
  process.exitCode = 1;
});
