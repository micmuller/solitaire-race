---
Document: ADR-005-state-hash.md
Version: vNext-0.2
Status: FROZEN
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-07-31
---

# ADR-005: State Hash

## Kontext
Einheitliche Definition des State Hashing ist erforderlich.

## Entscheidung
Der StateHash ist der kleingeschriebene hexadezimale SHA-256-Digest über die
UTF-8-Bytes des in `DETERMINISM.md` definierten Canonical JSON von exakt:

`{"rev":<integer>,"state":<canonical-state>}`

Transport-, Log-, Zeit- und Client-Metadaten sind nicht Teil des Hash-Inputs.

## Konsequenzen
- Hash ist plattformneutral und reproduzierbar.
- Replay-Vergleiche sind eindeutig.

## Status
- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- 2026-07-31: Hash-Input, Encoding und Ausgabeformat exakt festgelegt.

## Open Questions
- (leer – bewusst offen)

## Next Steps
- (leer – vom Orchestrator gepflegt)
