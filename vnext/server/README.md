# vNext Authoritative Server Shell

This is the executable vNext server entry point. It is isolated from the frozen
v1 gameplay modules and uses only the public vNext core.

Start locally:

```sh
npm run start:vnext
```

The default address is `http://127.0.0.1:3011`. Use
`npm run start:vnext -- --host 0.0.0.0 --port 3011` for LAN access.

Run the first smoke test in a second terminal:

```sh
npm run smoke:vnext
```

HTTP endpoints:

- `GET /health`
- `POST /vnext/matches` with `{ "seed": "...", "mode": "split|shared" }`
- `GET /vnext/matches/:matchId`
- `GET /vnext/matches/:matchId/replay`

WebSocket connections use
`/vnext?matchId=<id>&clientId=p1|p2`. The server sends an initial snapshot and
accepts protocol-2.0.0 action envelopes. Accepted actions are broadcast as
authoritative acks containing the resulting state, revision and hash.
