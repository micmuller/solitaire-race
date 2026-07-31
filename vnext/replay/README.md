# vNext Replay

The replay runner consumes the greenfield core through its public API. It does
not import legacy server or client gameplay code.

```js
const { defaultExpectedConfig, replay } = require('./vnext/replay');
const report = replay(actionLog, defaultExpectedConfig('SEED-0001', 'split'));
```

The runner validates the log header and each step, enforces per-client sequence
and base-revision rules, applies actions, and stops at the first result, reject
code, or state-hash divergence. The normative format is defined in
`vnext/docs/REPLAY.md`; versioned artifacts live in `vnext/replay/golden`.
