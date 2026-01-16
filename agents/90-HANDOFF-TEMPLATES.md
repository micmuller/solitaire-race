# Agent Handoff Templates

## Request to Protocol Agent
Context:
- Feature/bug:
- Affected messages:
Questions:
1) Backwards compatibility impact?
2) Any version bump needed?
3) Suggested message examples?

## Request to Server Agent
Context:
- Match lifecycle state:
- Observed logs:
Questions:
1) Where should authority live?
2) What cleanup is required on LEAVE/DISCONNECT?
3) What logs/metrics to add?

## Request to iOS/Web Agent
Context:
- Current UI behavior:
- Inbound/outbound events:
Questions:
1) How to apply state deterministically?
2) Any threading/perf risks?
3) UX indicators to add?

## QA acceptance criteria
- Repro steps:
- Expected result:
- Negative tests:
- Logs to attach: