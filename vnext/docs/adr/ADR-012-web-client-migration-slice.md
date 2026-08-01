# ADR-012: Separate vNext Web Client Migration Slice

- Status: Approved
- Date: 2026-08-01

## Context

The v1 Web client contains valuable board, card and responsive presentation,
but its large gameplay script combines UI with local rules, mutation, snapshots,
echo handling and bot behavior. Incremental removal inside that script would
create another hybrid authority phase.

## Decision

The vNext Web client is a separate static entry point under `vnext/web`, served
at `/vnext/web/`. The frozen `public/` client remains unchanged.

The new client reproduces the proven visual structure with small purpose-built
rendering modules. It implements ADR-011 directly in browser APIs and imports no
v1 JavaScript and no server GameCore. UI interaction emits only Action Intents;
rendering consumes only authoritative ack/snapshot state.

The first vertical slices cover match create/join, full board rendering,
draw/recycle, face-down tableau flip and click/tap source-target intents for
tableau and foundation moves. Drag gestures, animation and audio remain
presentation-only follow-up work on this path.

## Consequences

- Existing visual work remains the design reference without migrating hybrid
  gameplay logic.
- v1 and vNext Web clients can be tested independently during migration.
- Some presentation code is intentionally rewritten because it cannot be
  safely extracted from the intertwined v1 gameplay file.
- The Web slice provides the concrete UI-level contract before iOS adaptation.
