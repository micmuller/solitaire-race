# Protocol 2.2.0 Reference Client

`ProtocolClient` is the executable reference adapter between UI intent and the
authoritative vNext server. It contains no Solitaire rules and performs no
optimistic state mutation.

Responsibilities:

- connect as trusted match actor `p1` or `p2`;
- retain the latest authoritative `{ rev, state, stateHash }`;
- build envelopes with `seq`, `baseRev` and `protocolVersion`;
- allow one in-flight intent per client;
- advance `seq` only after the client's own `ack`;
- keep state and sequence unchanged on `reject`;
- replace local state on `ack` or `snapshot`;
- expose state/response/disconnect/protocol-error events to a UI adapter.
- accept `resign` as a normal intent; the resulting ack carries the finished
  GameOver state.

This Node implementation is the behavioral reference for later Web and iOS
adapters. Platform transports may differ, but the state machine must remain the
same.
