# Dashboard/MCP Handoff: Concurrent Race Moves

Date: 2026-08-05  
Repository: `micmuller/solitaire-race`  
Branch: `vNext-authoritative-engine`

## Dashboard summary

Web playtesting found that two actions submitted from the same global revision
blocked one another. The authoritative server now rebases stale intents onto
the latest state instead of treating every global revision change as a lock.

## Versions

- Server/app: `1.1.0-alpha.3`
- Web client: `0.1.0-alpha.3`
- Protocol: `2.2.0`
- Rules: unchanged (`1.0.0`)
- Schema: unchanged (`1.1.0`)

## Functional change

- Independent simultaneous moves by p1 and p2 are accepted in server receipt
  order even when both carry the same older `baseRev`.
- Every action is still revalidated against the latest authoritative state.
- Genuine collisions use the existing deterministic rules rejection.
- Per-client `seq` still prevents duplicate application.
- Sequence gaps and future `baseRev` values still trigger recovery snapshots.

## Dashboard items to update via MCP

1. Mark concurrent move blocking as resolved in Protocol `2.2.0`.
2. Record ADR-013 as the concurrency decision.
3. Update test coverage with simultaneous independent moves, stale intent
   revalidation and future-revision recovery.
4. Record the deployment versions above and link the implementation commit.
5. Keep a follow-up item for multi-process per-match ordering before horizontal
   server scaling.

## Test focus for hotel playtest

- Both players repeatedly draw or move private tableau cards at the same time.
- Both players attempt foundation moves in quick succession.
- Confirm that legal independent moves both appear and no card duplicates.
- Confirm an actually invalidated second move gets feedback but does not freeze
  later moves.
- Confirm winner/end state remains identical for both clients.

## Source references

- `vnext/server/matchSession.js`
- `vnext/replay/index.js`
- `vnext/docs/PROTOCOL.md`
- `vnext/docs/adr/ADR-013-concurrent-intent-rebase.md`
- `vnext/test/server-shell.test.js`
- `vnext/test/client-adapter.test.js`
