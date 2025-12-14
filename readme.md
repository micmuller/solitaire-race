

# Solitaire HighNoon (Solitaire‑Race)

Solitaire HighNoon is a fast, competitive solitaire duel game.

Two players (or a player versus a server‑side bot) play **the same solitaire layout generated from a shared seed**.  
All moves are mirrored live, enabling real‑time race‑style gameplay.

The project consists of a WebSocket server, a PWA‑optimized client, and a modular server‑side bot engine.

---

## Features

- Real‑time multiplayer via WebSockets
- Seed‑synchronized solitaire boards (fair & deterministic)
- Lobby, invite, and match rooms
- Progressive Web App (PWA), optimized for tablets
- Server‑side AI bot with snapshot‑based decision logic
- Extensive debug & logging controls for bot development

---

## Project Structure

- `server.js`  
  WebSocket server, lobby handling, match lifecycle, message routing

- `serverbot.js`  
  Server‑side bot engine (tick loop, snapshot evaluation, move decisions)

- `public/` / client files  
  Client UI and game logic (e.g. `game.js`, `startmenu.js`)

---

## Requirements

- Node.js (latest LTS recommended)
- npm

Install dependencies:

```bash
npm install
```

---

## Starting the Server

Default start:

```bash
node server.js
```

The WebSocket server typically listens on port **3001** (depending on configuration in `server.js`).

---

## Server Bot Debug & Logging

The server bot is controlled via environment variables.

### Enable Bot Debug Mode

```bash
BOT_DEBUG=1 node server.js
```

When enabled, the server bot prints detailed logs:
- received `bot_state` snapshots
- decision inputs
- selected moves
- internal metrics

---

### Adjust Log Throttling

To reduce repetitive logs (heartbeats, metrics, ticks), use:

```bash
BOT_LOG_THROTTLE_MS=2000
```

Example:

```bash
BOT_DEBUG=1 BOT_LOG_THROTTLE_MS=2000 node server.js
```

This limits repeated log lines to once every N milliseconds.

---

## Bot Architecture (High‑Level)

1. Client sends periodic `bot_state` snapshots during bot matches  
2. `server.js` forwards snapshots to `serverbot.js`
3. `serverbot.js`:
   - stores latest snapshot per match
   - runs a timed decision tick
   - evaluates possible moves
   - emits standard move payloads (`flip`, `toFound`, `toPile`)
4. Moves are broadcast using the same protocol as human players

This guarantees that bot and human players follow identical rules.

---

## Common Bot Logs

- `bot_state received`  
  Snapshot successfully received from client

- `heartbeat / metrics`  
  Bot tick is running, snapshot evaluated

- `move sent`  
  Bot decided and emitted a move

If the bot does not act:
- verify `type=bot_state` messages arrive
- verify `serverbot.js` is loaded and ticking
- enable `BOT_DEBUG=1`

---

## Development Workflow (Recommended)

1. Start server in debug mode:
   ```bash
   BOT_DEBUG=1 BOT_LOG_THROTTLE_MS=2000 node server.js
   ```
2. Start a match using **“Play vs Server Bot”**
3. Observe server logs for:
   - snapshot reception
   - decision evaluation
   - emitted moves
4. Improve bot logic inside `serverbot.js` without touching `server.js`

---

## License

Internal / To be defined.