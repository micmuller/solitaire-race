---
Document: PROTOCOL.md
Version: 2.2.0
Status: FROZEN
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-08-05
---

# Protocol

## Purpose & Normative References
- Purpose: Define the authoritative, deterministic client-server protocol for Phase 1.
- Normative: `GAME_RULES_vNext.md` is the sole rules reference.

## Protocol Versioning
- SemVer: `MAJOR.MINOR.PATCH`.
- Current vNext protocol version: `2.2.0`.
- Legacy v1 messages are incompatible and MUST NOT enter the vNext core.
- Additive changes preferred (MINOR/PATCH).
- Breaking changes require ADR approval and MAJOR bump.

## Message Envelope
All client-to-server messages MUST use this envelope:
- `matchId`: string
- `clientId`: string
- `seq`: integer, monotonic per client
- `baseRev`: integer (server revision the client believes it is on)
- `protocolVersion`: string (SemVer)
- `kind`: string (action kind)
- `payload`: object (kind-specific)
- `clientTime`: string (optional; informational only)

Norms:
- Server records `baseRev` for observability and deterministic replay.
- A stale `baseRev` does not by itself block an action. The server MUST
  revalidate the intent against the latest authoritative state.
- A `baseRev` greater than the current revision is Out-of-Sync.

## Server Responses
Server MUST respond with exactly one of:
- `ack`: action accepted and applied
- `reject`: action invalid or malformed, no state change
- `snapshot`: authoritative full state, sent on connect/recovery

vNext shell response binding:
- Every response includes `kind`, `matchId`, `protocolVersion`, `rev` and
  `stateHash`.
- `ack` additionally includes the accepted `clientId`, `seq` and authoritative
  `state`; it is broadcast to all connected match peers.
- `reject` includes `clientId` and `code`, is sent only to the submitting peer,
  and does not contain a replacement state.
- `snapshot` includes authoritative `state` and `reason` and is sent to the peer
  that needs initialization or recovery. AIRBAG snapshots are broadcast.

Snapshot MUST be sent on:
- initial connect or explicit `state_request`
- sequence gap (`seq > expectedSeq`)
- `baseRev > currentRev` (client claims a future state)
- `INTERNAL_INVARIANT_BREACH` (airbag)

In these cases, the server MUST NOT apply the triggering action.

## Action Kinds & Payload Schemas
Payloads are minimal and MUST be validated by server.

- `draw`
  - `source`: ZoneRef (must be `stock`)
  - `target`: ZoneRef (must be `waste`)

- `recycle`
  - `source`: ZoneRef (must be `waste`)
  - `target`: ZoneRef (must be `stock`)

- `flip`
  - `source`: ZoneRef (must be `tableau`)

- `tableauMove`
  - `source`: ZoneRef (`tableau` or `waste`)
  - `target`: ZoneRef (`tableau`)
  - `count`: integer (number of cards)

- `foundationMove`
  - `source`: ZoneRef (`tableau` or `waste`)
  - `target`: ZoneRef (`foundation`)
  - `target.index` is a client presentation hint; the server MUST resolve the
    legal global lane deterministically and return `resolvedFoundationIndex`

- `resign`
  - `payload`: empty object
  - Server sets `state.status` to `finished`, `endedReason` to `resign`,
    `endedBy` to the actor and `winner` to the opponent.

## ZoneRef Concept
A ZoneRef identifies a logical zone and MUST be structured (no parsing):
- `zone`: `stock` | `waste` | `tableau` | `foundation`
- `index`: integer (REQUIRED for `tableau`/`foundation`; MUST be omitted for `stock`/`waste`)
- `owner`: `p1` | `p2` | `global`

String-encoded forms such as `"tableau[2]"` are NOT ALLOWED.

Notes:
- Phase 1 uses server-authoritative validation only.
- Client MUST NOT infer legality beyond rules.

## Idempotency & Sequencing Rules
Definitions:
- `lastAcceptedSeq`: highest `seq` the server has accepted for a given `clientId`.
- `expectedSeq`: `lastAcceptedSeq + 1` for that `clientId`.

