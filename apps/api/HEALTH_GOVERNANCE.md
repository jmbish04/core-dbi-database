# Health Service Governance

## 1. Always-On Monitoring

- **Registry Checks**: Hardcoded checks (DB connectivity, API reachability) must run every 60s.
- **Incident Tracking**: Any `FAIL` result must open/update an Incident. `PASS` resolves it.

## 2. No "Silent Failures"

- If a sub-agent fails a known critical path, it must log a `FAIL` result to `request_results` AND trigger a Health Incident.

## 3. Hybrid Definitions

- **Code-First**: Use `lib/health/registry.ts` for static infrastructure checks.
- **DB-First**: Use `HealthTestDefinition` for dynamic checks.
