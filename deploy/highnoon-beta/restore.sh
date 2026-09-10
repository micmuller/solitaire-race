#!/usr/bin/env bash
set -euo pipefail
umask 077
backup=${1:?Provide /backups/<snapshot-directory>/<file.sqlite>}
[[ "$backup" == /backups/*/*.sqlite && "$backup" != *..* ]] || { echo 'Invalid backup path' >&2; exit 1; }
[[ "${2:-}" == --replace-beta-database ]] || { echo 'Explicit --replace-beta-database required; stops app and replaces data' >&2; exit 1; }
exec 9>/run/lock/highnoon-beta-maintenance.lock
flock -n 9 || { echo 'HighNoon maintenance already active' >&2; exit 1; }
compose=(docker compose --env-file /srv/micnet/secrets/highnoon-beta.env -f /srv/micnet/stacks/highnoon/compose.beta.yaml)
"${compose[@]}" exec -T app node vnext/server/adminCli.js verify --from "$backup"
"${compose[@]}" stop origin app
# Leave stopped on failure. Exactly one writer; never run alongside app.
"${compose[@]}" run --rm --no-deps app node vnext/server/adminCli.js restore --from "$backup" --backup-directory /backups/before-restore --confirm-target /data/highnoon.sqlite
"${compose[@]}" up -d --wait app origin
