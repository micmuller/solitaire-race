# PixiJS Web Client – Implementation Plan

1. Keep `/vnext/web/` untouched and add an explicit `/vnext/pixi/` static root.
2. Reuse the existing browser protocol, lobby, seed, effects and intent modules through Vite imports.
3. Drive one retained Pixi scene from authoritative snapshots; local input owns only selection, drag and pending visuals.
4. Centralize responsive geometry in pure layout functions and validate 1024×768, desktop and compact viewports.
5. Verify build/tests, both static routes, live match interaction, resync and the three visual acceptance captures.

Assumptions: procedural vector textures are the replaceable first asset family; DOM remains the accessible app/lobby/control surface; the debug-only `?demo=1` fixture is never used as production game state.
