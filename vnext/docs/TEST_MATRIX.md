---
Document: TEST_MATRIX.md
Version: 1.0.0
Status: FROZEN
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-07-31
---

# Test Matrix

## Phase 1 Test Philosophy
- Nur deterministische, wiederholbare Checks.
- Keine UI-/iOS-Tests.
- Fokus auf Protokoll, Regeln, Replay, Invarianten.

## Mandatory Gates
- `initMatch` determinism
- `applyAction` determinism
- replay equality
- invariant enforcement

## Minimal Test Matrix
| Area | Input | Expected | Artifact |
| --- | --- | --- | --- |
| initMatch | seed | gleicher Startzustand | stateHash + state snapshot |
| applyAction | action log | gleiche Endzustände | per-step hashes |
| replay | seed + log | identischer final stateHash | replay report |
| invariants | invalid action | reject code | reject log |
| protocol | envelope schema | schema valid | validation report |

## Implemented Phase-2 Gates

- 20 normative seeds x `split` and `shared`: 40 checked-in start hashes.
- Checked-in Golden ActionLogs for both modes.
- Per-step result, reject-code and state-hash equality.
- First-divergence reporting for tampered hashes and malformed steps.
- Header/configuration mismatch rejection before match initialization.
- Protocol recovery coverage for duplicate sequence, sequence gaps and future-revision snapshots.
- Artifact regeneration equality against the checked-in JSON files.
- Two Protocol-2.5.0 reference clients converge after both actors submit
  accepted actions in one shared match.
- Client reject keeps state/sequence unchanged and allows corrected retry.
- Stale same-revision race actions are rebased onto current authoritative state.
- Independent simultaneous player actions are both accepted; genuine conflicts
  are rejected by normal Core validation without consuming the sequence.
- Player scores equal the summed rank points each actor moved to global
  foundations; combined score equals total foundation rank points.
- Final accepted foundation move with all 104 foundation cards finishes the
  match, records the score leader as winner, and rejects later actions.

## Acceptance Criteria
- Hash-Match für gleiche Seeds und Logs.
- Rejections sind deterministisch und code-stabil.
- Kein Invariant-Breach in validen Runs.

## Required Artifacts
- logs
- hashes
- action logs

## Status
- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- Replay equality is executable through `npm run test:replay`.

## Open Questions
- (leer – bewusst offen)

## Next Steps
- Port the frozen reference client state machine to Web and iOS adapters.
