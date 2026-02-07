---
Document: REPLAY.md
Version: vNext-0.1
Status: DRAFT
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-02-07
---

# Replay

## Replay Definition
Replay ist die deterministische Wiederholung eines Matches aus Seed + ActionLog.

## Replay Inputs
Der Runner wird mit einer erwarteten Header-Konfiguration betrieben. Der ActionLog-Header MUST diese Felder enthalten und sie MUST mit der erwarteten Konfiguration übereinstimmen:
- `seed`: string
- `protocolVersion`: string
- `rulesVersion`: string
- `mode`: `shared` | `split`

Optional (informational only, keine semantische Wirkung auf Replay):
- `startedAt`: string (z. B. ISO-8601)

Norm:
- Replay MUST reject any log where required header fields are missing.
- Replay MUST reject any log where required header fields do not match the expected runner configuration.

## ActionLog Format
Phase 1 Format (normativ):
- `header`: object
- `steps`: ordered array of Step objects

Step object MUST contain:
- `i`: integer (0-based step index)
- `clientId`: string
- `seq`: integer
- `baseRev`: integer
- `action`: object
- `action.kind`: string
- `action.payload`: object
- `expectedResult`: `ack` | `reject` | `snapshot`

Step object MAY contain:
- `expectedRejectCode`: string (if `expectedResult` == `reject`)
- `expectedStateHashAfter`: string (SHA-256, recommended)
- `note`: string (informational)

## Replay Runner Requirements
Ausführung:
- Runner MUST execute steps strictly in listed order.
- For each step, the runner MUST conceptually send `action` to the engine/applyAction and obtain `result` (`ack`/`reject`/`snapshot`), `rev`, and `stateHash`.

Vergleich:
- Runner MUST compare `result` with `expectedResult`.
- If `expectedRejectCode` is present, Runner MUST compare it with the actual reject code.
- If `expectedStateHashAfter` is present, Runner MUST compare it with the actual `stateHash` after the step.

Divergence Detection:
- Replay FAILS at the first step where expected != actual (result / rejectCode / stateHash).
- Runner MUST output `failureStep = i` and `failureReason` on FAIL.

## Snapshot Handling
- `snapshot` as `expectedResult` is allowed in logs.
- When a snapshot occurs, runner MUST replace local state with `snapshot.state` and continue with the next step.
- If snapshot `reason` == `AIRBAG`, runner MUST mark replay FAIL (indicates server bug / invariant breach).
- Snapshot MUST include: `rev`, `stateHash`, `state`, and `reason`.

## Stop Conditions
- Stop when end of `steps` is reached (normal termination).
- Stop immediately when FAIL is detected (first divergence).
- A snapshot is a recovery event, not a final status.

## Output
Runner MUST output:
- `status`: `SUCCESS` | `FAIL`
- `finalRev`
- `finalStateHash`
- `failureStep` (only if `FAIL`)
- `failureReason` (only if `FAIL`)

## Golden Seeds (Placeholder, 20)
- SEED-0001
- SEED-0002
- SEED-0003
- SEED-0004
- SEED-0005
- SEED-0006
- SEED-0007
- SEED-0008
- SEED-0009
- SEED-0010
- SEED-0011
- SEED-0012
- SEED-0013
- SEED-0014
- SEED-0015
- SEED-0016
- SEED-0017
- SEED-0018
- SEED-0019
- SEED-0020

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
