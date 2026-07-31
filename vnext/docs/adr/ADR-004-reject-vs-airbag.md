---
Document: ADR-004-reject-vs-airbag.md
Version: vNext-0.2
Status: FROZEN
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-07-31
---

# ADR-004: Reject vs Airbag

## Kontext
Unklarheit zwischen normaler Ablehnung und invariant-bedingter Notbremse.

## Entscheidung
- Jede Action wird gegen Envelope, Sequencing, Regeln und Vorbedingungen
  validiert, bevor State mutiert wird. Eine ungültige Action ergibt `reject`;
  Revision, State und StateHash bleiben unverändert.
- Eine gültige Action wird transaktional auf einen Kandidaten-State angewendet.
- Invariants werden auf dem Kandidaten-State geprüft, bevor er committed wird.
- Bei einem Invariant-Bruch wird der Kandidaten-State verworfen. Der letzte
  gültige State bleibt autoritativ; Revision und StateHash bleiben unverändert.
- Der Server sendet einen Snapshot dieses letzten gültigen States mit Reason
  `AIRBAG` und protokolliert `INTERNAL_INVARIANT_BREACH` als Serverfehler.
- Die auslösende Action wird nicht als akzeptiert in das ActionLog übernommen.
- `AIRBAG` ist niemals eine Reaktion auf einen normalen Client- oder Regelfehler.

## Konsequenzen
- Klare Trennung von Client-Fehlern und Server-Bugs.
- Replay-Logs bleiben stabil.

## Status
- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- 2026-07-31: Apply/Invariant-Prüfung als atomare Transaktion mit Rollback auf
  den letzten gültigen State festgelegt.

## Open Questions
- (leer – bewusst offen)

## Next Steps
- (leer – vom Orchestrator gepflegt)
