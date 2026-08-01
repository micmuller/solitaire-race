---
Document: CONTRACT_PACK.md
Version: vNext-0.1
Status: FROZEN
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-07-31
---

# Contract Pack

## Purpose
Single Entry Point für den Phase-1-Contract. Dieses Dokument ist die normative Einstiegsreferenz für Phase 1 und definiert die verbindliche Lesereihenfolge. Alle Phase-1-Implementierungen und Reviews müssen diese Struktur als Quelle der Wahrheit verwenden. Bei Widerspruch zwischen Contract-Dokumenten gilt die Reading Order (oben nach unten) als Auflösungsregel.

Dieses Contract-Pack ist die einzige normative Quelle für vNext. Das Repository
`highnoon-protocol` ist als Legacy-v1-Archiv klassifiziert und darf keine
abweichenden vNext-Verträge definieren.

## Normative Basis
- `GAME_RULES_vNext.md`

## Core Principles
- server-authoritative: Nur der Server mutiert den State; Clients senden ausschließlich Intents/Actions.
- determinism: Gleiche Inputs (seed + action log) erzeugen denselben StateHash.
- replayability: Jedes Match muss offline replaybar sein; der Hash dient als Verifikationsnachweis.

## Reading Order
1. `PROTOCOL.md`
2. `DETERMINISM.md`
3. `REPLAY.md`
4. `TEST_MATRIX.md`
5. ADRs (`adr/`)

## Phase 1 Scope
In Scope:
- Protokoll-Envelope und Action-Kinds
- Determinismusregeln
- Replay-Definition
- Test-Gates

Out of Scope:
- iOS/UI/UX
- Implementierung von `initMatch`/`applyAction`
- Bot- oder Test-Implementierungen

## Gate-before-coding Checkliste
- `PROTOCOL.md`: Envelope + Action-Schemas + Reject Codes vollständig und ohne TODOs.
- `DETERMINISM.md`: RNG/Seed, Canonicalization und alle Tie-Breaks definiert.
- `REPLAY.md`: ActionLog-Format vollständig und Golden-Seeds-Liste vorhanden.
- ADRs: `ADR-001` bis `ADR-005` stehen auf „Approved“, bevor Coding beginnt.

## Change Process
- Änderungen an Protokoll, Regeln oder Determinismus nur via ADR.
- „Frozen (Phase 1)“ bedeutet: keine semantischen Änderungen; nur Klarstellungen ohne Bedeutungsänderung.

## Links
- `PROTOCOL.md`
- `DETERMINISM.md`
- `REPLAY.md`
- `TEST_MATRIX.md`
- `GAME_RULES_vNext.md`
- `adr/ADR-001-initial-deal.md`
- `adr/ADR-002-recycle-order.md`
- `adr/ADR-003-empty-tableau.md`
- `adr/ADR-004-reject-vs-airbag.md`
- `adr/ADR-005-state-hash.md`
- `adr/ADR-006-state-and-card-model.md`
- `adr/ADR-007-versioning.md`
- `adr/ADR-008-apply-action-transaction.md`
- `adr/ADR-009-replay-harness-and-golden-gate.md`
- `adr/ADR-010-authoritative-server-shell.md`
- `adr/ADR-011-thin-client-state-machine.md`

## Status
- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- (leer – wird über ADRs oder Review gefüllt)

## Open Questions
- (leer – bewusst offen)

## Next Steps
- (leer – vom Orchestrator gepflegt)
