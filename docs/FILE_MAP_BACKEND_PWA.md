# Solitaire HighNoon – File Map

This document is a navigation map for the codebase(s).
Update this file whenever filenames move or responsibilities change.

---

## Repo A: Backend + PWA

### Root
- `server.js`
  - Main Node.js WebSocket server entrypoint
  - Serves PWA assets from `/public`
  - Handles connections, message routing, match lifecycle (expected)
- `matches.js`
  - Match/room management (expected: create/join/leave, state tracking)
- `serverbot.js`
  - Bot runner / bot client logic
- `serverstart.sh`
  - Convenience start script
- `package.json`, `package-lock.json`
  - Dependencies and scripts
- `readme.md`
  - Repo-level documentation

### /public (PWA)
- `public/index.html`
  - App entry, loads JS modules
- `public/manifest.json`
  - PWA manifest (name/icons/start_url/display)
- `public/js/game.js`
  - Core client-side game logic + state representation
- `public/js/startmenu.js`
  - Start menu, room selection, setup flow
- `public/js/touch.js`
  - Touch handling, gestures (mobile/iPad)
- `public/js/scaling.js`
  - Responsive scaling / layout adjustments
- `public/js/inlinehandler.js`
  - UI event wiring / inline handlers
- `public/js/bot.js`
  - Bot-related client logic or helpers (naming suggests bot UI/testing)

### /docs
- `docs/Solitaire_HighNoon_iPad_Blueprint.docx`
  - Product/UX blueprint for iPad experience

Notes:
- `node_modules/` exists in the repo listing (usually not committed; recommend .gitignore).
- `.DS_Store` should be ignored.