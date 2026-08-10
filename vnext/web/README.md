# vNext Web Adapter

The vNext Web client is served by the authoritative shell at `/vnext/web/`.
It is a separate path from frozen `public/` and imports none of the v1 scripts.

Current vertical slice:

- start from a Lobby overlay with locally remembered nickname, create a named
  Lobby game as `p1`, or join an open Lobby game as `p2` without copying an
  invite URL or manually entering a Match-ID;
- create a split/shared match as host `p1` and expose a shareable invite URL
  that auto-joins as `p2` as a technical fallback;
- create a split/shared match as host `p1` with a server-managed bot connected
  as `p2`, using selectable Easy/Mittel/Schwer bot speed;
- create and observe a Bot-vs-Bot match with both `p1` and `p2` controlled by
  server-managed bots at the selected speed;
- restore host/join identity from `?matchId=...&role=p1|p2` URL state;
- connect through Protocol 2.5.2 and render the initial authoritative snapshot;
- keep Start, Restart and Aufgeben in the header while secondary controls live
  in a tabbed overlay menu for Lobby, Spiel, Neues Spiel, Bot, Teilen and Info;
- allow `p1` to end the current Lobby game from the Spiel menu, notify connected
  peers and return the Web client to the Lobby overlay;
- render both players, all tableaus and eight global foundations;
- show each player's authoritative foundation point score next to P1/P2;
- show a completed-match celebration for about 10 seconds before opening the
  final-score dialog after the first player places all own cards;
- let either `p1` or `p2` use `Aufgeben`; resign shows the same score dialog
  immediately without celebration, with `Zur Lobby` for both players and the
  restart menu available only to `p1`;
- replay the same final dialog and celebration sequence from the menu without
  mutating the authoritative match state;
- enlarge cards and rank/suit corners on landscape tablets while dynamically
  tightening tall tableau stacks so they remain visible;
- submit stock draw/recycle and top-tableau flip as Action Intents;
- select waste or a face-up tableau suffix and submit tableau/foundation moves
  through a second target click/tap;
- send the same automatic foundation move by double-clicking with a mouse or
  double-tapping on touch devices when the card can legally move;
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
- recover from `DUPLICATE_SEQ` rejects by adopting the server-provided
  `expectedSeq` before the next action.
- expose an optional Debug overlay from the menu with recent input events,
  intent dispatch, pending duration, server response and sequence/state data.

The visual structure, felt treatment, card layout and responsive board geometry
are derived from the established v1 Web UI. No v1 state, rule, move, snapshot,
echo, bot or local deal code is included.

## Lobby Flow

The normal Web entry flow is now Lobby-first:

1. The player enters a nickname. The browser stores the nickname and opaque
   Lobby session id in local storage.
2. `Start` or `Als P1 hosten` creates a named Lobby game. The server creates
   the underlying authoritative match and assigns the local player to `p1`.
3. Other players open the same Web client, see the Lobby game list, and choose
   `Als P2 beitreten`. The client receives the underlying technical `matchId`
   from the Lobby API and connects as `p2`.
4. The `Teilen` tab keeps the old Match-ID and invite URL tooling for debugging
   and fallback cases.
5. `p1` can use `Spiel beenden` in the Spiel menu to mark the Lobby game
   finished and return connected clients to the Lobby.

The Lobby model already exposes stable `playerId`, `sessionId`, nickname and
reserved history fields (`gamesPlayed`, `gamesWon`, `totalScore`, `bestScore`,
`lastGameAt`). They are in-memory in alpha.13; persistence, leaderboards and
cross-device identity can be added behind the same API later.

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

The GameOver dialog uses the same restart dialog for `Neues Spiel`; it no
longer creates a separate fresh p1-only match. Human-vs-bot and Bot-vs-Bot
restarts stop the old managed bots and start the correct bot setup again after
the authoritative `RESTART` snapshot.

Starting, joining or restarting another match stops the currently managed Web
bot or bots. The explicit `Bot stoppen` control stops managed bots without
changing the current match.

When the connected role is `p2`, host/setup actions are disabled to avoid
accidentally starting a new `p1` match. Both `p1` and `p2` can use `Aufgeben`
to send a server-authoritative `resign`, which broadcasts a finished GameOver
state. The resign dialog skips celebration, keeps the final score visible, and
offers `Zur Lobby`; only `p1` can open the restart menu from there.

Next follow-up: PWA packaging for the new entry point.
