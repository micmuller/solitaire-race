---
Document: ADR-006-state-and-card-model.md
Version: 1.0.0
Status: FROZEN
Phase: Phase 2 - Greenfield Server Engine
Last-Updated: 2026-07-31
---

# ADR-006: State and Card Model

## Context

The frozen Phase-1 contracts require globally unique card IDs and canonical
state, but do not define their concrete in-memory representation. The engine
needs one platform-neutral model before `initMatch` can be implemented.

## Decision

- Player IDs are exactly `p1` and `p2`.
- Modes are exactly `split` and `shared`.
- Suit codes are ASCII `C`, `D`, `H`, `S` in that order.
- Ranks are integers `1..13`, where Ace is `1` and King is `13`.
- Deck copies are numbered `0` and `1`.
- Card IDs use `d<copy>:<suit>:<rank-two-digits>`, for example `d0:C:01`.
- A card is `{ cardId, suit, rank, faceDown }`.
- Card identity never contains or changes with zone ownership.
- Stack top is always the last array element.
- Foundation indices are fixed as `C,C,D,D,H,H,S,S`.
- Current `schemaVersion` is `1.2.0`; `rulesVersion` remains `1.0.0`.
- Canonical state contains `schemaVersion`, `rulesVersion`, `seed`, `mode`,
  `players` and `foundations`. Each player contains an authoritative `score`
  counting that actor's accepted foundation moves. Revision remains outside state and is included
  only by the StateHash wrapper `{rev,state}`.

## Consequences

- IDs and ordering compare byte-for-byte across JavaScript and Swift.
- `shared` can distribute cards without rewriting identity.
- StateHash input contains no perspective-dependent `you`/`opp` aliases.
- Client adapters must map `p1`/`p2` to local presentation labels.

## Status

- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 2 foundation)

## Decisions

- 2026-07-31: Concrete engine representation established before coding.

## Open Questions

- (none)
