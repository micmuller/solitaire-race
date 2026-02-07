---
Document: TEST_MATRIX.md
Version: vNext-0.1
Status: DRAFT
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-02-07
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
- [ ] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- (leer – wird über ADRs oder Review gefüllt)

## Open Questions
- (leer – bewusst offen)

## Next Steps
- (leer – vom Orchestrator gepflegt)
