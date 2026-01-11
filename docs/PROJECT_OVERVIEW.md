# Solitaire HighNoon – Project Overview

## Purpose
Solitaire HighNoon is a multiplayer Solitaire game with a “HighNoon / Western” theme.
It supports cross-platform play between:
- iOS native client (future: macOS)
- Web/PWA client
- Node.js WebSocket server (authoritative)
- Bot player (Server‑side AI)

Primary engineering goals:
- Deterministic gameplay across clients (seed + shuffle)
- Robust WebSocket sync (snapshots, moves, reconnection)
- Clear separation between UI/UX and game/protocol logic

## Repository Layout (Current)
### Repo A: Backend + PWA
Contains:
- Node.js server: matchmaking, rooms/matches, authoritative state
- PWA (static assets served from /public)
- Bot runner / bot logic (serverbot.js)

### Repo B: iOS (future macOS)
Contains:
- Swift app (SwiftUI + UIKit board)
- WebSocket client + protocol handling
- Rendering + input handling (drag & drop, touch)
- Audio system and assets
- Persistence (CoreData)

## High-Level Architecture
- Server is authoritative for match state.
- Clients send user actions as “moves”.
- Server validates and applies moves, then broadcasts state updates.
- Clients render their local state from server updates.

Recommended discipline:
- Avoid “optimistic” local state mutations unless they are strictly reconciled with server updates.
- Prefer server-confirmed state for multiplayer correctness.

## Core Concepts
### Match / Room
- A match is the game session identified by a match/room id.
- Capacity rules apply (host + guest + bot, etc.)

### Shuffle Mode (concept)
- Shared shuffle: both players must see identical deck order
- Split shuffle: each player has their own deck order
- Seed handling must be consistent across server + clients for shared shuffle

### Seed & Determinism
Determinism requires:
- Consistent seed generation and transmission
- Identical shuffle algorithm across platforms (JS + Swift)
- Stable card identity rules (unique IDs, owner rules)
- Test vectors to detect drift (seed -> first N cards)

## Networking & Protocol
- Transport: WebSocket
- Messages typically include:
  - sys: join/leave, protocol metadata, snapshots, errors
  - move: player move request
  - state: authoritative snapshots / patches

Protocol versioning recommendation:
- Maintain protocolVersion (integer) and bump on breaking changes
- Log protocolVersion + clientVersion + shuffleMode + seed on every join/snapshot

## Logging & Debugging Guidelines
Always include in logs:
- matchId / roomId
- owner/player id
- shuffleMode
- seed
- protocolVersion
- snapshot checksum / top N cards (debug mode)

If a “different cards” bug appears:
- dump seed + shuffleMode + first 10–20 card IDs in stock for both sides
- verify shuffle algorithm parity (Swift vs JS)

## Known Risk Areas (typical)
- iOS Host ↔ PWA Guest determinism drift (seed/shuffle mismatch)
- Timing issues between snapshot vs incremental updates
- Bot join flow / match capacity edge cases
- Reconnect flows (state rehydration, idempotency)

## Roadmap (short)
- Lock deterministic shared shuffle across JS + Swift
- Harden bot reliability and avoid match-full edge cases
- Introduce protocol test vectors and validation tooling
- Prepare for additional clients: Windows, Android (future)
