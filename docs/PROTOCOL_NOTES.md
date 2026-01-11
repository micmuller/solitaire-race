# Protocol Notes – Solitaire HighNoon (Server v2.3.4)

This document describes the practical WebSocket protocol as implemented in `server.js`
and the match metadata model implemented in `matches.js`.

---

## 1) Authoritative Sources (Reality Check)

### Match metadata (authoritative on server)
Stored in-memory in `matches.js`:
- matchId, seed
- status: waiting | ready | running | finished
- players[] with playerId (p1/p2/bot), nick, role, connected, isBot, difficulty
- timestamps (createdAt, lastActivityAt)
- optional: botState, botStateTick
- optional slot: lastGameState (exists but is not actively used by server.js today)

### Room membership + message routing (authoritative on server)
Handled in `server.js`:
- rooms: Map(room -> Set(ws))  // who is in which room
- server assigns each connection a `cid` (client id)
- playerDirectory for presence list (cid, nick, room, lastSeen)

### Gameplay state (current design)
Not authoritative on server:
- Full game state is provided by a client via `sys.type = state_snapshot`
- Server broadcasts this snapshot to the match room
- Server can request snapshots via `sys.type = state_request`

---

## 2) Envelope Format

Typical server-to-client messages use this envelope:

{
  "sys": { ... },
  "from": "srv",
  ...optional extra fields...
}

Client messages also use:
{
  "sys": { "type": "...", ... },
  "from": "pwa" | "iPadOS" | "... (client-defined)"
}

Non-sys messages (e.g. `{ move: ... }`) are forwarded by the server to the room
as raw JSON, excluding the sender.

---

## 3) Connection / Identity

### Server-assigned Client ID (cid)
- On every WS connection server generates `cid` and stores it on ws.__cid
- Server sends `sys: { type: "hello_ack", cid, nick, room, at, serverVersion }`
  after receiving `sys.type="hello"`.

This `cid` is also used in snapshots:
- `fromCid` field indicates who sent the snapshot (for "mirror"/self-identification).

---

## 4) Core SYS Messages (Match Lifecycle)

### server_info  (server -> client)
Sent right after connect:
sys.type = "server_info"
fields: { version, at }

### hello  (client -> server -> room)
Client announces nick (and triggers hello_ack).
sys.type = "hello"
fields: { nick? }

Server behavior:
- updates ws.__nick and playerDirectory entry
- sends hello_ack to that client
- message is still broadcast to the room (no early return), used for handshake flows

### hello_ack (server -> client)
sys.type = "hello_ack"
fields: { cid, nick, room, at, serverVersion }

---

## 5) Match Creation / Join

### create_match (client -> server)
sys.type = "create_match"
fields: { nick? }

Server behavior:
- delegates to matches.js createMatchForClient(ws, nick, rooms)
- moves ws into room == matchId
- replies to host:

### match_created (server -> host)
sys.type = "match_created"
fields: { matchId, seed, playerId:"p1", role:"host", status, hostNick, match }

Also server sends immediately:
- state_request to host
- match_update to host (initial players list)

### join_match (client -> server)
sys.type = "join_match"
fields: { matchId, nick? }

Server behavior:
- delegates to matches.js joinMatchForClient(ws, matchId, nick)
- moves ws into room == matchId
- replies to guest with match_joined
- broadcasts state_request and match_update to room
- auto-start when 2 players and status == ready:
  broadcasts reset + state_request, then flips status to running

### match_joined (server -> guest)
sys.type = "match_joined"
fields: { matchId, seed, playerId, role:"guest", status, hostNick }

### match_update (server -> room)
sys.type = "match_update"
fields: { matchId, status, players:[...] }

### match_error (server -> client)
sys.type = "match_error"
fields: { for:"create_match"|"join_match", code, message, matchId? }

Known codes from matches.js:
- match_not_found
- match_full
- match_finished

---

## 6) Auto-Join Compatibility (Important)

