# FayaOpenWA Production Hardening Design

**Date:** 2026-09-21  
**Branch:** `audit/production-hardening-2026-09-21`  
**Baseline imported from:** `rmyndharis/OpenWA@49d7d70b0bf43c0cabbe560aeb33b4246eca3eca`  
**Baseline tree:** `99b583ca8aa559ae31d7741111046d0728053f9e`

## 1. Purpose

Turn the 2026-09-21 end-to-end audit into enforceable production hardening without weakening OpenWA's current functionality.

The design separates:

1. **In-repository controls** that can be implemented and tested on this branch.
2. **Operational/admin controls** that require GitHub or deployment administration.
3. **External platform risks** that cannot be eliminated in source code.

The goal is not to claim OpenWA becomes equivalent to Meta's official WhatsApp Business Cloud API. The goal is to reduce preventable repository, runtime, supply-chain, authorization, and operability risk while preserving the project's current single-node production model.

## 2. Non-goals

This branch does not:

- remove the unofficial/reverse-engineered WhatsApp protocol dependency;
- promise uninterrupted compatibility with future WhatsApp client/protocol changes;
- enable unsupported multi-replica production before distributed ownership is complete;
- treat plugin worker threads as a malicious-code sandbox;
- change GitHub branch-protection/ruleset settings through source code;
- redesign every feature or API surface unrelated to audit findings.

## 3. Current-state rulings

### 3.1 Already enforced; do not duplicate

The imported baseline already contains several controls the audit report discussed:

- Compose forwards `DATABASE_SYNCHRONIZE` with a production default of `false`.
- OpenWA's Docker runtime already uses read-only root filesystem, capability dropping, no-new-privileges, bounded memory/PIDs, and localhost host-port binding.
- Plugin documentation already states worker threads are not a malicious-code security boundary.
- Horizontal-scaling documentation already identifies the supported one-replica topology and partially implemented ownership work.
- MCP is read-only by default and already documents the need for an authentication proxy when exposed publicly.

The branch should strengthen enforcement and remove unsafe defaults/gaps rather than restating these controls.

## 4. Remediation architecture

### Wave A — Docker orchestration becomes explicit opt-in

**Risk addressed:** A compromised API process that can reach the Docker socket proxy can create a privileged/bind-mounted container and achieve host-equivalent control.

**Design:**

- The bundled default Compose stack must not start the Docker socket proxy unless an explicit orchestration profile is enabled.
- `openwa-api` must run normally when the proxy profile is disabled.
- Built-in datastore orchestration must report Docker unavailable rather than fail application startup.
- A documented `orchestration` profile will enable the proxy and any required API attachment.
- Existing operators who rely on built-in Postgres/Redis/MinIO orchestration receive a migration note.
- Tests/lint gates must prove the default Compose configuration does not implicitly enable the proxy.

**Acceptance:**

- `docker compose config` default output does not include an active docker-proxy service.
- `docker compose --profile orchestration config` contains the proxy and required network wiring.
- DockerService behavior remains graceful when Docker is unavailable.
- Documentation states the security consequence of enabling the profile.

### Wave B — Dependency audit becomes fail-safe for release/security contexts

**Risk addressed:** `scripts/check-audit.mjs` currently exits 0 when the npm advisory endpoint remains unavailable after retry.

**Design:**

- Add an explicit mode, e.g. `AUDIT_UNAVAILABLE_POLICY=fail|warn`.
- Default local/developer behavior may remain `warn` to preserve developer ergonomics.
- CI merge gates, scheduled security scans, and release security paths must set `fail`.
- The audit evaluator must distinguish:
  - a real clean report;
  - actionable vulnerabilities;
  - advisory-service unavailability.
- Tests must cover both warn and fail policies.

**Acceptance:**

- CI/security/release audit jobs fail if the advisory service cannot produce a valid report.
- Local default behavior remains documented and deterministic.
- No false “clean” result is emitted for an unavailable audit service.

### Wave C — Browser security assurance becomes a first-class gate

**Risk addressed:** Generic Trivy OS/library scans do not fully establish the security state of bundled Chrome for Testing on amd64, and arm64 Chromium can contain known unfixed vulnerabilities.

**Design:**

