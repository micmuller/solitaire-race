---
Document: DETERMINISM.md
Version: vNext-0.1
Status: DRAFT
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-02-07
---

# Determinism

## Zieldefinition
Same inputs → same state → same hash.

## Seed & RNG Regeln
- Seed ist ein String und Teil des Match-Setups.
- RNG MUSS deterministisch und plattformneutral sein.
- RNG MUSS Mulberry32 (32-bit) sein.
- Der Seed-String MUSS deterministisch in einen 32-bit unsigned int konvertiert werden:
  - UTF-8 Bytes des Seed-Strings.
  - FNV-1a 32-bit Hash über diese Bytes.
- Der RNG-State MUSS mit diesem 32-bit Wert initialisiert werden.
- Systemzeit, echte Zufallsquellen und Thread-Timing sind verboten.
- `Math.random` ist verboten.
- Plattform-spezifische RNGs sind verboten.
- Keine Floating-Point-Abhängigkeiten (nur 32-bit Integer-Operationen).

## Canonical State Representation
- Canonical JSON MUSS UTF-8 kodiert sein.
- Objekt-Keys MÜSSEN lexikographisch sortiert werden, auf jeder Verschachtelungsebene.
- Arrays MÜSSEN ihre definierte Ordnung beibehalten (kein Sortieren, außer explizit spezifiziert).
- Canonical JSON MUSS minifiziert sein (keine Whitespace-Varianten).
- Numbers MÜSSEN als Integer serialisiert werden, wo anwendbar (keine Floats; keine wissenschaftliche Notation).
- Fehlende Felder sind in Canonical State verboten; required fields MÜSSEN immer vorhanden sein.
- `null` vs. fehlendes Feld MUSS normalisiert werden: fehlende Felder sind unzulässig.
- Arrays sind stabil geordnet und vollständig.
- Keine abgeleiteten Felder (nur notwendige Zustandsdaten).

## Deterministic Tie-Break Rules
- Jede Auswahlregel MUSS deterministisch und total-geordnet sein (keine Mehrdeutigkeit).
- Foundation-Auswahl (bei mehreren legalen Zielen):
  1) Höchster resultierender Top-Rank NACH dem Platzieren.
  2) Niedrigster `foundation[j]` Index.
- Tableau-Ziel-Auswahl (bei mehreren legalen Zielen):
  1) Niedrigster Ziel-`tableau[i]` Index.
  2) Niedrigster Rank der obersten Karte des verschobenen Stacks (Ace low).
  3) Niedrigste `cardId` (lexikographisch) als finaler Tie-Breaker.

## Hashing
- SHA-256 über den canonical JSON String von exakt `{rev, state}`.
- Wrapper-Objekt MUSS exakt die Keys `rev` und `state` in dieser Reihenfolge enthalten.
- `rev` wird im Hash-Inhalt mitgeführt.
- Beispiel (normativ für Feldnamen und Struktur):
  - `{"rev":310,"state":{...}}`

## Required Deterministic Logging
Jeder Step schreibt:
- `rev`
- `stateHash`
- `action`
- `result` (ack/reject/snapshot)
- Für `ack` MUSS das Log `revAfter` und `stateHashAfter` enthalten.
- Für `reject` MUSS das Log `revUnchanged`, `stateHashUnchanged` und `rejectCode` enthalten.
- Für `snapshot` MUSS das Log `rev`, `stateHash` und `reason` enthalten.
- `reason` ist normativ: `CONNECT` | `STATE_REQUEST` | `SEQ_GAP` | `BASE_REV_MISMATCH` | `AIRBAG`.
- Logs MÜSSEN ausreichen, um einen Replay zu ermöglichen und den ersten Divergenz-Step zu identifizieren.

## Non-Determinism Pitfalls (Normativ)
- Keine Iteration über Hash-Maps ohne Sortierung.
- Kein Unterschied zwischen `null` und fehlenden Feldern.
- Keine von Plattform abhängigen Integer/Float-Konvertierungen.
- Keine Zeit- oder Locale-Abhängigkeiten.
- Stabile Iterationsreihenfolge ist erforderlich; niemals auf JS Object Insertion Order verlassen.
- Kein `localeCompare`; IDs MÜSSEN byte/ASCII-basiert verglichen werden.
- Keine implizite Typ-Koerzierung; Integer-Operationen immer explizit (z. B. `>>>0`).

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
