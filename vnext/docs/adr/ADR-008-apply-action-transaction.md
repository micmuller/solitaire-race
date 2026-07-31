---
Document: ADR-008-apply-action-transaction.md
Version: 1.0.0
Status: FROZEN
Phase: Phase 2 - Greenfield Server Engine
Last-Updated: 2026-07-31
---

# ADR-008: applyAction Transaction Boundary

## Context

The core must apply actions atomically without trusting identity fields supplied
by a client or mutating the last authoritative state on rejection.

## Decision

The public API is `applyAction(current, actorId, action)`:

- `current` is the last authoritative `{rev,state,stateHash}`.
- `actorId` is trusted server context (`p1` or `p2`) derived from the match
  session, never from the client payload.
- `action` is `{kind,payload}` and contains no authority claim.

The result is exactly one of:

- `ack`: a new state, `rev + 1` and new StateHash.
- `reject`: stable reject code and the unchanged authoritative value.
- `snapshot` with reason `AIRBAG`: unchanged last valid value after a current
  hash/invariant failure or candidate invariant failure.

Actions execute on a clone. The candidate is committed only after all
invariants pass. Rejected actions do not increment revision.

For `foundationMove`, a client target index is a presentation hint only. The
core resolves the legal global foundation deterministically and returns
`resolvedFoundationIndex` on `ack`.

## Consequences

- Client identity spoofing cannot cross the core boundary.
- Reject and AIRBAG behavior is replayable.
- Client adapters must render the resolved foundation lane returned by server.

## Status

- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 2 foundation)

## Decisions

- 2026-07-31: Actor identity is trusted call context, not action data.

## Open Questions

- (none)
