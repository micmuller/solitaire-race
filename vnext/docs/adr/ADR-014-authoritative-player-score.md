# ADR-014: Authoritative Player Foundation Score

- Status: Approved
- Date: 2026-08-06

## Context

The Web UI must display how many cards P1 and P2 have placed on the shared
foundations. Card identity cannot be used to infer the actor in `shared` mode,
because shuffled cards are distributed independently of deck-copy IDs.

## Decision

- Every player state contains `score`, initialized to `0`.
- An accepted `foundationMove` increments only the submitting player's score.
- No other action changes score.
- Each score is an integer from `0` through `52`.
- The sum of both scores must equal the number of cards on all foundations.
- Score is authoritative state and is therefore covered by StateHash, replay
  artifacts and invariant checks.

This adds state to the wire contract and bumps schema to `1.2.0`, protocol to
`2.3.0`, server/app to `1.1.0-alpha.4`, and Web client to `0.1.0-alpha.4`.

## Consequences

- Both `split` and `shared` modes show correct player attribution.
- Observers and reconnecting clients receive the exact score in snapshots.
- Legacy snapshots without score are intentionally incompatible with schema
  `1.2.0` and must not enter the vNext Core.