If a client connects directly to a room whose name equals a matchId and then sends `hello`,
server may treat this as an implicit join attempt:

Trigger:
- sys.type="hello"
- roomName != lobby/default
- ws.__playerId not set yet

Effect:
- joinMatchForClient(ws, roomName, nick)
- send match_joined
- broadcast state_request + match_update
- auto-start with reset + state_request when 2 players present

This exists to support flows where clients switch rooms by reconnecting
without sending explicit join_match.

---

## 7) State Sync (Snapshots)

### state_request (server -> room) and (client -> server -> room)
sys.type = "state_request"
fields: { matchId?, seed?, at?, fromCid? }

Server forwards state_request within the match room.

### state_snapshot (client -> server -> room)
sys.type = "state_snapshot"
Expected envelope from client:
{ sys:{ type:"state_snapshot", matchId?, seed?, state:{...} }, from:"..." }

Server behavior:
- determines matchId from sys.matchId or current room
- broadcasts to room:

Broadcasted payload:
sys.type = "state_snapshot"
fields:
- matchId
- seed (sys.seed || state.seed || null)
- at
- fromCid (server-assigned cid of sender)
- state (the full snapshot object)

Notes:
- Server does not currently validate or store snapshot as authoritative state;
  it acts as a relay + coordinator.

---

## 8) Moves (Non-SYS)

Client sends:
{ "move": { "kind": "...", ... }, "from": "..." }

Server behavior:
- logs kind + payload
- broadcasts raw message to room excluding sender

(Validation is currently client-side / peer-side, not server authoritative.)

---

## 9) Presence / Online List

### who_is_online (client -> server)
sys.type = "who_is_online"

### player_list (server -> client)
sys.type = "player_list"
fields: players: [{ cid, nick, room, isSelf }]

---

## 10) Invites (Push)

### invite (client -> server)
sys.type="invite"
fields: { matchId, targetCid, fromNick? }

Server sends to target:
sys.type="invite"
fields: { matchId, fromCid, fromNick, createdAt }

And confirms to sender:
sys.type="invite_sent"
fields: { matchId, targetCid, targetRoom? }

### invite_accept / invite_decline (client -> server)
sys.type="invite_accept" | "invite_decline"
fields: { matchId, hostCid, fromNick? }

Server forwards to host (if online):
sys.type="invite_accept" | "invite_decline"
fields: { matchId, fromCid, fromNick, at }

Important:
- Actual joining still requires a separate join_match from the client.

Errors:
- invite_error for missing fields / target offline

---

## 11) Bot Control

### spawn_bot (client -> server)
sys.type="spawn_bot"
fields: { difficulty?, nick?, matchId? }

Server behavior:
- if in lobby/default: creates a new match, moves ws into match room
- creates/registers serverbot instance (serverbot.js)
- manages heartbeat tick (interval)
- may auto-start bot match with reset and mark running
- responds:

### bot_spawned (server -> client)
sys.type="bot_spawned"
fields: { matchId, botId, difficulty, nick }

### bot_error (server -> client)
sys.type="bot_error"
fields: { for:"spawn_bot", code, message }

### bot_state (client -> server)
sys.type="bot_state"
fields: { matchId?, tick?, state:{...} }

Server behavior:
- only accepted if a serverbot exists for that matchId
- forwards snapshot to serverbot.handleBotStateUpdate(matchId, snap, fromCid, tick)

---

## 12) Rooms

Room names:
- "lobby" / "default" are lobby-like rooms
- match rooms use matchId (e.g. "DUEL4")

Server serves PWA from /public and upgrades WS on path `/ws?room=<room>`.

---

## 13) Compatibility / Future Work (Recommendations)

- Introduce protocolVersion as a required field in hello or server_info.
- Add test vectors for shared shuffle: seed -> first N card IDs for JS + Swift.
- Consider storing last snapshot on server (matches.js lastGameState) for reconnection.
- Consider server-side move validation if cheating or divergence becomes an issue.