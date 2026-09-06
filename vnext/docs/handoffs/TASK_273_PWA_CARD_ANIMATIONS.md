# Task 273 – PWA card animation preference

Status: UAT approved and published
Client: Pixi PWA 0.2.3

## Outcome

The Pixi PWA exposes a device-local `Kartenanimationen` preference with three modes:

- `Automatisch`: High and Balanced animate authoritative card moves and flips; Reduced snaps to the authoritative end state.
- `Ein`: enables lightweight authoritative card moves and flips for every graphics quality.
- `Aus`: snaps all authoritative card moves and flips to their end state.

The operating-system `prefers-reduced-motion` preference always wins and disables card motion. The iPadOS Canvas fallback continues to disable general motion such as hover and reject effects; only the dedicated card transition path can animate.

The preference is stored under `solitaire-pixi:cardAnimations` and applies immediately to subsequent authoritative state changes. Rules, protocol, server authority and game state are unchanged.

## Verification

- Pixi tests: 84/84 passed
- vNext tests: 96/96 passed
- Combined automated tests: 180/180 passed
- Pixi production build: passed
- `git diff --check`: passed
- In-app browser: control rendered correctly, mode change applied immediately, persisted across reload, and browser console stayed free of warnings/errors

## Hardware UAT

On the installed iPadOS PWA, verify Stock-to-Waste and Tableau reveal with:

1. Balanced + Automatic: short flip visible.
2. High + Automatic: full flip visible.
3. Reduced + Automatic: no flip.
4. Reduced + On: lightweight flip visible.
5. Any quality + Off: no flip.
6. iPadOS Reduce Motion enabled: no flip in every app setting.

Rapid Stock tapping must remain smooth and must process exactly one draw per tap.
