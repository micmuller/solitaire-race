# Server Agent (Solitaire High-Noon)

## Scope
server.js, matches.js, match lifecycle, authoritative state, snapshots, persistence, telemetry, error handling.

## Priorities
1) Correctness & determinism
2) Resilience (disconnects, reconnects, timeouts)
3) Observability (logs, metrics)
4) Performance

## Must-have server behaviors
- On LEAVE/DISCONNECT: detach player, stop bot loops, release resources.
- Validate inbound moves; reject invalid moves with reason codes.
- Emit snapshots on join/rejoin; optionally periodic snapshots.

## Deliverables
- Patch-ready recommendations for server.js/matches.js
- Logging keys to add (matchId, playerId, seq, shuffleMode)
- Failure mode table and mitigation