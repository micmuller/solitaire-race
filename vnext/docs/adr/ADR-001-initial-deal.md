---
Document: ADR-001-initial-deal.md
Version: vNext-0.2
Status: FROZEN
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-07-31
---

# ADR-001: Initial Deal

## Kontext
Der Initial Deal muss die unterschiedlichen Spieldynamiken von `split` und
`shared` erhalten und für Seed, Replay und StateHash vollständig deterministisch
sein.

## Optionen
- A: Freie Verteilung nach Seed ohne feste Struktur.
- B: Klondike-Standardverteilung (1..7 Tableau-Spalten, Rest Stock) mit zwei
  expliziten Deal-Modi.

## Entscheidung
Option B: Beide Spielvarianten sind normativ und gleichwertig.

Gemeinsame Regeln:
- Der in `DETERMINISM.md` definierte RNG wird verwendet.
- Jeder Spieler erhält sieben Tableau-Spalten mit 1 bis 7 Karten (28 Karten).
- Nur die jeweils oberste, also letzte Karte einer Tableau-Spalte ist aufgedeckt.
- Die verbleibenden 24 Karten je Spieler bilden verdeckt den Stock.
- Waste und alle acht globalen Foundations starten leer.
- Array-Konvention: Die oberste Karte eines Stacks ist immer das letzte Element.

`split`:
- Es werden zwei vollständige 52-Karten-Decks erzeugt.
- Jeder Spieler erhält exklusiv ein Deck.
- Die RNG-Streams werden aus den UTF-8-Seed-Strings
  `<matchSeed>::split::p1` und `<matchSeed>::split::p2` abgeleitet.
- Beide Decks werden unabhängig per Fisher-Yates gemischt und danach separat
  nach Klondike verteilt.

`shared`:
- Es wird ein vollständiges 104-Karten-Doppeldeck erzeugt.
- Der RNG-Stream wird aus `<matchSeed>::shared` abgeleitet.
- Das Doppeldeck wird einmal per Fisher-Yates gemischt.
- Die gemischten Karten werden in Reihenfolge alternierend verteilt: Index 0 an
  `p1`, Index 1 an `p2`, Index 2 an `p1` usw.
- Dadurch erhält jeder Spieler exakt 52 zufällige Karten, die anschließend
  separat nach Klondike verteilt werden.

Karten behalten ihre globale `cardId` beim Mischen und Verteilen. Die
Spielerzuordnung ist Zonenbesitz und wird nicht durch Umschreiben der `cardId`
ausgedrückt.

## Konsequenzen
- Regeln und Tests richten sich an Klondike-Start.
- `split` und `shared` behalten ihre unterschiedliche Spieldynamik.
- Gleicher Seed und gleicher Modus erzeugen denselben Startzustand.
- Der Modus ist verpflichtender Bestandteil von Match-Setup, Snapshot und
  Replay-Header.

## Status
- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- 2026-07-31: Beide v1-Spielvarianten bleiben erhalten. Für `shared` ist das
  gewünschte iOS-Verhalten (104 Karten gemeinsam mischen und alternierend
  verteilen) normativ.

## Open Questions
- (leer – bewusst offen)

## Next Steps
- (leer – vom Orchestrator gepflegt)
