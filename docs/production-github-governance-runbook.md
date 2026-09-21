# Production GitHub Governance Runbook

**Repository:** `fayafatehi/FayaOpenWA`  
**Status:** **PENDING ADMINISTRATOR ACTION**  
**Observed:** 2026-09-21

> Merging this runbook does not apply repository settings. Rulesets, branch protection, tag
> governance, and immutable releases are GitHub repository controls and must be enabled by a
> repository administrator. Treat this document as the required configuration and verification
> procedure, not as evidence that the settings are active.

## 1. Observed state before administrator action

At the time this runbook was written, the GitHub API reported:

- repository rulesets: none;
- `main`: `protected: false`;
- required-status-check enforcement: off.

Re-check the live repository before and after applying the controls below. Do not infer governance
state from this file or from CI configuration alone.

## 2. Protect `main`

Create an **active branch ruleset** targeting the default branch / `main`.

### Required merge controls

- **Require a pull request before merging.**
- Require at least one approving review for production changes; raise the count if your operating
  model requires stronger separation of duties.
- Dismiss stale approvals after reviewable changes, or require approval of the most recent
  reviewable push.
- Require all review conversations to be resolved.
- Require branches to be up to date before merge when that is compatible with the repository's
  merge queue/workflow model.

### Required status checks

Configure **required status checks** using the current CI job names:

- `Lint`
- `Security audit`
- `Test`
- `Test (PostgreSQL migrations)`
- `Dashboard`
- `Shell scripts`
- `Helm chart and workflows`
- `Build`
- `Docker Build`

A workflow file existing in the repository is not enforcement. After saving the ruleset, open a
test pull request and verify GitHub blocks merge until every required check has reported success.

### Ref integrity

- Block or restrict **force pushes** to `main`.
- Restrict branch **deletions**.
- Restrict direct branch updates so normal production changes arrive through reviewed pull
  requests.
- Keep bypass identities minimal. Any break-glass bypass should be attributable to a named
  administrator and documented in the incident/change record.

## 3. Protect release tags

Create a separate active **tag ruleset** targeting release tags matching:

`v*`

Recommended controls:

- restrict release-tag creation to the release-maintainer/bot identity;
- restrict updates and block force pushes/non-fast-forward changes;
- restrict tag deletions;
- require the release workflow to build from the intended reviewed commit;
- keep bypass permissions narrower than the branch ruleset where possible.

A protected branch does not automatically protect tags. Verify both rulesets independently.

## 4. Immutable releases

Enable GitHub **immutable releases** when the repository/account feature is available and compatible
with the release process.

Immutable release protection is intended to stop an already-published release tag or release assets
from being silently replaced. Before enabling it, verify the current release workflow does not rely
on mutating a published release artifact after publication.

After enabling immutable releases:

1. publish a non-production test release/tag in a safe test repository or controlled test cycle;
2. verify release assets cannot be replaced in place;
3. verify the associated release tag cannot be moved as an ordinary mutable ref;
4. verify the normal metadata edits your process requires remain possible.

## 5. Administrator verification

### GitHub UI

In repository settings, inspect the active branch/tag rulesets and confirm their enforcement state is
**Active**, not merely Evaluate/Disabled. Verify the target patterns cover `main` and `v*`
respectively.

### GitHub CLI / API evidence

Run with an administrator credential that can read repository rules:

```bash
gh api repos/fayafatehi/FayaOpenWA/rulesets   --jq '.[] | {id, name, target, enforcement, conditions, rules}'

gh api repos/fayafatehi/FayaOpenWA/branches/main   --jq '{name, protected, protection}'
```

Expected outcome after configuration:

- at least one active branch ruleset targets `main`;
- an active tag ruleset targets `v*`;
- pull-request and required-status-check rules are present;
- force-push/deletion restrictions are present;
- `main` is no longer effectively open to unrestricted direct production updates.

Record the command output or screenshots in the production change ticket. Do not paste administrator
tokens into tickets, commits, CI logs, or chat.

## 6. Enforcement smoke test

Use a disposable test branch and pull request.

1. Push a normal feature branch.
2. Open a PR to `main`.
3. Confirm merge is blocked while one required status check is pending.
4. Confirm review requirements are enforced.
5. Confirm a direct/force update to `main` is rejected for a normal non-bypass identity.
6. Confirm unauthorized deletion/update of a matching release tag is rejected.
7. Confirm the approved merge path still works after all checks and reviews are satisfied.

Never test destructive tag/branch rules against a production release ref.

## 7. Periodic review

Review repository governance at least quarterly and after:

- changing CI job names;
- adding/removing a release workflow;
- changing administrators or automation identities;
- changing merge strategy;
- enabling/disabling immutable releases;
- a bypass or emergency direct-push incident.

The structural documentation tests in this repository keep the expected CI check names and this
runbook from silently drifting, but only a live GitHub settings/API check proves the controls are
actually applied.

## 8. References

Use the current GitHub documentation for:

- available rules for repository rulesets;
- creating and managing branch/tag rulesets;
- required status checks;
- protected branches;
- preventing changes to releases / immutable releases.

GitHub product behavior can change; verify the current documentation and repository plan before
applying settings.
