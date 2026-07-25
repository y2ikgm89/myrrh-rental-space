# Abolish Main Terraform Health (PR merge gate)

Status: Accepted (2026-07-25)  
Decision: **Option A — remove the PR-blocking gate**

## Context

Production deploy is **manual** (`workflow_dispatch` only). `main` auto-merge no longer triggers Cloud Run / terraform apply.

`Main Terraform Health` was built for the old model (merge = deploy): if post-merge `terraform-apply` failed, block further PR merges to stop cascade damage.

That coupling is wrong under manual deploy:

- Merging to `main` does not worsen a failed deploy by itself
- Blocking unrelated PRs while waiting for a manual redeploy adds friction without safety
- Infra recovery is: merge fix → run Deploy Production

## Decision

1. Delete `.github/workflows/check-main-terraform-health.yml`
2. Remove `Main Terraform Health` from `.github/branch-protection.json` and live branch protection
3. Keep failure visibility on Deploy Production (`Open apply failure issue` → `deploy-broken` label)
4. Keep PR-time `Terraform / validate` as the infra required check

## Non-goals

- Do not add a deploy-time “previous run must be green” hard gate (apply failure already fails the deploy)
- Do not path-filter a partial health gate for `terraform/**` PRs

## Recovery model (after this change)

| Situation                                         | Action                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| Manual Deploy Production fails at terraform-apply | Fix on a PR, merge to main, re-run Deploy Production             |
| Want to know last deploy status                   | Actions → Deploy Production run history / `deploy-broken` issues |
