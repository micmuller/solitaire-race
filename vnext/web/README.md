# vNext Web Adapter

The vNext Web client is served by the authoritative shell at `/vnext/web/`.
It is a separate path from frozen `public/` and imports none of the v1 scripts.

Current vertical slice:

- create a split/shared match or join an existing match as `p1`/`p2`;
- connect through Protocol 2.0.0 and render the initial authoritative snapshot;
- render both players, all tableaus and eight global foundations;
- submit stock draw/recycle and top-tableau flip as Action Intents;
- update only after authoritative ack/snapshot;
- expose connection, revision, short hash, pending and reject status.

The visual structure, felt treatment, card layout and responsive board geometry
are derived from the established v1 Web UI. No v1 state, rule, move, snapshot,
echo, bot or local deal code is included.

Still pending:

- waste/tableau/foundation selection and move gestures;
- animation and audio adaptation;
- lobby/invite flow and production identity assignment;
- PWA packaging for the new entry point.
