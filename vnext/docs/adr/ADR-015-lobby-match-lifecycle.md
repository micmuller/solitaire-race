# ADR-015: Lobby Match Lifecycle and Host Control

- Status: Approved
- Date: 2026-08-27

## Context

The authoritative game state already supports completion, resignation and
restart. The lobby previously treated these as loosely related operations:
P1 could play before P2 joined, ending only marked an entry as finished, and
the restart endpoint did not verify the lobby host session.

## Decision

Lobby matches follow this lifecycle:

`waiting -> active -> finished`

- A newly hosted lobby match is `waiting`; gameplay intents are rejected with
  `MATCH_NOT_ACTIVE` until P2 joins.
- P2 joining changes the lobby match to `active` and emits `lobbyStart`.
- P2 may leave before the first accepted move, returning the match to
  `waiting` and emitting `lobbyWaiting`.
- `resign` and completion finish the authoritative game and record the final
  score once. Finished games are excluded from the active lobby list.
- P1 may delete only an owned `waiting` game. Deletion removes the lobby game,
  in-memory MatchSession, bots and connected peers, and emits `lobbyDelete`.
- P1 may administratively end an owned lobby game. This emits `lobbyEnd` and
  disposes the same runtime resources.
- Lobby UI events are sent only to clients declaring `clientType=web` until
  the native client adopts their envelope. Authoritative action and restart
  broadcasts remain client-neutral.
- Restart of a lobby match requires the P1 lobby session. P1 independently
  chooses the same or a new seed and `split` or `shared` mode. The existing
  match ID is retained, both clients receive the authoritative `RESTART`
  snapshot, and lobby metadata is updated.

Direct technical and bot matches have no lobby owner and retain their existing
restart behavior.

## Consequences

- Web and iPad can implement the same deterministic waiting, start, finish,
  restart and lobby-return flow.
- A browser role selector is not treated as authorization for lobby control.
- Runtime cleanup is explicit; persistence across server restarts remains out
  of scope.

## Verification

- LobbyStore tests cover host-only waiting-game deletion, leave rules, score
  recording and restart metadata.
- HTTP/WebSocket tests cover P1 authorization, lifecycle broadcasts, cleanup,
  mode/seed restart propagation and the pre-start action gate.
