# ADR-011: Thin Client State Machine

- Status: Approved / Frozen
- Date: 2026-08-01

## Context

Web and iOS must retain their presentation work without carrying v1 gameplay
authority into vNext. Both platforms need one explicit behavioral reference for
protocol sequencing, authoritative state replacement and recovery.

## Decision

The executable reference adapter lives in `vnext/client`. It contains no
Solitaire rules and never mutates game state optimistically. A client:

- connects as the actor assigned by the server (`p1` or `p2`);
- stores only the latest authoritative `{ rev, state, stateHash }`;
- allows exactly one in-flight Action Intent;
- sends the current `rev` as `baseRev` and its current sequence as `seq`;
- advances `seq` only after its own matching `ack`;
- leaves state and sequence unchanged after `reject`;
- replaces state from every current or newer `ack` or `snapshot`;
- retries a corrected or recovered action with the same sequence.

An ack for the other player is a state update, not completion of the local
pending action. Local UI state such as drag position or animation may exist,
but must not become gameplay truth.

## Consequences

- The Node reference client and two-player simulator become executable contract
  tests for later Web and iOS adapters.
- Web and iOS transports may use platform APIs, but must preserve this state
  machine.
- Serialized intents favor correctness and observability over speculative UI
  latency. Optimistic gameplay may only be reconsidered through a later ADR.
