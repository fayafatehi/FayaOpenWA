# Production Hardening — Tranche 1 Implementation Plan

**Date:** 2026-09-21  
**Spec:** `docs/superpowers/specs/2026-09-21-production-hardening-design.md`  
**Branch:** `audit/production-hardening-2026-09-21`

## Context

This first tranche implements the highest-impact controls with the smallest product-surface blast radius:

1. fail-safe dependency audit policy in CI/security contexts;
2. Docker socket proxy opt-in rather than default-on;
3. browser-version/security evidence and exception-expiry enforcement;
4. documentation/admin runbook gates for the above.

Authentication schema, chat-level authorization, plugin trust modes, HA fencing, and MCP OAuth/provenance remain later tranches because they change persistent data or public authorization semantics.

## Global constraints

- Follow RED → GREEN → REFACTOR for every behavior change.
- Do not weaken existing audit/image/security gates.
- Keep default application startup functional without Docker orchestration.
- Preserve current single-replica support statement.
- Do not claim GitHub settings were changed by source commits.
- Each task gets an independent commit boundary.
- Verify through pull-request CI because the local execution environment cannot clone the repository.
- Any plan deviation must be recorded in the worklog as a ruling.

## Task 1 — Fail-safe audit-unavailable policy

### Interfaces

**Produces**
- `AUDIT_UNAVAILABLE_POLICY=warn|fail`.
- exported policy evaluator/helper in `scripts/check-audit.mjs`.
- script-level tests in `scripts/check-audit.spec.mjs`.

**Consumed by**
- Task 2 CI/security workflow changes.

### RED

Modify `scripts/check-audit.spec.mjs` first with tests proving:

1. unavailable report + `warn` policy returns a non-blocking result;
2. unavailable report + `fail` policy returns a blocking result;
3. invalid policy value is rejected/fails closed;
4. ordinary vulnerability evaluation is unchanged.

Commit only the test change.

**Expected:** draft PR `Test`/script-test lane fails because the new exported behavior does not exist yet.

### GREEN

Modify `scripts/check-audit.mjs` minimally:

- parse policy from environment;
- default to `warn`;
- export a pure helper for policy evaluation;
- when audit is unavailable:
  - `warn`: loud warning + exit 0;
  - `fail`: loud error + exit non-zero;
- invalid value exits non-zero.

Run/observe PR CI.

**Expected:** script tests pass; no unrelated test regression.

### Task completion test

`npm run test:scripts`

## Task 2 — Enforce fail policy in merge/security/release contexts

### Interfaces

**Consumes**
- Task 1 environment contract.

**Produces**
- workflow-level enforcement.

### RED

Add a doc/workflow structural test in a doc-lint spec asserting that:

- `.github/workflows/ci.yml` sets `AUDIT_UNAVAILABLE_POLICY: fail` for the security audit job;
- `.github/workflows/security-scan.yml` sets it for the scheduled audit;
- `.github/workflows/release.yml` sets it for any dependency audit path that gates release, if present.

Commit test first.

**Expected:** doc-lint test fails on current workflows.

### GREEN

Set the variable at the smallest workflow scope that covers only security audit execution.

Do not set it globally for unrelated jobs.

**Expected:** doc-lint + workflow lint pass.

### Task completion test

`npm run test:docs`

## Task 3 — Docker orchestration explicit opt-in

### Interfaces

**Produces**
- default Compose without active `docker-proxy`;
- explicit `orchestration` profile;
- graceful API operation without Docker proxy.

### RED

Extend `src/modules/docker/compose-network.spec.ts` or create a focused compose security spec proving:

1. default Compose treats `docker-proxy` as profile-gated;
2. profile name is exactly `orchestration`;
3. docs/environment comments do not claim proxy is default-on;
4. `openwa-api` has no mandatory `depends_on` on docker-proxy.

If existing compose test infrastructure shells out to `docker compose config`, add assertions for default and profile-expanded configurations. Otherwise keep structural parsing consistent with existing test style.

