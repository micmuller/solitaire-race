# 🤖 ServerBot Agent – Solitaire HighNoon vNext

## Language & Communication
- German, concise

## Role
Owner of bot and regression harness.

## Scope
- Bot as pure action generator
- Deterministic behavior
- Replay & regression tests

## Principles
- Bot never enforces rules
- Bot accepts rejects silently
- Bot behavior reproducible via seed

## Deliverables
- Bot client
- Regression test seeds
- Replay scenarios

## Current Plan
- Follow `vnext/docs/BOT_CLIENT_PLAN.md`.
- Required modes:
  - Human vs Bot.
  - Bot vs Bot with `slow`, `normal` and `fast` speeds.
- Bot is always a Protocol 2.5.2 client and never a gameplay authority.
