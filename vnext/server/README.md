# vNext Authoritative Server Shell

This is the executable vNext server entry point. It is isolated from the frozen
v1 gameplay modules and uses only the public vNext core.

Start locally:

```sh
npm run start:vnext
```

The default address is `http://127.0.0.1:3011`. Use
`npm run start:vnext -- --host 0.0.0.0 --port 3011` for LAN access.

The first vNext Web adapter is available at `http://127.0.0.1:3011/vnext/web/`.
It is separate from the frozen v1 Web client.

Run the first smoke test in a second terminal:

```sh
npm run smoke:vnext
```

Current smoke scope:

- Each invocation creates a new match with seed `MANUAL-SMOKE-001` in `split`
  mode.
- The smoke client connects only as `p1`, receives the initial snapshot and
  submits one `draw` action.
- Running the command in another terminal creates another independent match; it
  does not join the first match as `p2`.
- The server already supports one `p1` and one `p2` connection in the same
  match. A separate interactive two-terminal smoke client is intentionally not
  part of this first server-shell milestone.

HTTP endpoints:

- `GET /health`
- `POST /vnext/matches` with `{ "seed": "...", "mode": "split|shared" }`
- `GET /vnext/matches/:matchId`
- `GET /vnext/matches/:matchId/replay`
- `POST /vnext/matches/:matchId/restart` with optional
  `{ "seed": "...", "mode": "split|shared" }`
- `POST /vnext/matches/:matchId/bot` with optional
  `{ "clientId": "p2", "speed": "easy|medium|hard|slow|normal|fast", "maxActions": 1000 }`
- `DELETE /vnext/matches/:matchId/bot?clientId=p2`

WebSocket connections use
`/vnext?matchId=<id>&clientId=p1|p2|observer`. The server sends an initial
snapshot and accepts protocol-2.0.0 action envelopes from `p1` and `p2`.
Observer sockets receive authoritative snapshots/acks but are read-only.
Accepted actions are broadcast as authoritative acks containing the resulting
state, revision and hash.
Restart resets the existing match session to revision `0`, resets client
sequences, and broadcasts an authoritative `RESTART` snapshot to connected
peers.
The bot endpoint starts a server-managed thin bot client on the requested free
player id. The delete endpoint stops the managed bot so Web actions such as
starting, joining or restarting a match do not leave an old bot running.

The terminal logs compact structured events such as `MATCH_CREATED`,
`WS_CONNECTED`, `SNAPSHOT_SENT`, `ACTION_RECEIVED`, `ACTION_ACK`,
`ACTION_REJECT`, `MATCH_RESTARTED`, `BOT_STARTED`, `BOT_STOPPED`,
`REPLAY_EXPORTED` and `WS_DISCONNECTED`. State hashes are shortened for
correlation; complete states and card arrays are not logged.

Expected activity for `npm run smoke:vnext` includes `MATCH_CREATED`,
`WS_CONNECTED`, `SNAPSHOT_SENT`, `ACTION_RECEIVED`, `ACTION_ACK` and
`WS_DISCONNECTED`.
