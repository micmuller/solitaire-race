---
Document: ADR-002-recycle-order.md
Version: vNext-0.1
Status: DRAFT
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-02-07
---

# ADR-002: Recycle Order

## Kontext
Die Reihenfolge beim Recycling (waste → stock) beeinflusst Determinismus.

## Entscheidung
Waste wird in umgekehrter Reihenfolge auf Stock gelegt (reverse order).

## Konsequenzen
- Deterministische, eindeutige Reihenfolge.
- Replays sind stabil und reproduzierbar.

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
