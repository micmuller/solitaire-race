# Task #248 – Server profile persistence

## Current state

Completed in server version `1.1.0-alpha.22`, Pixi/PWA `0.3.1` and native
iOS/iPadOS `1.2.7 (22)`. Protocol `2.5.2` remains unchanged.

## Implemented

- SQLite schema migrations v1–v2 with foreign keys and WAL for file databases
- stable player IDs and separate session records
- random 256-bit bearer tokens; only SHA-256 token hashes are persisted
- authorized nickname update
- immutable match result plus two seat-result rows
- idempotent result recording with collision detection
- transactional aggregates: games played, games won, total score, best score
  and last game timestamp
- deterministic leaderboard and private match history
- persistent production database path with runtime files excluded from Git
- existing authoritative lobby finish paths record `completed`, `resign` and
  `inactivity` results through the same persistence transaction
- finished Human-vs-Bot matches update only the authenticated human profile;
  finished Bot-vs-Bot matches are retained as technical results without profile
  or leaderboard impact; local visual demos are never persisted
- unfinished matches and matches whose bots are merely stopped after losing
  their controller are not counted as completed results
- Pixi/PWA `0.3.1` opens or resumes a protected profile session, uses its bearer
  credential for lobby commands and keeps only the public session ID in game
  identity matching
- the Pixi profile panel can save a changed nickname without an application
  restart; the lobby, active game seat and header update immediately
- the profile statistics refresh automatically when the authoritative finished
  state arrives and once more whenever the profile panel is opened; completed
  Human-vs-Bot games therefore appear without an application restart
- the profile lists the ten latest completed games with match type, mode,
  personal score, finish reason (`Aufgegeben`, `Zeit abgelaufen` or `Beendet`)
  and personal outcome (`Gewonnen` or `Verloren`)
- native iOS/iPadOS `1.2.7 (22)` stores the bearer token in Keychain, retains
  only the public session ID in app preferences, authenticates Human-vs-Bot
  creation and presents the same ten-entry profile history as the PWA; its
  lobby nickname is saved without restart and the profile is reachable from
  Info & Diagnose
- `npm run admin:profiles` opens a guided, server-independent operator menu for
  profile listing/details, manual backups, integrity checks and safe deletion
- profile deletion requires the exact player ID, creates a consistent backup
  first and is blocked while the vNext server owns the database lock; historical
  match rows remain anonymized instead of being destroyed
- public Lobby player/game/event payloads expose only non-secret identifiers;
  after initial issuance, the `hs_…` credential is sent only in the
  Authorization header
- history and leaderboard endpoints support deterministic bounded pagination
  with `limit`, `offset` and response metadata (`total`, `returned`, `hasMore`)
- each online backup includes a SHA-256 manifest; restore requires an exact
  target confirmation, an offline database lock, pre-restore safety backup,
  atomic replacement, schema migration, integrity and foreign-key verification
- `npm run drill:profile-restore` proves an isolated M2-to-Linux restore,
  protected-session continuity and duplicate-result idempotency

## HTTP contract

- `POST /vnext/profiles/sessions` creates or resumes a session
- `GET /vnext/profiles/me` returns the authenticated profile
- `PATCH /vnext/profiles/me` performs an authenticated nickname update
- `GET /vnext/profiles/me/matches?limit=25&offset=0` returns private match history
- `GET /vnext/leaderboard?limit=25&offset=0` returns the public leaderboard

Private and Lobby mutation requests use `Authorization: Bearer <sessionToken>`.
Limits default to 25 and are capped at 100; offsets are non-negative and capped
at 100000. Public Lobby payloads never contain the bearer credential.

## Guided profile administration

From the server repository:

```bash
npm run admin:profiles
```

The default database is `vnext/data/highnoon.sqlite`. A different file can be
selected with `-- --profile-database /absolute/path/to/file.sqlite`. Reading,
manual backups and integrity checks do not start the game server. Before a
profile deletion, stop the vNext server; the menu enforces this with a shared
process lock, previews the affected profile, requires its full player ID and
writes a consistent backup under `vnext/data/backups/`.

The same menu now offers verified restore. Scriptable `backup`, `verify` and
`restore` subcommands plus the exact `linux-host-1` procedure are documented in
`../runbooks/PROFILE_DATABASE_MIGRATION.md`.

## Version axes

- Server app: `1.1.0-alpha.22`
- Protocol: `2.5.2` (unchanged)
- Rules: `1.0.0` (unchanged)
- State schema: `1.4.0` (unchanged)
- SQLite schema: `2` (`match_kind` classification added)

## Completion evidence

- Automated HTTP coverage verifies that profile and Lobby payloads contain no
  `hs_` secret, bearer-authorized mutations succeed and data survives restart.
- The restore test covers manifest verification, tamper rejection, lock refusal,
  safety backup and atomic restore.
- The practical isolated Linux migration drill restores profiles, sessions and
  history and proves that a duplicate authoritative result remains a no-op.
- User UAT accepted profile history and cross-client leaderboard updates before
  this operational completion slice.

The normative architecture decision is ADR-017.

Tasks #284 and #285 are complete. The production host move itself remains an
operations event and follows the checked-in migration runbook.
