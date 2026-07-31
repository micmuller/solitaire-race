---
Document: ADR-002-recycle-order.md
Version: vNext-0.2
Status: FROZEN
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-07-31
---

# ADR-002: Recycle Order

## Kontext
Die Reihenfolge beim Recycling (waste → stock) beeinflusst Determinismus.

## Entscheidung
- Für Stock und Waste ist die oberste Karte immer das letzte Array-Element.
- Vor dem Recycle ist der Stock leer.
- Der neue Stock ist `reverse(waste)`; Waste wird anschließend leer.
- Damit wird die älteste Waste-Karte zur nächsten ziehbaren Stock-Karte.
- Alle recycelten Karten sind im Stock verdeckt.
- Der Recycle ist eine atomare State-Transition.

## Konsequenzen
- Deterministische, eindeutige Reihenfolge.
- Replays sind stabil und reproduzierbar.

## Status
- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- 2026-07-31: Stack-Top und Reverse-Semantik explizit definiert.

## Open Questions
- (leer – bewusst offen)

## Next Steps
- (leer – vom Orchestrator gepflegt)
