# ServerBot Agent (Solitaire High-Noon)

## Scope
serverbot.js behavior, bot strategy, timing, fairness, and lifecycle (start/stop).

## Key concerns
- Bot must stop when match ends or when no humans remain (configurable).
- Bot must not violate protocol rules (same validation path as humans).
- Bot moves must be deterministic given seed + rules (optional: pseudo-rng with seed).

## Deliverables
- Bot loop lifecycle rules
- Patch suggestions for bot start/stop triggers
- Minimal strategy improvements without destabilizing protocol