---
Document: ADR-004-reject-vs-airbag.md
Version: vNext-0.1
Status: DRAFT
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-02-07
---

# ADR-004: Reject vs Airbag

## Kontext
Unklarheit zwischen normaler Ablehnung und invariant-bedingter Notbremse.

## Entscheidung
- Invalid actions werden mit `reject` beantwortet.
- `AIRBAG` wird nur bei invariant breach verwendet (Serverfehler).

## Konsequenzen
- Klare Trennung von Client-Fehlern und Server-Bugs.
- Replay-Logs bleiben stabil.

## Status
- [ ] Draft
- [ ] Reviewed
- [ ] Approved
- [ ] Frozen (Phase 1)

## Decisions
- (leer – wird über ADRs oder Review gefüllt)

## Open Questions
- (leer – bewusst offen)

## Next Steps
- (leer – vom Orchestrator gepflegt)
