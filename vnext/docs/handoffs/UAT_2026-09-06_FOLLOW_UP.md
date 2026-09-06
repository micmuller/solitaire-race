# Cross-client UAT follow-up – 2026-09-06

## Released UAT candidate at end of day

- Server: `1.1.0-alpha.20`
- Pixi/PWA: `0.2.8`
- iOS/iPadOS: `1.2.4 (19)`
- Protocol: `2.5.2` (unchanged)

Task #248 now provides SQLite-backed profiles and match results, guided profile
administration, protected PWA and iOS credentials, editable nicknames and a
ten-entry personal match history. The native profile uses the approved HighNoon
wood, leather and brass presentation. This state is the baseline for the next
UAT correction block.

## Deferred corrections – Dashboard #285

1. **Progress clock after a completed game**
   - Reproduced in match `m-08818851-b348-411c-9e4b-760752b13741` with iOS P1,
     Pixi P2, split mode and a two-minute clock.
   - When P1 starts another round from the completed-game flow rather than
     returning to the lobby, iOS displays a static `2:00` for P1 and Pixi hides
     both clocks.
   - Root cause: the restart endpoint derives `clockActive` while the lobby game
     is still `finished`. It then reactivates the lobby game but restarts the
     match with null deadlines.
   - Fix the ordering/activation rule and add a server regression test covering
     a second lobby round plus client presentation gates.

2. **iOS nickname after reconnect**
   - The same iOS diagnostic report used the fallback `HighNoon (P2)` although
     the live lobby state identified P2 by the persisted nickname.
   - Refresh or apply lobby game metadata after reconnect so opponent labels and
     diagnostics use the current profile nickname.

3. **Pixi double-click viewport movement**
   - A rapid double-click can move the entire browser viewport upward.
   - Audit iPadOS/browser default gesture, selection and scroll behavior around
     the Pixi canvas and chrome. Preserve the acknowledged stock-click queue and
     its fast, lossless draw behavior from #269.

4. **PWA profile navigation and presentation**
   - Add `Profil öffnen` to the PWA Info & Diagnose panel.
   - Replace the provisional PWA profile panel with the approved native visual
     hierarchy: HighNoon header, wood/leather/brass surfaces, four statistic
     tiles and styled match-history rows.

No correction was deployed during the live UAT games. The server process on
port 3011 was deliberately left untouched.

## Separate next feature – Dashboard #284

Add an iOS/iPadOS Leaderboard menu item directly above Info & Diagnose, backed
by the existing public leaderboard API. A secondary link from the profile may
open the same view.
