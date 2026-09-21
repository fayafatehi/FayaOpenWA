# Production Hardening — Tranche 2 Worklog

**Date:** 2026-09-21
**Branch:** `audit/production-hardening-2026-09-21`
**PR:** #9
**Status:** implementation complete; exact-HEAD verification pending

## Completed implementation

### DATA-001 — migration-first main auth/audit DB
- Production now defaults `MAIN_DATABASE_SYNCHRONIZE=false`.
- Development/test retain zero-config synchronize behavior.
- Explicit `MAIN_DATABASE_SYNCHRONIZE=true|false` still overrides the environment default.
- Existing runtime wiring runs main migrations automatically whenever synchronize is disabled.
- RED evidence: CI #30 failed only the new production-default assertion before the config change.

### AUTH-002 — versioned API-key hashing
- Added explicit `sha256-v1` and `hmac-sha256-v1` hash versions.
- Added `hashVersion` to `api_keys` through a main-DB migration.
- Existing rows are labeled `sha256-v1`; new rows use HMAC when `API_KEY_PEPPER` exists.
- Validation checks preferred HMAC first, then the legacy SHA-256 representation.
- A fully authorized legacy-key request upgrades the row with an optimistic conditional update.
- Revoked/expired/IP-denied/session-denied keys are not upgraded merely because their digest matches.
- Raw API keys and pepper values are not logged.
- Enabling a pepper is backward-compatible; rotating/loss of an already-active pepper still requires key rotation.

### SEC-002 — explicit plugin trust boundary
- Plugin manifests support `trustMode: trusted-inprocess | untrusted`.
- Omitted mode remains backward-compatible as `trusted-inprocess`.
- `untrusted` fails closed at the shared install/boot manifest validator because no OS-isolated runner exists.
- Documentation now describes worker_threads as fault/resource containment, not a hostile-code boundary.

### HA safety gate — single-replica Helm enforcement
- The chart refuses to render when `replicaCount != 1`.
- The chart behavior suite asserts that `replicaCount=2` fails with an explicit support-boundary message.
- Horizontal-scaling docs record the executable gate.
- This does NOT claim true HA is implemented.

### MCP provenance
- Added `MCP_TOOL_INVOKED` and `MCP_TOOL_FAILED` audit actions.
- Authenticated MCP tool calls record API-key id, tool name, tier/read-only state, auth mode, HTTP method/path, and IP when available.
- Failed tool execution is distinct from API-key authentication failure.
- Raw API-key header/Bearer values are never copied into audit metadata.
- Native OAuth 2.1/OIDC remains deferred.

## Verification evidence so far

- Tranche 1 exact-HEAD CI #28: PASS.
- Tranche 2 RED runs deliberately failed the new contracts before implementation.
- CI #49 at `d52ab9ac...`:
  - SDK CI: PASS
  - Security audit: PASS
  - Shell scripts: PASS
  - Dashboard: PASS
  - Helm chart/workflows: PASS
  - PostgreSQL migrations: PASS
  - Main migration test for `hashVersion`: PASS
  - Remaining failures were plugin assertion wording and Prettier-only issues on files subsequently corrected.
- Exact current HEAD verification is still required before closing this tranche.

## Explicitly open after Tranche 2

These are not marked fixed:

1. **AUTH-001:** per-chat/group authorization across REST, MCP, WebSocket, search, webhooks, integrations.
2. **HA-001:** supported multi-replica operation: distributed WS rate limits, all lifecycle fencing, durable bulk state, MCP owner routing, generation/fencing tokens, chaos tests.
3. **SEC-002b:** actual OS-isolated plugin runner for `trustMode=untrusted`.
4. **MCP-001:** native OAuth 2.1/OIDC for public MCP exposure and downstream agent identity propagation.
5. **P1-01 external:** unofficial/reverse-engineered WhatsApp dependency and upstream account/protocol behavior.
6. **GOV external:** GitHub branch/ruleset/release settings that require repository-admin controls rather than source code.

## Close gate

Do not mark Tranche 2 complete until one CI run against the final exact HEAD passes:
- ESLint
- full TypeScript typecheck including specs
- formatting
- unit tests
- doc-lint tests
- script tests
- e2e smoke
- security audit
- PostgreSQL migration lane
- Helm lint/template/kubeconform/chart behavior/actionlint
- dashboard lint/typecheck/build/tests
- build
- Docker build/runtime user verification
- SDK CI
