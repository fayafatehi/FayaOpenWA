# Production Hardening — Tranche 2 Implementation Plan

**Date:** 2026-09-21
**Branch:** `audit/production-hardening-2026-09-21`
**Baseline:** `6c950125d6e826775d852429fa7ee69fb1f0c574`

## Scope

This tranche resolves additional code-enforceable audit gaps without claiming unsupported features are complete.

1. **Main auth/audit DB migration-first in production**
   - Production default: `MAIN_DATABASE_SYNCHRONIZE=false`.
   - Non-production keeps the current zero-config synchronize default.
   - Runtime already has `migrationsRun: !synchronize`, so production schema creation remains automatic through versioned migrations.
   - Add regression tests for environment-dependent default.

2. **Versioned API-key hash migration**
   - Add `hashVersion` to `api_keys` via a main-DB migration.
   - Existing rows default to `sha256-v1`.
   - New keys use `hmac-sha256-v1` when `API_KEY_PEPPER` is set; otherwise `sha256-v1`.
   - Validation tries the current preferred hash first, then legacy SHA-256.
   - A successful legacy match with a configured pepper upgrades the row transactionally/best-effort to HMAC.
   - Never log raw keys or pepper values.

3. **Plugin trust declaration**
   - Add manifest `trustMode: trusted-inprocess | untrusted`.
   - Missing value remains backward-compatible as `trusted-inprocess`.
   - `untrusted` is rejected at install and boot until a real isolated runner exists.
   - Documentation/UI wording must not imply worker_threads is a hostile-code boundary.

4. **Helm single-replica hard gate**
   - Template rendering fails when `replicaCount != 1`.
   - No experimental override that silently enables unsupported HA.
   - Existing default remains 1.
   - Tests lock the failure behavior.

5. **MCP tool provenance**
   - Add explicit audit actions for successful/failed MCP tool execution.
   - Record authenticated API-key id, tool name, tier/read-only metadata, HTTP path/method, and auth mode.
   - Do not record raw API keys or tool secrets.
   - Existing auth-failure audit remains unchanged.

## Explicitly deferred

- Per-chat/group authorization across REST/MCP/WS/search/webhooks/integrations.
- Supported multi-replica HA and distributed ownership of every process-local state.
- Public OAuth 2.1/OIDC MCP identity.
- OS-isolated plugin runner implementation.

These stay open rather than receiving partial implementations that could be mistaken for complete controls.

## Verification

Each behavior change follows RED → GREEN. Final gate:
- lint + full TypeScript typecheck
- format check
- unit + docs + scripts + e2e
- main migration tests
- PostgreSQL migration lane
- Helm/actionlint
- Security audit
- Docker Build
