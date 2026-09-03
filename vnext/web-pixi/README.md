# Solitaire HighNoon PixiJS Web Client

Parallel PixiJS-8 client for Mockup 4.2. The legacy adapter remains at `/vnext/web/`; this build is served explicitly at `/vnext/pixi/`.

## Run

```bash
npm install
npm --prefix vnext/web-pixi install
npm run build:web-pixi
npm run start:vnext
```

Open `http://127.0.0.1:3011/vnext/pixi/`. `?demo=1` enables the visual-only acceptance fixture. It never submits state or implements rules.

## Installable web app

The production build includes a scoped web app manifest, iOS home-screen metadata and a service worker for the `/vnext/pixi/` application shell. Install it through the browser's “Add to Home Screen” or “Install app” action. The cached shell can start without a network connection, but Lobby, WebSocket matches and all authoritative gameplay actions still require the HighNoon server.

## Architecture

- DOM: lobby, menus, settings, profile, diagnostics, status and accessible live text.
- PixiJS: retained board scene, procedural card/material assets, card hit areas, drag preview and cancellable transitions.
- Shared modules: `../web/protocol-client.mjs`, `intent-mapping.mjs`, `lobby.mjs`, `seed.mjs`, and `effects.mjs` are bundled directly. No rules or Core modules are imported.
- State: only server ack/snapshot events update permanent card placement. Selection, drag and pending are transient. Every snapshot cancels animation and snaps retained `cardId` views to authority.
- Layout: `src/layout/layout-engine.js` is pure and owns zones, scales, columns, slots, fan spacing and hit geometry.

## Assets and visual language

The initial asset family is license-safe procedural vector art rendered and retained by PixiJS: ivory cards, Oxblood ornamental backs, dark wool felt, walnut frames and aged brass. It is deliberately centralized in `board-scene.js` and `theme/tokens.js` so a future 1×/2× texture atlas can replace surfaces without changing protocol or layout. The MAX mockup is reference-only and is not shipped as UI.

## Quality and accessibility

`high`, `balanced`, and `reduced` cap render resolution at 2×, 1.5× and 1×. Reduced motion disables movement and particles; OS `prefers-reduced-motion` wins. Menus lock canvas input. Status changes are announced through `aria-live`, and the DOM maintains readable revision, connection and score alternatives.

## Known limits

- The first asset family is procedural rather than an exported bitmap atlas.
- Confirmed event audio is synthesized and intentionally quiet; music is not included.
- Opponent stack expansion and touch magnifier are deferred optional enhancements.
