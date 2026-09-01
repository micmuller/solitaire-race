# Mockup 4.2 Acceptance

Date: 2026-09-01

## Automated gates

- `npm test`: PASS, 104/104.
- `npm run test:vnext`: PASS, 91/91.
- `npm run test:web-pixi`: PASS, 11/11.
- `npm run build:web-pixi`: PASS, PixiJS 8.20.1 / Vite 8.2.2 production build.
- `npm run smoke:vnext`: PASS, initial rev 0 → final rev 1.
- HTTP route smoke: `/vnext/web/` 200 and `/vnext/pixi/` 200.

## Real browser acceptance

- 1024×768, 1440×900 and 640×560: one Pixi canvas, no gameplay scroll, no console errors or warnings.
- Two connected players: P1 draw rev 0→1, P2 draw rev 1→2, both clients converged to rev 2.
- Reject: `DUPLICATE_SEQ` left rev 2 unchanged and displayed a DOM/aria-live error while the board returned to authority.
- Reconnect: a fresh authoritative rev-2 snapshot rendered without duplicate cards.
- Restart: host restart from `PIXI-RESTART-OLD/split` to `PIXI-RESTART-NEW/shared` reached both connected clients at rev 0 with no console errors.
- Overlay: menu remained above the canvas and `#board-lock` was active.

## Captures

- `artifacts/web-pixi/mockup-4-2-1024x768.png`
- `artifacts/web-pixi/mockup-4-2-desktop.png`
- `artifacts/web-pixi/mockup-4-2-overlay.png`

## Performance observations

The retained scene reuses card display objects by `cardId`; no card duplication was observed across ack, reconnect or restart. The production entry chunk is about 76 kB (about 26 kB gzip) and renderer backends are split into on-demand chunks. Balanced caps DPR at 1.5; reduced caps at 1 and disables motion/particles. Browser interaction stayed responsive during long 14-card fixture stacks and two-client ack traffic; no visible long stall or console diagnostic occurred.

## Deliberate follow-ups

The first visual asset family is procedural vector art. Replacing it with a hand-authored 1×/2× texture atlas remains an art-production task, not a functional blocker. Optional opponent-stack magnification and table music remain deferred; neither affects current playability or protocol compliance.