Rules (normative):
- If `seq < expectedSeq`: DUPLICATE. Server MUST respond with `reject` and code `DUPLICATE_SEQ`. Server MUST NOT apply the action and MUST NOT send a snapshot.
- If `seq > expectedSeq`: GAP / Out-of-Sync. Server MUST send `snapshot` and MUST NOT apply the action.
- If `seq == expectedSeq` and `baseRev > currentRev`: Out-of-Sync. Server MUST send `snapshot` and MUST NOT apply the action.
- If `seq == expectedSeq` and `baseRev <= currentRev`: Server MUST revalidate
  and atomically apply the intent against the latest authoritative state. A
  still-legal action receives `ack`; a genuine rules/resource conflict receives
  the normal Core `reject` without consuming the sequence.

Only an accepted Core action advances `lastAcceptedSeq`. A rules/schema reject
does not consume the sequence, allowing the client to correct and retry with the
same `seq` against the unchanged revision.

Applied order is defined by server receipt order plus accepted `seq` per
`clientId`. Server MUST NOT reorder accepted actions. This permits independent
actions created from the same snapshot to succeed while keeping shared
foundation updates collision-safe.

## Thin Client Binding

- Clients MUST NOT mutate gameplay state optimistically.
- Clients MUST allow at most one in-flight action intent.
- An ack replaces local authoritative state. The submitting client advances its
  sequence only when `clientId` and `seq` match its pending action.
- A broadcast ack from the other actor replaces state but does not affect the
  local sequence or complete a pending local action.
- A reject changes neither authoritative state nor sequence.
- A recovery snapshot replaces local authoritative state; the triggering action
  was not accepted and MAY be retried with the same sequence.
- ADR-011 and `vnext/client` define the executable reference behavior.

## Reject Codes (Normative)
- `MALFORMED_MESSAGE` (missing required fields or schema violation)
- `INVALID_ACTION_KIND`
- `INVALID_SOURCE`
- `INVALID_TARGET`
- `CARD_NOT_ACCESSIBLE`
- `OWNERSHIP_VIOLATION`
- `RULE_VIOLATION`
- `MATCH_FINISHED`
- `OUT_OF_TURN` (not used in Phase 1)
- `DUPLICATE_SEQ` (idempotent duplicate; action ignored)
- `INTERNAL_INVARIANT_BREACH` (server bug only)

## Snapshot Format
- `rev`: integer, monotonic server revision
- `stateHash`: string (SHA-256)
- `state`: canonical state object

State includes match lifecycle fields:
- `status`: `active` | `finished`
- `winner`: `p1` | `p2` | null
- `endedReason`: `resign` | null
- `endedBy`: `p1` | `p2` | null

## JSON-Schema Examples (Minimal)
Example 1: Full client-to-server message
```json
{
  "matchId": "m-001",
  "clientId": "p1",
  "seq": 42,
  "baseRev": 310,
  "protocolVersion": "2.2.0",
  "kind": "draw",
  "payload": {
    "source": {"zone": "stock", "owner": "p1"},
    "target": {"zone": "waste", "owner": "p1"}
  }
}
```

Example 2: Server reject message
```json
{
  "kind": "reject",
  "code": "DUPLICATE_SEQ",
  "reason": "seq 41 already accepted",
  "expectedSeq": 42
}
```

Example 3: Server snapshot message (stub)
```json
{
  "kind": "snapshot",
  "rev": 310,
  "stateHash": "b6f5a2bce3f0a0b1d2c3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b",
  "state": {"...": "..."}
}
```

## Status
- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- ADR-010 binds the first executable authoritative server shell.
- ADR-011 binds the thin client state machine used by Web and iOS.
- ADR-013 permits stale-intent revalidation for race concurrency.

## Open Questions
- (leer – bewusst offen)

## Next Steps
- (leer – vom Orchestrator gepflegt)
