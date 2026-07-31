# Release Lines and Stable 1.0 Freeze

Status: Approved  
Date: 2026-07-31

## Role of Stable 1.0

Stable 1.0 is no longer an actively developed product line. It is the frozen,
playable reference and source baseline for vNext.

The tags `v1.0.0` in `solitaire-race` and `HighNoonNative` are immutable. The
respective `main` branches remain the stable 1.0 lines until a consciously
approved vNext release replaces them.

## Allowed Changes in 1.0.x

Only the following changes are allowed:

- critical correctness fixes
- build and signing fixes
- security fixes
- required platform compatibility fixes

New features, architecture work, normal UI changes and incremental migration
of the hybrid gameplay architecture are not allowed in 1.0.x.

A required 1.0 fix starts from a `hotfix/1.0.x-*` branch, includes appropriate
regression coverage and receives a patch version and tag after approval.

## vNext Development

Architecture and product development continue only on the vNext lines:

- server: `vNext-authoritative-engine`
- iOS: `vNext-ios`

vNext code is not backported to 1.0. A fix that is independently required in
both lines is implemented and verified separately for each line.

Stable 1.0 may be reused as a source for infrastructure, framework and UI
assets. Its gameplay authority and client-side rule paths are reference
material only and are not migration targets.
