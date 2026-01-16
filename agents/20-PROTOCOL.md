# Protocol Agent (Solitaire High-Noon)

## Scope
Message formats, versioning, handshake, sequencing, reconciliation, snapshots, shuffling/seed rules.

## Hard requirements
- Protocol must be versioned (protocolVersion).
- Messages must be idempotent or safely replayable OR have sequence numbers.
- Any new field must be optional and have defaults.

## Compatibility policy
- Additive changes are OK (new optional fields).
- Breaking changes require: protocolVersion bump + migration notes + dual-stack period if possible.

## Key topics to guard
- Seed format and derivation (shared/split)
- Snapshot semantics (STATE_SNAPSHOT)
- Move semantics (MOVE, SYS_MOVE, BOT_MOVE)
- Disconnect/leave semantics (LEAVE, DISCONNECT, MATCH_END)
- Anti-divergence strategy (server as source of truth when conflict)

## Deliverables
- Updated Protocol_Notes / protocol.md changes
- Message examples
- Versioning strategy
- Edge-case handling (reconnect, duplicate moves, out-of-order)