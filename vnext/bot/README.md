# vNext Bot Client

The vNext bot is a thin Protocol 2.1.0 client. It reads authoritative
snapshots, generates candidate Intents, sends one pending Intent at a time, and
accepts server rejects as normal feedback. It does not import or call Core move
authority and never mutates match state locally.

## Human vs Bot

Start the vNext server first:

```sh
npm run start:vnext
```

Join an existing Web-hosted match as `p2`:

```sh
npm run bot:human -- --match-id m-... --client-id p2 --speed normal
```

For Web testing, prefer the Web client's `Match mit Bot` button. It starts the
server-managed bot as `p2` and avoids manual role conflicts.
Human-vs-bot speed profiles are `easy`, `medium` and `hard` (`leicht`,
`mittel`, `schwer` are accepted aliases). The Web client exposes these as
`Easy`, `Mittel` and `Schwer`.

Or create a standalone bot match:

```sh
npm run bot:human -- --seed BOT-HUMAN-001 --mode split --speed normal
```

## Bot vs Bot

Run two bot clients against a fresh match:

```sh
npm run bot:versus -- --seed BOT-VS-BOT-001 --mode split --speed fast --max-actions 200
```

Bot-vs-bot speeds are `slow`, `normal` and `fast`. Speed only changes
scheduling delay; candidate ordering remains deterministic.
Add `--json` to either CLI command for the raw machine-readable report.

The Web client can also start Bot-vs-Bot directly. It connects as a read-only
observer while the server runs managed `p1` and `p2` bots.

The JSON report includes match id, seed, mode, speed, final revision, final
state hash, normalized action-log hash, action-log step count, stop reason and
per-bot ack/reject/snapshot counts.

## Strategy v0

Candidates are generated in priority bands:

1. Foundation move from waste or tableau top.
2. Tableau move from waste.
3. Tableau move from face-up tableau suffix.
4. Flip accessible face-down tableau top.
5. Draw or recycle.

Ties are ordered deterministically from seed, bot id, revision and candidate
index. Rejected candidates are remembered per state hash so the bot can try the
next candidate without local rule authority.
Recent accepted tableau moves are also remembered so the bot does not
immediately reverse the same move and fall into a simple ping-pong loop.
