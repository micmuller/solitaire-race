# Task 285 – UAT Follow-up

UAT candidate dated 2026-09-07:

- Server `1.1.0-alpha.21`
- Pixi/PWA `0.3.0`
- Protocol `2.5.2` (unchanged)

## Corrections

- A completed two-player lobby round now re-enables its progress clock when P1
  starts the next round from the result flow. Clock activity is derived from the
  occupied P2 seat instead of the previous round's transient `finished` status.
- A server integration regression covers resign, restart and clock deadlines in
  both participant snapshots.
- The Pixi surface prevents double-click default handling and browser viewport
  overscroll while preserving ordinary browser zoom accessibility outside the
  game surface.
- Info & Diagnose now links to the PWA player profile.
- The PWA profile uses the approved HighNoon wood/leather/brass presentation,
  four statistic tiles and the recent-match chronology.
- A dedicated **Leaderboard** menu item above Info & Diagnose provides the
  visual reference for the native implementation. It shows rank, nickname,
  played games, wins, points and best score, with loading, empty and error
  states plus a direct link from the player profile.

The iOS reconnect follow-up is documented with the native client because it is
implemented in that repository.

## Acceptance and verification

- User UAT accepted the PWA leaderboard and cross-client leaderboard updates on
  2026-09-07.
- `npm run test:vnext`: 109 tests passed.
- Pixi `npm test`: 87 tests passed.
- `npm run build:web-pixi`: production build passed.