- Add a repository script that extracts the exact browser product/version used by each image architecture.
- Add a workflow step that records browser identity for both amd64 and arm64 as build evidence.
- Add a machine-readable browser exception file with:
  - architecture;
  - browser package/product;
  - advisory/CVE identifier when known;
  - reason;
  - expiry/review date;
  - removal condition.
- The gate fails on expired exceptions.
- The browser check must never equate “Trivy clean” with “browser fully patched.”
- Keep the implementation provider-neutral so an advisory source can be changed without rewriting image-build logic.

**Acceptance:**

- Both architectures produce a browser version artifact/summary.
- Expired browser-risk exceptions fail CI.
- Security docs explain browser-specific assurance separately from OS/library image scanning.

### Wave D — API-key hashing hardening with migration compatibility

**Risk addressed:** `API_KEY_PEPPER` is optional; unpeppered SHA-256 hashes remain usable if the auth database is exfiltrated.

**Design:**

- Introduce explicit hash metadata/version on stored API-key credentials.
- New keys use a versioned HMAC-SHA-256 representation when a pepper is configured.
- Production startup emits a high-signal warning when pepper is missing; a later strict mode can fail closed.
- Authentication supports legacy hashes during migration.
- On successful authentication with a legacy hash and a configured pepper, upgrade the stored hash transactionally when feasible.
- Never log plaintext API keys or pepper values.
- Document pepper rotation limitations and a safe rotation procedure.

**Acceptance:**

- Existing keys continue authenticating through the migration path.
- New keys use the versioned peppered format when configured.
- Tests prove legacy, upgraded, invalid, and missing-pepper cases.
- No plaintext secret enters logs or audit records.

### Wave E — Fine-grained chat/group authorization foundation

**Risk addressed:** Current API-key isolation is session-level. A delegated consumer with access to a session can access all chats/groups in that session.

**Design:**

- Extend API-key policy with optional `allowedChats` / chat-scope policy.
- Empty/unset chat scope preserves existing session-level behavior for backward compatibility.
- When a chat scope is present, every read/write path that targets a chat must enforce it.
- Centralize enforcement in policy/service helpers rather than duplicating string comparisons in controllers.
- Cover REST first, then MCP, WebSocket subscriptions/events, global search, webhooks/integrations, and bulk operations.
- Structural tests must fail if new chat-addressed routes bypass chat-scope enforcement.

**Acceptance:**

- A key scoped to chat A cannot read/write chat B in the same session.
- Session-only keys continue working unchanged.
- Global/search/event surfaces filter rather than leak disallowed chats.
- Contract/OpenAPI/SDK changes are regenerated where required.

### Wave F — Plugin trust boundary hardening

**Risk addressed:** Third-party plugins execute with the gateway process's OS identity; worker isolation is reliability containment, not hostile-code containment.

**Design:**

Implement two explicit trust modes:

1. **trusted-inprocess** — current worker-thread model, clearly labeled trusted code.
2. **isolated-runner** — optional external execution boundary (separate container/process identity) for untrusted plugins.

For this branch, deliver the safe foundation:

- add a manifest/runtime trust classification;
- refuse an “untrusted” declaration unless an isolated runner is configured;
- preserve existing trusted plugins;
- ensure capability declarations remain enforced independently of trust mode;
- document that “sandboxed” means resource/failure containment, not arbitrary-code security, unless isolated-runner is active.

A full remote plugin-runner transport may be split into a later subproject if it exceeds this branch's bounded implementation budget.

**Acceptance:**

- Untrusted plugins cannot silently fall back to the in-process worker.
- Existing trusted plugins remain compatible.
- UI/API/docs surface the trust mode accurately.

### Wave G — Horizontal-scaling completion gates

**Risk addressed:** Some ownership/routing components exist, but supported production remains one replica because several runtime states and control paths remain process-local.

**Design:**

- Keep `replicaCount: 1` as the supported Helm default until all HA acceptance tests pass.
- Introduce an explicit `EXPERIMENTAL_MULTI_REPLICA`/equivalent guard for unfinished paths if needed.
- Centralize/fence:
  - lifecycle/reconnect timers;
  - WebSocket rate-limit state;
  - live bulk operation state;
  - MCP/agent owner routing.
