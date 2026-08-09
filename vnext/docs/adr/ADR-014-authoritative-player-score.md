# ADR-014: Authoritative Player Foundation Score

- Status: Approved
- Date: 2026-08-06

## Context

The Web UI must display the summed card point value P1 and P2 have placed on
the shared foundations. Card identity cannot be used to infer the actor in
`shared` mode, because shuffled cards are distributed independently of
deck-copy IDs.

## Decision

- Every player state contains `score`, initialized to `0`.
- An accepted `foundationMove` increments only the submitting player's score by
  the moved card's rank value.
- No other action changes score.
- Each score is an integer from `0` through `728`.
- The sum of both scores must equal the total rank value of all foundation
  cards.
- Score is authoritative state and is therefore covered by StateHash, replay
  artifacts and invariant checks.

This keeps the same score field but changes its wire semantics, bumping schema
to `1.3.0`, protocol to `2.4.0`, server/app to `1.1.0-alpha.5`, and Web client
to `0.1.0-alpha.5`. Alpha.6 keeps the same rank-point score semantics and adds
completed-match lifecycle handling in Protocol `2.5.0` / Schema `1.4.0`;
Race completion semantics were corrected in Protocol `2.5.1`.

## Consequences

- Both `split` and `shared` modes show correct player attribution.
- Observers and reconnecting clients receive the exact score in snapshots.
- Legacy snapshots without rank-point score are intentionally incompatible with
  schema `1.4.0` and must not enter the vNext Core.
