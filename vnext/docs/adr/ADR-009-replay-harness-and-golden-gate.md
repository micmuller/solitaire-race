# ADR-009: Replay Harness and Golden Gate

- Status: Approved / Frozen
- Date: 2026-07-31

## Context

The authoritative core needs falsifiable evidence that a seed and ordered
ActionLog always produce the same results and hashes. Core actions alone do not
cover protocol sequencing, duplicate handling or recovery snapshots.

## Decision

The executable replay harness lives in `vnext/replay` and imports only the
public greenfield core API. It validates the expected header configuration,
step schema, per-client sequence and base revision before applying an action.

Executable Phase-2 logs use `p1` and `p2` as trusted actor IDs. Transport client
identity will be mapped to an actor by the future server shell before an entry
is written to the core ActionLog.

Only accepted actions advance a client's sequence. Sequence gaps and base
revisions from the future return an unchanged `OUT_OF_SYNC` snapshot. Stale
base revisions are replayed by revalidating the intent against the current
state. Duplicate sequences return `DUPLICATE_SEQ`. An AIRBAG snapshot always
fails replay.

The 20 normative seeds are checked in with start hashes for both modes. Initial
split and shared ActionLogs cover ack, reject, snapshot and continuation. Tests
must prove both replay equality and equality between generated and checked-in
artifacts.

## Consequences

- Replay divergence stops at and reports the first failing step.
- Golden hash changes require an intentional artifact regeneration and review.
- Server-shell integration must preserve these results and may not bypass the
  runner's protocol or core validation.