- Use ownership generation/fencing tokens so a stale node cannot continue mutating a session after lease loss.
- Add failure-injection tests around lease expiry/takeover and stale-owner actions.

**Acceptance:**

- No documentation implies supported HA before the gate passes.
- Multi-replica enablement has an explicit safety switch.
- Ownership takeover tests prove stale owners are fenced.
- Only after all distributed-state gates pass may Helm replica guidance be raised.

### Wave H — MCP identity/provenance hardening

**Risk addressed:** Static API-key auth is not ideal for public or multi-user MCP deployments.

**Design:**

- Preserve current static-key mode for private/internal deployments.
- Add an authentication-provider abstraction capable of OAuth/OIDC validation.
- Record actor/client identity and authentication mode in audit provenance for MCP tool actions.
- Separate read/write scopes at the identity layer.
- Do not claim OAuth 2.1 compliance until authorization-code/PKCE, audience, expiry, revocation/introspection/JWKS behavior, and tests are implemented.

**Acceptance:**

- Static key remains backward compatible.
- Actor identity reaches audit records.
- Write tools cannot be authorized by read-only scope.
- Public MCP deployment docs distinguish supported static-key/private mode from OAuth-capable deployments.

### Wave I — Documentation and CI governance reconciliation

**Risk addressed:** Scaling/security docs can drift from implemented state; strong CI is less useful when repository rules are not enforced administratively.

**Design:**

- Add doc-lint assertions for:
  - supported replica count;
  - Docker orchestration opt-in;
  - plugin trust wording;
  - browser-security caveat;
  - audit-unavailable CI policy.
- Add a repository-admin runbook for branch protection/rulesets:
  - PR required;
  - required CI checks;
  - stale review dismissal;
  - force-push/delete restrictions;
  - signed/tag/release protections where available.
- Admin runbook is evidence, not a claim that settings were applied.

## 5. Implementation order

1. Wave A — Docker orchestration opt-in.
2. Wave B — fail-safe dependency audit.
3. Wave C — browser assurance.
4. Wave D — API-key hash migration.
5. Wave I — doc/CI drift gates for completed controls.
6. Wave E — chat-level authorization.
7. Wave F — plugin trust-mode enforcement.
8. Wave G — HA/fencing work.
9. Wave H — MCP identity/provenance.

The order prioritizes high-impact controls with small blast radius before schema/API/architecture changes.

## 6. Testing strategy

Every behavior change follows RED → GREEN → REFACTOR.

Required verification layers:

- targeted unit tests for each new policy/helper;
- script tests for repository/security gates;
- full TypeScript typecheck;
- root unit suite;
- doc-lint suite;
- script suite;
- e2e suite;
- PostgreSQL migration lane for schema/auth changes;
- Docker Compose configuration validation;
- Docker build/runtime smoke where container behavior changes;
- OpenAPI snapshot and SDK coverage checks where contracts change.

No “fixed” or “production-ready” claim is made solely from static diff review.

## 7. Rollback and compatibility

- Each wave is committed independently.
- Backward-compatible defaults are retained unless the unsafe default itself is the finding.
- Schema changes require reversible/forward-compatible migrations.
- API-key hash migration supports legacy verification during rollout.
- Chat-level scopes are opt-in per key so existing keys do not unexpectedly lose access.
- HA support remains disabled/experimental until all acceptance gates pass.

## 8. External/admin items tracked outside code

### GitHub repository governance

Requires repository administration and is not satisfied by a source commit:

- protect `main`;
- require relevant CI checks;
- prevent unauthorized force pushes/deletion;
- protect release tags;
- enable immutable release behavior where GitHub plan/features permit.

### WhatsApp platform dependency

Cannot be remediated in this repository. Operations must maintain:

- version-compatibility monitoring;
- account/linking smoke tests before rollout;
- incident/runbook coverage for upstream protocol changes;
- an official Meta API fallback when business continuity requirements demand it.

## 9. Completion definition

The branch is complete only when:

- each implemented wave has fresh passing verification evidence;
- no Critical/Important review findings remain unresolved without an explicit ruling;
- the final report separates:
  - fixed repository gaps;
  - deferred engineering work;
  - external/admin actions;
  - irreducible third-party/platform risks.
