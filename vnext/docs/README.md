---
Document: README.md
Version: vNext-0.1
Status: FROZEN
Phase: Phase 1 – Contract & Determinism First
Last-Updated: 2026-08-05
---

# vNext Docs

Kurzbeschreibung: Vertragliche Dokumente für Phase 1 (Contract & Determinism First).

## Normative Authority

Dieses Verzeichnis ist die einzige normative Quelle für Regeln, Protokoll,
Determinismus, Replay und Architekturentscheidungen von Solitaire HighNoon
vNext.

Das separate Repository `highnoon-protocol` dokumentiert den Legacy-v1-Stand
und ist nicht normativ für vNext. Inhalte daraus dürfen nur nach Review und
expliziter Übernahme in dieses Contract-Pack verwendet werden.

Falls die normative Protokollquelle später wieder in ein eigenes Repository
verschoben wird, erfolgt dies als bewusste, versionierte Architekturentscheidung
ohne parallele Pflege zweier Wahrheiten.

Startpunkt: `CONTRACT_PACK.md`.

Release- und Branch-Regeln: `RELEASE_LINES.md`.

## Status
- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 1)

## Decisions
- ADR-001 bis ADR-005 wurden am 2026-07-31 fachlich gegengeprüft,
  präzisiert und konsistent eingefroren.
- 2026-07-31: `vnext/docs` ist die normative vNext-Quelle;
  `highnoon-protocol` ist das Legacy-v1-Archiv.
- 2026-08-05: ADR-013 erlaubt die serverseitige Revalidierung veralteter
  Intents, damit unabhängige gleichzeitige Race-Moves nicht blockieren.

## Open Questions
- (leer – bewusst offen)

## Next Steps
- (leer – vom Orchestrator gepflegt)
