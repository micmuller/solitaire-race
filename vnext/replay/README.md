# vNext Replay

The replay runner will consume the greenfield core through its public API.
Replay must never import legacy server or client gameplay code.

Implementation starts after `applyAction` is available. The normative format
is defined in `vnext/docs/REPLAY.md`.
