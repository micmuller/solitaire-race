# ADR-017: SQLite profile and match-result persistence

## Status

Accepted and implemented for Task #248.

## Context

The vNext lobby kept nickname sessions, statistics and prepared history fields
only in memory. A server restart discarded every identity and result. Updating a
JSON file would also make concurrent result aggregation and idempotent writes
fragile.

## Decision

- The server uses one local SQLite database as the persistence boundary.
- Schema changes are monotonic, transactional migrations recorded in
  `schema_migrations`.
- A player has a stable `player_id`; a session has a separate public
  `session_id` and a random bearer token.
- Only the SHA-256 hash of a bearer token is stored. Private profile and history
  routes require `Authorization: Bearer <token>`.
- Authoritative results are written in one `BEGIN IMMEDIATE` transaction. The
  immutable result row, both seat rows and all player aggregates either commit
  together or not at all.
- Every played round owns a server-generated `resultId`. Replaying the same
  result is a no-op; reusing its ID for different result data is a hard conflict.
- Leaderboard order is deterministic: wins, total score, best score, nickname,
  then stable player ID.
- Result schema v2 classifies each persisted match as `human-vs-human`,
  `human-vs-bot` or `bot-vs-bot`. Only seats linked to real profiles update
  aggregate statistics; bot seats remain unlinked.
- The gameplay protocol remains `2.5.2`; these are HTTP and storage additions,
  not changes to Action/Ack/Snapshot semantics.

## Storage and operation

The production CLI defaults to `vnext/data/highnoon.sqlite`, enables foreign
keys and WAL, and creates missing parent directories. Tests use isolated
in-memory or temporary databases. Runtime database files and WAL sidecars are
excluded from Git.

Backups use SQLite's online backup API and include a SHA-256 manifest. The
guided and non-interactive administration CLI creates one automatically before
a deletion and can create, verify and restore migration backups. Destructive
administration and the server coordinate through a process lock, so profile
deletion and restore require the server to be stopped. Restore stages and
atomically replaces the target, applies monotonic migrations, verifies SQLite
integrity and foreign keys, and retains a verified pre-restore safety backup.

## Compatibility boundary

Server `1.1.0-alpha.22` provides the protected `/vnext/profiles/*` contract and
persists lobby-created profiles and authoritative lobby results. Pixi/PWA
`0.3.1` uses the bearer token plus `publicSessionId` and declares direct
Human-vs-Bot/Bot-vs-Bot match types for result persistence. Native iOS/iPadOS
`1.2.7 (22)` uses the same identity split, stores its bearer token in Keychain
and keeps only the public session ID in app preferences. Lobby payloads expose
only the non-secret public session ID. Both clients send the secret credential
only through the HTTP Authorization header. The server still accepts the
previous request-body credential during a short rolling-upgrade window, but
never returns it in a public Lobby payload.

## Consequences

Profile statistics and match history survive server restarts and cannot be
double-counted by repeated finish handling. SQLite requires Node.js 22.5 or
newer because the implementation uses the built-in `node:sqlite` module. On the
current Node.js 22 runtime the module emits its upstream experimental warning;
the database format itself is standard SQLite.