Commit test first.

**Expected:** doc-lint/targeted compose test fails because docker-proxy has no profile.

### GREEN

Update `docker-compose.yml`:

- add `profiles: ['orchestration']` to docker-proxy;
- keep its isolated network and minimal permissions unchanged;
- ensure API startup has no hard dependency on the proxy;
- update nearby comments to say the helper is opt-in.

Update `.env.example`, SECURITY/runbook docs as required.

**Expected:** targeted compose tests pass; DockerService tests remain green.

### Task completion test

`npm run test:docs` and existing Docker module unit tests in normal `npm test`.

## Task 4 — Browser security evidence + expiring exception policy

### Interfaces

**Produces**
- `scripts/check-browser-security.mjs`;
- `scripts/browser-security-exceptions.json`;
- script unit tests;
- workflow browser identity/evidence step.

### RED

Create `scripts/check-browser-security.spec.mjs` first. Tests cover:

1. extracting amd64 CfT pin from Dockerfile;
2. identifying arm64 as distro Chromium;
3. rejecting an exception whose `reviewBy` date is in the past;
4. accepting a future-dated, well-formed exception;
5. rejecting duplicate/malformed exception records;
6. refusing to report “secure/clean” merely because no exceptions exist.

Add the spec to `npm run test:scripts`.

Commit only tests/package script wiring.

**Expected:** script test lane fails because implementation files do not exist.

### GREEN

Implement:

- parser for Dockerfile browser selections;
- exception JSON schema validation;
- expiry gate;
- deterministic text/JSON output suitable for CI;
- no network dependency in the pure validation script.

Add workflow steps in scheduled security scan and release image-scan lane that execute the script and emit browser identity in the job summary.

The script must explicitly state that it validates pinned identity + exception freshness, not live vendor advisory completeness.

**Expected:** script tests, actionlint/workflow checks, and security workflow lint pass.

### Task completion test

`npm run test:scripts` plus Helm/workflow job used by existing CI.

## Task 5 — Tranche-1 documentation and repository-admin runbook

### Interfaces

**Consumes**
- Tasks 1–4 final behavior.

**Produces**
- durable operator/admin instructions;
- doc-lint drift checks.

### RED

Add assertions to existing docs coverage tests for:

- audit service fail policy in CI/security/release;
- Docker orchestration being opt-in;
- browser-security evidence caveat;
- admin-only branch/ruleset actions clearly marked not applied by code.

Commit tests first.

**Expected:** doc-lint fails until docs are reconciled.

### GREEN

Update:

- `SECURITY.md`;
- `docs/10-devops-infrastructure.md`;
- `docs/11-operational-runbooks.md`;
- `docs/16-risk-management.md` if that is the canonical risk register;
- add `docs/production-github-governance-runbook.md`.

Runbook must include:

- require PR to `main`;
- require CI status checks;
- restrict force pushes/deletion;
- stale review dismissal where appropriate;
- release/tag protection and immutable-release guidance where available;
- verification commands/API checks for an administrator.

It must state settings are **pending until applied by a repo administrator**.

### Task completion test

`npm run test:docs`

## Final tranche verification

After Tasks 1–5 are green:

1. `npm run lint`
2. `npx tsc --noEmit -p tsconfig.json`
3. `npm run format:check`
4. `npm run test:scripts`
5. `npm run test:docs`
6. `npm test -- --coverage`
7. `npm run test:e2e`
8. PostgreSQL lane if CI runs it on the PR
9. Docker build job
10. workflow/Helm validation job

## Review focus

The final review must deliberately inspect:

- whether `warn` remains possible in release/security workflows by accidental scope/override;
- whether the docker-proxy can still start in default Compose through dependency/profile semantics;
- whether browser checks accidentally make a “no known exceptions == secure” claim;
- date parsing/time-zone behavior for exception expiry;
- whether docs describe GitHub settings as applied when they are merely prescribed;
- whether any new CI environment variable leaks or shadows existing production configuration.
