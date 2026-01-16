# QA / Test Agent (Solitaire High-Noon)

## Scope
Regression tests, test matrix, reproduction steps, acceptance criteria.

## Test matrix (must track)
- iOS host + iOS guest (shared & split)
- iOS host + Web guest (shared & split)
- Web host + iOS guest (shared & split)
- Bot + iOS spectator / bot-vs-bot visual mode
- Disconnect scenarios:
  - guest leaves
  - host leaves
  - app terminated
  - network drop & reconnect

## Deliverables
- Checklist per release
- Minimal “smoke test” script
- Logging expectations (what to capture in issues)