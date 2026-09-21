# SDD ledger — plan: docs/superpowers/plans/2026-09-21-production-hardening-tranche-1.md

Spec: docs/superpowers/specs/2026-09-21-production-hardening-design.md
Branch: audit/production-hardening-2026-09-21
Baseline main: 7745ca4a6481475304c67dd4bf09831757dffc56

Pre-flight: Task 1 produces AUDIT_UNAVAILABLE_POLICY; Task 2 consumes the same environment contract — interface names match.
Pre-flight: Tasks 3–5 do not share runtime interfaces with Tasks 1–2; they share only CI/doc verification lanes.
Ruling: use the GitHub branch + draft PR as the isolated execution workspace because the local container cannot clone the repository; use PR Actions as authoritative test execution — cost if wrong: slower RED/GREEN feedback, but no reduction in test coverage.
Ruling: store the execution ledger under docs/superpowers/worklogs rather than the git-ignored local .superpowers workspace because execution is GitHub-native and must survive tool/session boundaries — cost if wrong: one additional branch-only documentation file, removable before merge.
