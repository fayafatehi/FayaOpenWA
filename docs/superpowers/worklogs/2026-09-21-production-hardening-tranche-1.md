# SDD ledger — plan: docs/superpowers/plans/2026-09-21-production-hardening-tranche-1.md

Spec: docs/superpowers/specs/2026-09-21-production-hardening-design.md
Branch: audit/production-hardening-2026-09-21
Baseline main: 7745ca4a6481475304c67dd4bf09831757dffc56

Pre-flight: Task 1 produces AUDIT_UNAVAILABLE_POLICY; Task 2 consumes the same environment contract — interface names match.
Pre-flight: Tasks 3–5 do not share runtime interfaces with Tasks 1–2; they share only CI/doc verification lanes.
Ruling: use the GitHub branch + draft PR as the isolated execution workspace because the local container cannot clone the repository; use PR Actions as authoritative test execution — cost if wrong: slower RED/GREEN feedback, but no reduction in test coverage.
Ruling: store the execution ledger under docs/superpowers/worklogs rather than the git-ignored local .superpowers workspace because execution is GitHub-native and must survive tool/session boundaries — cost if wrong: one additional branch-only documentation file, removable before merge.

Task 1: RED — commit b7af040; PR CI run 35547665349 ran unit tests and doc-lint green, then `npm run test:scripts` failed exactly because `./check-audit.mjs` did not export `unavailableAuditDecision`.
Task 1: GREEN — commit bad964e; PR CI run 35547921286: live Security audit passed; Test job 106177108962 passed unit tests, doc-lint, and `npm run test:scripts`.
Task 1: complete (commits b7af040..bad964e, tests: `npm run test:scripts` → success; policy helper implements warn/fail and invalid values fail closed).

Task 2: RED — commit f938c6b; PR CI run 35548116371 passed the normal unit suite then `npm run test:docs` failed on all three expected missing `AUDIT_UNAVAILABLE_POLICY=fail` assertions (ci.yml audit, security-scan.yml audit, release.yml lint).
Task 2: GREEN — final implementation commit 6c4af70; PR CI run 35548293870 passed unit tests, `npm run test:docs`, `npm run test:scripts`, and Helm/workflow validation on the complete three-workflow state.
Task 2: complete (commits f938c6b..6c4af70, tests: `npm run test:docs` → success; root audit steps fail closed in CI, scheduled security scan, and release).

Task 3: RED — commit b9711c6; PR CI run 35548467644 ran the normal unit suite green, then `npm run test:docs` failed on the expected missing `docker-proxy.profiles=['orchestration']` assertion.
Task 3: Ruling: the plan's "no mandatory depends_on" requirement does not mean the optional Compose dependency must be absent; retain `depends_on.docker-proxy.required=false` so startup ordering is used when the profile is enabled while default API startup remains independent — cost if wrong: Compose could unexpectedly activate or wait for the proxy, which the profile + required=false regression tests guard.
Task 3: GREEN — commit a9fa2b2; run 35550457363 (same Compose state plus later non-Compose hygiene changes) passed unit tests, `npm run test:docs`, and `npm run test:scripts`; Helm/workflow validation also passed.
Task 3: complete (commits b9711c6..a9fa2b2, tests: `npm run test:docs` → success; Docker socket proxy is disabled by default behind the explicit `orchestration` profile and API startup keeps only an optional dependency).
Ruling: an overlapping Task 1 implementation was re-applied after intervening commits and produced a duplicate `unavailableAuditDecision` declaration; remove only the duplicate in 64292bc and retain the earlier RED→GREEN implementation — cost if wrong: the audit gate would fail to load, covered by script tests + the live Security audit lane.
Branch hygiene: removed the unintended internal blank line in `release-gate-parity.spec.ts` at a380889 after ESLint/Prettier identified it.

Task 4: RED — commit c85f0ed; PR CI run 35550657691 passed the normal unit and doc-lint suites, then `npm run test:scripts` failed exactly with ERR_MODULE_NOT_FOUND for `scripts/check-browser-security.mjs`.
Task 4: GREEN — final workflow implementation commit a8fc067; PR CI run 35550919093 passed `Validate browser security policy`, Security audit, lint, `npm run test:docs`, `npm run test:scripts`, PostgreSQL, dashboard, shell, and Helm/workflow actionlint lanes.
Task 4: Ruling: browser evidence is identity + exception-freshness evidence only; emit `advisoryCoverage=not-verified` even when no exception applies, because Trivy cannot establish amd64 CfT CVE completeness and `ignore-unfixed` intentionally omits some arm64 distro advisories — cost if wrong: operators could mistake a green image scan for a fully patched browser.
Task 4: Ruling: ordinary PR CI validates the Dockerfile strategy and dated exception policy without executing both image architectures; exact runtime browser versions are executed and recorded in the scheduled/release image-scan jobs where the multi-arch image exists — cost if wrong: a PR cannot prove the built browser binary identity until an image is produced, mitigated by release-time identity enforcement.
Task 4: complete (commits c85f0ed..a8fc067, tests: `npm run test:scripts` → success; workflow/actionlint → success; security policy validation → success).
