# Task #255 – Server-authoritative progress clock

## Completed scope

- Server version: `1.1.0-alpha.18`
- Pixi client version: `0.2.4`
- Options: off (default), 2, 3, or 5 minutes per player
- One persistent global option under Settings; lobby, new-game and bot tabs do
  not duplicate it
- Server-authoritative absolute deadlines in snapshots and acknowledgements
- Reset only after a successful foundation move or a newly revealed tableau card
- Independent brass/fuse bars below both player scores with the countdown inside
  the right edge of each bar
- Style-aligned states: dark gold normally, yellow below 60 seconds, and
  red/pulsing for the last 30 seconds; reduced-motion devices do not pulse
- Server finishes expiry with `endedReason: inactivity` and stops managed bots
- Timeout transition is part of the deterministic replay log
- The timeout finale names the winner and shows both final scores before noting
  whose progress time expired
- Native iOS/iPadOS client `1.2.2 (17)` mirrors the accepted central setting,
  score-header bars, color thresholds, server-time interpolation and timeout
  result presentation

The shared protocol version remains `2.5.2`; the progress-clock delivery did
not require a protocol-version increment.

## Lifecycle

- Direct and bot matches start immediately.
- Lobby matches start when P2 joins and pause while the lobby waits for P2.
- Active clocks continue through backgrounding and disconnects. Reconnect uses
  the current server timestamp and deadlines from the next snapshot.
- Exact simultaneous expiry resolves in stable player order (`p1` first).

## Verification

- `npm run test:vnext`: 100 tests passed
- `npm test` in `vnext/web-pixi`: 85 tests passed
- `npm run build:web-pixi`: production build passed
- Visual browser check passed at desktop and 1024×768 iPad viewport; header had
  no horizontal overflow and both timer bars remained inside their plaques.
- Native iPad Simulator test suite passed, including authoritative clock
  transport coverage; optimized unsigned arm64 Release build passed.
- Pixi/server and native iOS presentation passed user UAT.

Detailed native implementation and hardware-UAT coverage are documented in the
iOS repository at `HighNoonNative/vnext/TASK_255_PROGRESS_CLOCK.md`.
