#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>/run/lock/highnoon-beta-maintenance.lock
flock -n 9 || { echo 'HighNoon maintenance already active' >&2; exit 1; }
compose=(docker compose --env-file /srv/micnet/secrets/highnoon-beta.env -f /srv/micnet/stacks/highnoon/compose.beta.yaml)
container=$("${compose[@]}" ps -q app)
[[ -n "$container" ]] || { echo 'App is not running' >&2; exit 1; }
revision=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$container")
"${compose[@]}" exec -T -e "RELEASE_REVISION=$revision" app node deploy/highnoon-beta/backup.cjs
