# ADR-010: Authoritative vNext Server Shell

- Status: Approved / Frozen
- Date: 2026-07-31

## Context

The frozen v1 server contains useful HTTP, WebSocket and room concepts but is
also tightly coupled to legacy snapshots, move relays and gameplay modules.
Editing that entry point would mix the frozen implementation with vNext.

## Decision

The first executable vNext shell lives under `vnext/server` with its own CLI.
It reuses the proven infrastructure concepts, but imports neither `server.js`,
`matches.js` nor `serverbot.js`. The legacy `npm start` entry point remains
unchanged; vNext starts through `npm run start:vnext`.

The shell owns in-memory MatchSessions. A session binds a WebSocket connection
to trusted actor `p1` or `p2`, validates the protocol envelope, enforces
per-client `seq`, revalidates stale `baseRev` intents against current
authoritative state, calls the public greenfield Core and records a replayable
ActionLog. Accepted state is broadcast in an authoritative ack. Invalid actions
are rejected only to the sender; sequence gaps and future-revision sync
failures return the current snapshot.

The initial integration intentionally excludes persistence, authentication,
lobby/matchmaking, TLS and the legacy bot. Those capabilities are added only
after the shell contract is stable and covered by replay gates.

## Consequences

- v1 remains frozen and independently startable.
- The vNext server can be smoke-tested before any client migration.
- Match state is currently process-local and lost on restart.
- Actor assignment is suitable for local development, not production security.
