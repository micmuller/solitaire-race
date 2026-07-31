---
Document: ADR-003-empty-tableau.md
Version: vNext-0.2
Status: FROZEN
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-07-31
---

# ADR-003: Empty Tableau Rule

## Kontext
Regel für Züge auf leere Tableau-Spalten ist nicht festgelegt.

## Entscheidung
Nur ein König oder ein valider, aufgedeckter Tableau-Stack, dessen unterste
bewegte Karte ein König ist, darf auf eine leere Tableau-Spalte gelegt werden.
Die verschobene Kartenfolge muss weiterhin vollständig absteigend und
farbwechselnd sein.

## Konsequenzen
- Regelkonform zu Klondike-Standard.
- Validierung ist eindeutig.

## Status
- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- 2026-07-31: König-Stack als valider, offenliegender Stack präzisiert.

## Open Questions
- (leer – bewusst offen)

## Next Steps
- (leer – vom Orchestrator gepflegt)
