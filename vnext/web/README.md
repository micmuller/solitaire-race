# vNext Web Adapter

The vNext Web client is served by the authoritative shell at `/vnext/web/`.
It is a separate path from frozen `public/` and imports none of the v1 scripts.

Current vertical slice:

- create a split/shared match or join an existing match as `p1`/`p2`;
- connect through Protocol 2.0.0 and render the initial authoritative snapshot;
- render both players, all tableaus and eight global foundations;
- submit stock draw/recycle and top-tableau flip as Action Intents;
- select waste or a face-up tableau suffix and submit tableau/foundation moves
  through a second target click/tap;
- drag the waste top card or a face-up tableau suffix onto the same
  tableau/foundation intent targets without local state mutation;
- animate card position changes only after an authoritative ack render and
  play synthesized audio cues for ack/reject/recovery results;
- keep a rejected selection available for another target and allow explicit or
  Escape-key cancellation;
- update only after authoritative ack/snapshot;
- expose connection, revision, short hash, pending and reject status.

The visual structure, felt treatment, card layout and responsive board geometry
are derived from the established v1 Web UI. No v1 state, rule, move, snapshot,
echo, bot or local deal code is included.

Still pending:

- lobby/invite flow and production identity assignment;
- PWA packaging for the new entry point.

## Session Close 2026-08-01

Manual browser smoke testing passed for match creation, authoritative board
rendering, click/tap tableau and foundation moves, and automatic reveal of the
newly exposed tableau top card. The automatic reveal is performed by the Core
inside the accepted move, not by a follow-up client action.

Automated status at close: 52 vNext tests and 54 total tests pass. The
authoritative Web server was restarted with the current Core and the repository
was clean and synchronized with `origin/vNext-authoritative-engine`.

## Next Session

Drag-and-drop is implemented as a second input path over the existing
rule-neutral selection and intent mapping. Desktop pointer and mobile-width
pointer smokes passed with seed `DRAG-SMOKE-4`: draw to `rev 1`, drag waste
top card to tableau pile 6, authoritative `tableauMove` ack to `rev 2`, no
browser console errors.

Animation and audio are adapted to the authoritative ack/reject/snapshot flow.
Cards are animated with a render-before/render-after position comparison after
server ack; reject and recovery snapshots play non-success cues and do not
animate a successful move.

Next follow-up: lobby/invite flow and production identity assignment.
