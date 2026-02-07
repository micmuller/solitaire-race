---
Document: PROTOCOL.md
Version: vNext-0.1
Status: DRAFT
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-02-07
---

# Protocol

## Purpose & Normative References
- Purpose: Define the authoritative, deterministic client-server protocol for Phase 1.
- Normative: `GAME_RULES_vNext.md` is the sole rules reference.

## Protocol Versioning
- SemVer: `MAJOR.MINOR.PATCH`.
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
- Server evaluates every action relative to `baseRev`.
- If `baseRev` does not equal the current server revision, the message is Out-of-Sync (see Sequencing).

## Server Responses
Server MUST respond with exactly one of:
- `ack`: action accepted and applied
- `reject`: action invalid or malformed, no state change
- `snapshot`: authoritative full state, sent on connect/recovery

Snapshot MUST be sent on:
- initial connect or explicit `state_request`
- sequence gap (`seq > expectedSeq`)
- `baseRev` mismatch (client out of sync)
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
- If `seq == expectedSeq` and `baseRev != currentRev`: Out-of-Sync. Server MUST send `snapshot` and MUST NOT apply the action.
- If `seq == expectedSeq` and `baseRev == currentRev`: Server applies the action atomically and responds with `ack`.

Applied order is defined by accepted `seq` per `clientId`. Server MUST NOT reorder accepted actions.

## Reject Codes (Normative)
- `MALFORMED_MESSAGE` (missing required fields or schema violation)
- `INVALID_ACTION_KIND`
- `INVALID_SOURCE`
- `INVALID_TARGET`
- `CARD_NOT_ACCESSIBLE`
- `OWNERSHIP_VIOLATION`
- `RULE_VIOLATION`
- `OUT_OF_TURN` (not used in Phase 1)
- `DUPLICATE_SEQ` (idempotent duplicate; action ignored)
- `INTERNAL_INVARIANT_BREACH` (server bug only)

## Snapshot Format
- `rev`: integer, monotonic server revision
- `stateHash`: string (SHA-256)
- `state`: canonical state object

## JSON-Schema Examples (Minimal)
Example 1: Full client-to-server message
```json
{
  "matchId": "m-001",
  "clientId": "p1",
  "seq": 42,
  "baseRev": 310,
  "protocolVersion": "0.1.0",
  "kind": "draw",
  "payload": {
    "source": {"zone": "stock", "owner": "global"},
    "target": {"zone": "waste", "owner": "global"}
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
- [ ] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- (leer – wird über ADRs oder Review gefüllt)

## Open Questions
- (leer – bewusst offen)

## Next Steps
- (leer – vom Orchestrator gepflegt)
