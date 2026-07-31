---
Document: REPLAY.md
Version: 1.0.0
Status: FROZEN
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-07-31
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

Phase-2 binding:
- `clientId` MUST be the trusted actor identifier `p1` or `p2` in executable
  core replay artifacts. A later server adapter MAY map transport client IDs to
  these actor identifiers before recording the core ActionLog.
- Sequence tracking starts at `-1` per client, therefore the first expected
  sequence is `0`.
- Only an `ack` advances `lastAcceptedSeq`. Rejects and snapshots do not.

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

## Versioned Golden Artifacts

The conforming reference artifacts live in `vnext/replay/golden`:
- `start-hashes.json`: split and shared start hashes for all 20 normative seeds.
- `SEED-0001.split.json`: executable split ActionLog.
- `SEED-0001.shared.json`: executable shared ActionLog.

Both ActionLogs cover accepted actions, a deterministic rule reject, an
Out-of-Sync recovery snapshot and continued execution. The generator in
`vnext/replay/generateGolden.js` MUST reproduce checked-in artifacts byte for
byte at the parsed JSON value level.

The executable runner is `vnext/replay/index.js`. Replay equality and artifact
regeneration are mandatory CI/test gates via `npm run test:replay`.

## Golden Seed Set (Normative Identifiers, 20)

Die folgenden Seed-Strings sind die verbindliche Startmenge für Phase-2-Testvektoren.
Erwartete Start-Hashes und ActionLogs werden durch die erste conforming Engine
erzeugt, gegengeprüft und anschließend als Golden Artifacts versioniert.
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
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- ADR-009 binds the executable runner, trusted actor IDs and Golden Gate.

## Open Questions
- (leer – bewusst offen)

## Next Steps
- Integrate the replay gate into the authoritative server-shell workflow.
