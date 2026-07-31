# Authoritative GameCore

This directory is the greenfield, server-authoritative Solitaire HighNoon core.
It has no dependency on legacy server, WebSocket, PWA, iOS or bot gameplay
code. `vnext/test/core-boundary.test.js` enforces that boundary.

## Public API

Import from `vnext/core/index.js`.

- `initMatch(seed, mode)` returns `{ rev, state, stateHash }`.
- `checkInvariants(state)` returns `{ ok, violations }`.
- `assertInvariants(state)` throws `INTERNAL_INVARIANT_BREACH` on failure.
- `canonicalize(value)` creates canonical JSON.
- `stateHash(rev, state)` hashes canonical `{rev,state}` with SHA-256.
- `fnv1a32`, `createMulberry32` and `shuffle` implement deterministic RNG.

`mode` is `split` or `shared`. Stack top is always the final array element.
The normative representation is defined in
`vnext/docs/adr/ADR-006-state-and-card-model.md`.

## Next Boundary

`applyAction` will be added here as a pure transactional operation. Network and
legacy compatibility behavior belongs in later adapters, not in this module.
