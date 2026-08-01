# Solitaire HighNoon vNext Server

Official development branch: `vNext-authoritative-engine`.

## Baseline

The branch contains the Stable 1.0 server baseline from commit `d0f4127`
(`v1.0.0`) and the frozen vNext Contract Pack. Stable code is available as
infrastructure and behavioral reference; its hybrid gameplay authority is not
the vNext core.

## Scope

New authoritative gameplay code, replay tooling and their tests live under
`vnext/`. Existing WebSocket, match/lobby, routing, deployment and logging code
outside this directory may be reused through explicit adapters.

The normative contract starts at `vnext/docs/CONTRACT_PACK.md`. No engine code
may define behavior that conflicts with it.

The first executable authoritative shell starts through `npm run start:vnext`.
See `vnext/server/README.md` for endpoints and the manual smoke-test flow. The
frozen v1 server remains available through `npm start`.

The platform-neutral behavioral client reference lives under `vnext/client`.
With the vNext server running, `npm run simulate:vnext` connects both `p1` and
`p2` to one match and verifies authoritative convergence without a UI.

## Branch Rule

- `main` remains the Stable 1.0 line.
- `vNext-authoritative-engine` is the only server vNext development line.
- Do not create parallel `1.1` or alternate authoritative-core branches.
- Stable fixes are merged into vNext deliberately; vNext architecture is not
  backported to Stable 1.0.
