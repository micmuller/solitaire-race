# ADR-016: Server-authoritative progress clock

## Status

Accepted and implemented for the server, Pixi PWA, and native iOS/iPadOS client.

## Decision

Each player can optionally receive an independent progress deadline of 2, 3, or
5 minutes. The default is off. The server owns the deadlines, evaluates expiry,
and finishes the match with `endedReason: inactivity`. Clients receive the
server timestamp and both absolute deadlines and only interpolate the display.

A player's deadline is reset only by accepted, authoritative progress:

- a card was placed on a foundation; or
- a previously face-down tableau card became visible, including an automatic
  reveal caused by the same accepted move.

Draw, recycle, and moves without either result do not reset the clock.

Lobby clocks begin when P2 joins, pause while the game is waiting for P2, and
restart with a full allowance after P2 rejoins. During an active game a browser
background transition or transport disconnect does not pause the deadline.
Reconnect therefore needs no client grace rule: the next snapshot reconstructs
the display from server time, while the authoritative deadline remains intact.

If both deadlines expire at the same millisecond, the server resolves the tie by
stable player order (`p1` expires first). The timeout is stored as a replayable
server action so the final state and hash remain deterministic.

## Consequences

The clock cannot be extended by manipulating local time, backgrounding the app,
or repeatedly cycling the stock. Native clients can adopt the same transport
metadata without receiving any gameplay authority.
