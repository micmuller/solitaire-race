---
Document: ADR-007-versioning.md
Version: 1.0.0
Status: FROZEN
Phase: Phase 2 - Greenfield Server Engine
Last-Updated: 2026-07-31
---

# ADR-007: Independent Version Axes

## Context

Product releases, network compatibility, game rules and canonical state have
different compatibility boundaries. Reusing one `1.1` label for all of them
would make replay and client compatibility ambiguous.

## Decision

Solitaire HighNoon vNext uses four independent SemVer axes:

- `appVersion`: deployable product/server version. Initial vNext value is
  `1.1.0-alpha.1`.
- `protocolVersion`: client/server wire compatibility. vNext starts at `2.0.0`
  because it is incompatible with the Legacy v1 relay protocol.
- `rulesVersion`: gameplay semantics used by engine and replay. Initial value
  is `1.0.0`.
- `schemaVersion`: canonical state representation. Initial value is `1.0.0`.

SemVer rules apply independently:

- PATCH: compatible correction with no contract meaning change.
- MINOR: backward-compatible additive change on that axis.
- MAJOR: incompatible change requiring explicit migration or rejection.

Pre-release identifiers are used only for deployable app releases. Git branches
are development lines and are not versions. Commits do not automatically bump
versions.

Replay headers MUST contain `protocolVersion`, `rulesVersion` and mode. State
MUST contain `schemaVersion` and `rulesVersion`. Network envelopes MUST contain
`protocolVersion`. Release artifacts MUST expose `appVersion`.

## Consequences

- A deployment fix can bump `appVersion` without invalidating replays.
- A rule change is visible even when the state shape remains compatible.
- Legacy clients are rejected by protocol major version rather than guessed
  from message shape.

## Status

- [ ] Draft
- [X] Reviewed
- [X] Approved
- [X] Frozen (Phase 2 foundation)

## Decisions

- 2026-07-31: Product, protocol, rules and schema versions are independent.

## Open Questions

- (none)
