# Dashboard/MCP Handoff: Web Score and iPad Landscape Layout

Date: 2026-08-06  
Repository: `micmuller/solitaire-race`  
Branch: `vNext-authoritative-engine`
Implementation commit: `3fcd96f`

## Day close status

- Implementation and documentation complete for today's hotel test build.
- Full server suite: 77 tests passed.
- iPad landscape verified at `1024x768` without vertical gameplay clipping.
- Live two-device playtest remains the next user acceptance step.

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
4. Link implementation commit `3fcd96f`.
5. Record server-restart persistence as deferred future work.

## Persistence boundary (deferred)

- Browser refresh or a temporary client disconnect can resume the same match
  while the server process and in-memory MatchSession continue running.
- A server restart, crash or redeployment currently loses the match, including
  its score, because no persistent store is implemented.
- This limitation is accepted for the current test phase. No persistence change
  is included in today's build.
- A future persistence phase should store authoritative snapshots and ActionLog,
  restore sessions on startup, and introduce durable match/player identities.
