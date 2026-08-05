# ADR-013: Concurrent Intent Rebase

- Status: Approved
- Date: 2026-08-05

## Context

Race gameplay allows both players to act at nearly the same time. Protocol
2.1.0 required every action's global `baseRev` to equal the current match
revision. Once the first of two independent actions was accepted, the second
was blocked with `OUT_OF_SYNC`, even when it only touched the other player's
stock, waste or tableau.

The server must preserve authoritative ordering, duplicate protection and card
invariants without turning the global revision into a gameplay lock.

## Decision

Protocol 2.2.0 treats `baseRev` as an observation rather than an exclusive
write precondition:

- `seq < expectedSeq` remains `DUPLICATE_SEQ`.
- `seq > expectedSeq` remains an `OUT_OF_SYNC` snapshot.
- `baseRev > currentRev` remains an `OUT_OF_SYNC` snapshot.
- `seq == expectedSeq` and `baseRev <= currentRev` is revalidated against the
  latest authoritative state.
- A still-legal intent is applied atomically and acknowledged.
- A genuine collision is rejected by the existing Core validation and does not
  consume the player's sequence.

The Node server event loop defines receipt/application order for the current
single-process MatchSession. `applyAction` clones current state and checks every
invariant before commit. Shared foundation lane resolution therefore remains
deterministic and collision-safe.

## Consequences

- Independent moves from the same broadcast snapshot can both succeed.
- The first valid arrival wins a genuine shared-resource race.
- No optimistic client mutation is introduced.
- `seq` remains the idempotency key and accepted actions alone advance it.
- Replay implements the same stale-intent rule as the live MatchSession.
- A future multi-process deployment must add one ordered queue or transactional
  compare-and-swap boundary per match; process-local ordering is not sufficient
  across workers.

## Verification

- MatchSession regression: two players draw using `baseRev: 0`; both actions
  are acknowledged at revisions 1 and 2.
- Reference-client integration: an intentionally stale player action is
  accepted and both clients converge.
- Future `baseRev` and sequence-gap recovery remain covered.
- Duplicate sequence and invariant tests remain unchanged.
