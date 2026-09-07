# HighNoon profile database backup, restore and Linux migration

This runbook moves the standard SQLite profile database between hosts without
copying live WAL files or exposing bearer tokens through the Lobby API. The
database is portable SQLite; the target server must run Node.js 22.5 or newer
and the same or a newer HighNoon server revision.

## Paths used below

- repository: `/srv/highnoon/solitaire-race`
- production database: `/srv/highnoon/data/highnoon.sqlite`
- transferred backup: `/srv/highnoon/import/highnoon-migration.sqlite`

Adapt these absolute paths and run every command as the account that owns the
HighNoon service. The configured runtime path is passed through
`VNEXT_PROFILE_DATABASE`; do not store the database inside a Git checkout.

## 1. Create and verify the source backup

An online backup is safe while the source server is running. It uses SQLite's
backup API, not a filesystem copy of the live database or its WAL sidecars.

```sh
cd /path/to/solitaire-race
npm run admin:profiles -- backup \
  --profile-database /absolute/source/highnoon.sqlite \
  --backup-directory /absolute/source/backups \
  --suffix linux-host-1-migration
```

The command emits JSON and creates the self-contained `.sqlite` backup plus a
`.sqlite.manifest.json` with format, schema version, byte size and SHA-256.
Verify both before and after transfer:

```sh
npm run admin:profiles -- verify --from /absolute/path/backup.sqlite
```

Transfer both files over the existing authenticated administration channel,
for example with `rsync` or `scp`. Do not transfer the live `-wal`, `-shm` or
`.lock` files.

## 2. Prepare linux-host-1

1. Check out the tested HighNoon commit and run `npm ci`.
2. Create external data, import and backup directories owned by the service
   account with restrictive permissions.
3. Configure `VNEXT_PROFILE_DATABASE=/srv/highnoon/data/highnoon.sqlite` in the
   service environment.
4. Verify the transferred backup and manifest with the command above.

Run the admin commands as the service account. The tool writes new database and
manifest files with mode `0600`.

## 3. Restore

Stop the HighNoon service before restore. The process lock rejects a restore
while the vNext server still owns the target database.

```sh
cd /srv/highnoon/solitaire-race
npm run admin:profiles -- restore \
  --profile-database /srv/highnoon/data/highnoon.sqlite \
  --backup-directory /srv/highnoon/data/backups \
  --from /srv/highnoon/import/highnoon-migration.sqlite \
  --confirm-target /srv/highnoon/data/highnoon.sqlite
```

Before replacement, the tool creates a verified `before-restore` safety backup
when a target already exists. Restore is staged beside the target and atomically
renamed. It then applies monotonic migrations and requires:

- `PRAGMA integrity_check = ok`;
- zero `PRAGMA foreign_key_check` rows;
- all required HighNoon tables;
- a supported schema version;
- a matching source manifest checksum.

If staging or post-restore verification fails, the previous target is restored
automatically. Keep the safety backup until production acceptance is complete.

## 4. Start and accept production

Start the service and check:

```sh
curl --fail http://127.0.0.1:3011/health
```

Then perform these checks through the intended production URL:

1. Existing nickname and profile statistics load.
2. Match history and leaderboard load.
3. One Human-vs-Bot resignation creates exactly one new history entry.
4. Restart the service and confirm that the entry remains.
5. Reopen the same profile and confirm that no duplicate result appears.

If acceptance fails, stop the service and restore the generated
`before-restore` safety backup through the same verified command.

## Repeatable local gate

`npm run drill:profile-restore` creates an isolated M2-style source database,
backs it up, restores it into a separate Linux-style target, resumes the same
protected session and replays the same result ID. It passes only if profiles,
history and idempotency survive. All drill files are removed afterward and no
server is started.
