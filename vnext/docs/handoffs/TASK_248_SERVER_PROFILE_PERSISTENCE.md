# Task #248 – Server profile persistence

## Current state

Server slice implemented as UAT candidate in server version `1.1.0-alpha.20`.
Task #248 remains in progress because secret removal from public lobby payloads
and operational restore automation are not part of this slice.

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
- Pixi/PWA `0.2.8` opens or resumes a protected profile session, uses its bearer
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
- native iOS/iPadOS `1.2.4 (19)` stores the bearer token in Keychain, retains
  only the public session ID in app preferences, authenticates Human-vs-Bot
  creation and presents the same ten-entry profile history as the PWA; its
  lobby nickname is saved without restart and the profile is reachable from
  Info & Diagnose
- `npm run admin:profiles` opens a guided, server-independent operator menu for
  profile listing/details, manual backups, integrity checks and safe deletion
- profile deletion requires the exact player ID, creates a consistent backup
  first and is blocked while the vNext server owns the database lock; historical
  match rows remain anonymized instead of being destroyed

## HTTP contract

- `POST /vnext/profiles/sessions` creates or resumes a session
- `GET /vnext/profiles/me` returns the authenticated profile
- `PATCH /vnext/profiles/me` performs an authenticated nickname update
- `GET /vnext/profiles/me/matches?limit=25` returns private match history
- `GET /vnext/leaderboard?limit=25` returns the public leaderboard

Private requests use `Authorization: Bearer <sessionToken>`. Limits default to
25 and are capped at 100.

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

## Version axes

- Server app: `1.1.0-alpha.20`
- Protocol: `2.5.2` (unchanged)
- Rules: `1.0.0` (unchanged)
- State schema: `1.4.0` (unchanged)
- SQLite schema: `2` (`match_kind` classification added)

## Remaining before #248 completion

1. Remove secret credentials from public lobby game/seat payloads after both
   clients have migrated.
2. Define pagination and leaderboard presentation for clients. Both Pixi/PWA
   `0.2.8` and iOS/iPadOS `1.2.4 (19)` display the ten latest profile matches.
3. Add the remaining restore command and run a practical restore drill. Guided
   backup and integrity-check commands are implemented.
4. Run cross-client UAT including server restart and duplicate finish delivery.

The normative architecture decision is ADR-017.

The cross-client UAT findings deferred to the next work block are recorded in
`UAT_2026-09-06_FOLLOW_UP.md` and Dashboard backlog #285. Leaderboard UI is
tracked separately as Dashboard backlog #284.
