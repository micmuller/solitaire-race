# vNext Web Adapter

The vNext Web client is served by the authoritative shell at `/vnext/web/`.
It is a separate path from frozen `public/` and imports none of the v1 scripts.

Current vertical slice:

- create a split/shared match as host `p1` and expose a shareable invite URL
  that auto-joins as `p2`;
- create a split/shared match as host `p1` with a server-managed bot connected
  as `p2`, using selectable Easy/Mittel/Schwer bot speed;
- create and observe a Bot-vs-Bot match with both `p1` and `p2` controlled by
  server-managed bots at the selected speed;
- restore host/join identity from `?matchId=...&role=p1|p2` URL state;
- connect through Protocol 2.2.0 and render the initial authoritative snapshot;
- render both players, all tableaus and eight global foundations;
- submit stock draw/recycle and top-tableau flip as Action Intents;
- select waste or a face-up tableau suffix and submit tableau/foundation moves
  through a second target click/tap;
- drag the waste top card or a face-up tableau suffix onto the same
  tableau/foundation intent targets without local state mutation;
- animate card position changes only after an authoritative ack render and
  play synthesized audio cues for ack/reject/recovery results;
- generate readable random seeds and restart the active host match with either
  the same seed or a new random seed;
- keep a rejected selection available for another target and allow explicit or
  Escape-key cancellation;
- update only after authoritative ack/snapshot;
- expose connection, revision, short hash, pending, reject and GameOver status.

The visual structure, felt treatment, card layout and responsive board geometry
are derived from the established v1 Web UI. No v1 state, rule, move, snapshot,
echo, bot or local deal code is included.

Still pending:

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

Lobby and invite flow use deterministic Web-slice identity: host creates and
connects as `p1`, the invite link opens the same match as `p2`, and refresh
preserves identity through URL state. The vNext shell exposes `/vnext/config`
so invite links use the LAN-reachable server address instead of `127.0.0.1`
when hosted locally; seed and mode display are synchronized from the
authoritative snapshot.

The Restart control is host-only and server-authoritative: host `p1` keeps the
same match and invite link, while the server resets the session and broadcasts a
`RESTART` snapshot so `p2` returns to the same fresh state. New-seed restarts
use the same path with a newly generated seed. Joined `p2` clients cannot start
a restart.

Starting, joining or restarting another match stops the currently managed Web
bot or bots. The explicit `Bot stoppen` control stops managed bots without
changing the current match.

When the connected role is `p2`, host/setup actions are disabled to avoid
accidentally starting a new `p1` match. `p2` can use `Aufgeben` to send a
server-authoritative `resign`, which broadcasts a finished GameOver state.

Next follow-up: PWA packaging for the new entry point.
