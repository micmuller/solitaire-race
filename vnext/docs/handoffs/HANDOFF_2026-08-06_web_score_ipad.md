# Dashboard/MCP Handoff: Web Score and iPad Landscape Layout

Date: 2026-08-06  
Repository: `micmuller/solitaire-race`  
Branch: `vNext-authoritative-engine`

## Versions

- Server/app: `1.1.0-alpha.4`
- Web client: `0.1.0-alpha.4`
- Protocol: `2.3.0`
- Schema: `1.2.0`
- Rules: unchanged (`1.0.0`)

## Dashboard summary

- P1/P2 headings now show authoritative foundation points.
- Player score is part of canonical state and cannot drift from the total
  number of foundation cards.
- Landscape tablet cards, ranks and suits are larger.
- Tableau columns are centered with fixed gaps instead of stretching across
  unused horizontal space.
- Stack overlap is calculated from card count and viewport height and is
  recalculated after rotation/resizing, keeping tall stacks on screen.

## Dashboard/MCP follow-up

1. Register ADR-014 and schema `1.2.0`.
2. Record protocol `2.3.0` and the alpha.4 server/Web versions.
3. Add iPad landscape and score attribution to the Web acceptance checklist.
4. Link the implementation commit after merge/push.
