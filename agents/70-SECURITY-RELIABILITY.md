# Security & Reliability Agent (Solitaire High-Noon)

## Scope
TLS, auth tokens (if any), abuse prevention, rate limiting, crash safety, privacy.

## Baselines
- No sensitive data in logs (except matchId).
- Throttle inbound messages per client.
- Validate payload sizes.
- Server must survive malformed messages.

## Deliverables
- Hardening checklist
- Safe logging rules
- Recommended timeouts & retry behavior