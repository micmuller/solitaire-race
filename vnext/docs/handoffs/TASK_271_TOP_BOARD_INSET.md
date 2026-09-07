# Task #271 – shared top board inset

Pixi `0.3.2` aligns the bronze top rail with the lower edge of the header and
moves the complete opponent row clear of that rail.

- The top rail and its corner hardware extend four pixels behind the header,
  eliminating the narrow visible felt seam.
- Opponent tableau cards and slots use a minimum 20-pixel top inset instead of
  the earlier proportional inset of about 11 pixels on common iPad canvases.
- Local-card sizing and all horizontal layout rules remain unchanged.

The native iOS/iPadOS implementation in `1.2.8 (23)` uses the corresponding
58-point shared header/frame boundary and the same 20-point opponent clearance.

## Acceptance

Hardware UAT passed on 2026-09-07 for Pixi/PWA, iPad Pro in landscape and
portrait, and iPad mini. iPhone-specific layout optimization is outside this
milestone and is tracked as Dashboard backlog #286.
