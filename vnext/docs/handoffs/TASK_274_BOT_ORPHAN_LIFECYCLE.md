# Task 274 – Stop orphaned managed bots

Status: local UAT candidate

## Problem

Managed bots own independent WebSocket connections. Closing the controlling PWA therefore removed only the human or observer peer while the bot peers continued processing actions until their action limit.

## Server behavior

The vNext server now owns the orphan lifecycle:

- Human vs Bot: the non-bot player connection controls the bot.
- Bot vs Bot: at least one observer connection controls both bots.
- When the controlling connection disappears, the server schedules an orphan stop.
- A controller reconnect within the 10-second grace period cancels the scheduled stop.
- If no controller returns, every managed bot for the match is stopped.
- Manual bot stop, match completion, match disposal and server shutdown continue to stop or clean up bots immediately.

The match state itself is retained after an orphan stop; only autonomous bot execution ends. Rules, protocol envelopes, revisions and state hashes are unchanged.

## Verification

- Targeted bot integration tests: 12/12 passed
- vNext suite: 98/98 passed
- Pixi suite: 84/84 passed
- Combined automated tests: 182/182 passed
- `git diff --check`: passed

The integration coverage verifies Human-vs-Bot stop, reconnect cancellation within the grace period, and stopping both Bot-vs-Bot actors after the last observer disconnects.

## UAT

The running vNext server must be restarted before testing this server-side change.

1. Start Human vs Bot, close the PWA, wait about 10 seconds and confirm that bot actions cease in the server log.
2. Repeat, reconnect within 10 seconds and confirm that the bot remains active.
3. Start Bot vs Bot, close the observing PWA, wait about 10 seconds and confirm that both bots stop.
