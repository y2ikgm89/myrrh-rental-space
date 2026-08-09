# ADR 0002: Main Terraform Health の PR merge gate を廃止する

Status: Accepted (2026-07-25)

## Context

`Main Terraform Health` は「main merge = 本番 deploy」という旧モデル向けの gate
だった。post-merge の `terraform-apply` が失敗したら、以降の PR merge を required
check で block して cascade damage を止める、という設計。

本番 deploy は `workflow_dispatch` の手動実行だけに変わり
（`.github/workflows/deploy-production.yml` の `on:` は `workflow_dispatch` 単独）、
merge は deploy を起こさなくなった。この結合はもう成立しない:

- main への merge それ自体は、失敗した deploy を悪化させない
- 手動 redeploy を待つ間、無関係な PR を block するのは safety の無い friction
- infra 復旧の手順は「修正 PR を main へ merge → Deploy Production を手動実行」で、
  merge を止めると復旧そのものが進まない

## Decision

**PR-blocking gate を廃止する。**

1. `.github/workflows/check-main-terraform-health.yml` を削除
2. `.github/branch-protection.json` と live branch protection から
   `Main Terraform Health` を除去
3. 失敗の可視化は Deploy Production 側に残す
   （`Open apply failure issue` → `deploy-broken` label）
4. PR 時の `Terraform / validate` は infra の required check として維持

## Rejected Alternatives

- **deploy 時に「前回 run が green」の hard gate を足す** — apply 失敗は既に
  deploy 自体を失敗させるので、二重に止める意味が無い。復旧デプロイまで
  block してしまう。
- **`terraform/**` の PR に限定した部分 health gate を path-filter で足す** —
  block する根拠（merge が deploy を起こす）が消えている以上、対象を狭めても
  friction が残るだけ。

## 復旧モデル

| 状況                                             | 手順                                                            |
| ------------------------------------------------ | --------------------------------------------------------------- |
| 手動 Deploy Production が terraform-apply で失敗 | 修正を PR にして main へ merge し、Deploy Production を再実行   |
| 直近 deploy の状態を知りたい                     | Actions → Deploy Production の run 履歴 / `deploy-broken` issue |

## Related

- `.github/workflows/deploy-production.yml`（`Open apply failure issue` step が
  この ADR を参照する）
- `.github/workflows/terraform-drift.yml`（nightly の drift 検出）
- 該当 gate: `__tests__/unit/architecture/deploy-production-workflow.test.ts`
  （廃止済みであることを固定する）
- [ADR 0001](0001-single-env-terraform.md) — 単一 env 構成
