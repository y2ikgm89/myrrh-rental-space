# ADR 0006: Cloud Run traffic ownership and tag canary

Status: Accepted (2026-08-25)

## Context

Cloud Run の **traffic 割当**（LATEST 100% / revision pin / tag URL）が
Terraform・Cloud Build・手動 `gcloud` のどこで所有されるかが曖昧だと、
デプロイ後の serving revision が意図せず変わる・pin が次の apply で消える・
canary なしに 100% 切替になる、といった事故の説明責任が散らばる。

現状の事実:

- **本番デプロイは自動 rollback しない。** `post-deploy-smoke` が失敗しても
  revision は既に出ている — workflow を赤にして検証 NG を明示するだけ
  （`.github/workflows/deploy-production.yml:483`）。
- **手動 traffic 切替の唯一の runbook 手順**は DB リストア時の
  `gcloud run services update-traffic --to-revisions` で、Terraform の
  LATEST/100 宣言と食い違う一時止血である
  （`docs/runbooks/database-restore.md:126-136`）。
- **Deploy Production は `terraform-apply` の後に `deploy` が走る。**
  `terraform-apply` job（`:151`）が `deploy` job（`:315` の `needs: terraform-apply`）
  の前段なので、apply が traffic を LATEST/100 に戻す経路が残っている。
- Terraform は public / admin とも traffic block を
  `TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST` / `percent = 100` で宣言している
  （`terraform/cloud_run_public.tf:123-126`、
  `terraform/cloud_run_admin.tf:121-124`）。Cloud Build は
  `gcloud run services update --image` のみ（shape / env / secrets は Terraform SSoT）。
- [Cloud Run 公式](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration):
  pin や split を一度入れると**以後の deploy もそのパターンを引き継ぐ**。
  毎回 LATEST 100% に戻すには deploy 完了後に明示的な `update-traffic` が要る。

## Decision

**Cloud Run の traffic は GitHub Actions の deploy job が所有する。**
Terraform は traffic block を宣言したまま `lifecycle.ignore_changes` に入れ、
Cloud Build は image 更新に専念する。

具体的には次の 3 点を採用する（実装は後続 PR で本 ADR に沿って入れる）:

1. **所有権の分離**
   - traffic の読み書きは **`.github/workflows/deploy-production.yml` の deploy job**
     （Cloud Build submit の前後を含む）が担う。`cloudbuild.yaml` の
     `deploy-public` / `deploy-admin` は `--image` 更新のみのまま。
   - Terraform は traffic block を**削除せず**残し、`lifecycle.ignore_changes` に
     `traffic` を追加する。空 state からの bootstrap 宣言を失わないため
     （[Terraform `google_cloud_run_v2_service`](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud_run_v2_service)
     — traffic 未指定は latest Ready へ 100% だが、明示宣言を維持する）。

2. **毎 deploy の `--to-latest`**
   - 各 surface の deploy 完了後、
     `gcloud run services update-traffic --to-latest` を必ず実行する。
   - 公式の「pin / split は以後の deploy に引き継がれる」挙動を打ち消し、
     意図しない旧 revision への serving を防ぐ（上記 Cloud Run 公式 doc）。

3. **Public は tag canary、admin は canary しない**
   - **Public**（`ingress = INGRESS_TRAFFIC_ALL`）: 新 revision を
     `--no-traffic --tag=<TAG>` で出し、tag URL で smoke してから promote
     （`update-traffic` で LATEST 100% へ）。
   - **Admin**（`ingress = INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`）:
     外部から tag URL を叩けないため canary しない。image 更新後は
     `--to-latest` と既存の IAP smoke で検証する。

## Rationale

- **Terraform apply と Cloud Build の競合を避ける。** apply が traffic を
  LATEST に戻す一方、deploy 中に pin が必要なら deploy 面が最後に書く。
  `ignore_changes` で Terraform は「宣言はするが実態は追わない」に寄せ、
  所有権を 1 箇所に集約する。
- **`--to-latest` は公式が暗黙に要求する後処理。** pin を一度入れたあと
  `services update --image` だけでは serving が旧 revision のまま残りうる。
- **Public だけ tag canary。** 全ユーザー traffic を未検証 revision に送る前に
  Cloudflare 経由で到達可能な tag URL で検証できる。Admin は ILB + IAP 経由のみ
  で tag URL 検証が成立しない。
- **自動 rollback は採らない（現状維持）。** smoke 失敗で workflow は赤になるが
  revision は既に出ている（`deploy-production.yml:483`）。traffic 所有権を deploy に
  移しても、この方針は変えない。

## Consequences

- **`terraform-drift.yml` は traffic pin を検知しなくなる。**
  同 workflow は Console / gcloud の手動変更のうち、config 側の
  `lifecycle { ignore_changes = [...] }` で吸収済みのものは plan diff に出ないと
  明記している（`.github/workflows/terraform-drift.yml:17-21`）。`traffic` を
  `ignore_changes` に入れると、意図的な pin も nightly drift から見えなくなる。
- **対価（補償）は deploy 時検証と手動監査に限定する。**
  - deploy job 内の serving 検証（post-deploy smoke、後続 PR の tag promote 前 smoke）
  - 必要時の `bun run gcp:audit-production-iap`（CI 常時ではない）
  - **常時 watch は無い。** この監視穴は本 program の別 ticket とし、
    ここでは scope に入れない。
- **Cloud Build に `deploy-admin` より後ろの step を足すと、既存 gate が壊れる。**
  `deploy-production-workflow.test.ts` は `id: deploy-admin` 以降を
  slice-to-EOF で検査している（`:265`、`:297`、`:516`）。traffic 用の
  `gcloud` は **workflow の deploy job** に置き、cloudbuild の末尾には足さない。
- DB リストア runbook の一時 pin（`database-restore.md:126-136`）は引き続き
  有効。`traffic` は `ignore_changes` なので `terraform-apply` は pin を戻さない。
  解除するのは deploy 末尾の `update-traffic --to-latest`。恒久 rollback は
  revert + 通常出荷で行う。

## Migration Triggers (re-evaluate すべき条件)

- Cloud Run が admin 面でも外部検証可能な tag / preview URL を公式サポートする
- チームが multi-region や blue-green を Cloud Build 内だけで完結させたい要件を持つ
- `terraform-drift.yml` で traffic pin を検知する別の read-only 監視が入る

## Rejected Alternatives

- **Cloud Build が traffic を所有する** — `deploy-admin` 以降に step を足すと
  architecture gate の slice 契約に抵触する（上記 Consequences）。workflow 側の方が
  terraform-apply との順序も制御しやすい。
- **Terraform が traffic を追い続ける（`ignore_changes` なし）** — pin / canary と
  apply の LATEST 復帰が毎デプロイ競合する。手動 pin は次の apply で消える。
- **deploy 失敗時の自動 `update-traffic --to-revisions` rollback** — 現行は
  smoke 失敗でも revision は残す（`deploy-production.yml:483`）。誤 rollback の
  リスクと DB 不整合を避け、人手 runbook に委ねる。

## Related

- [Cloud Run rollouts, rollbacks, and traffic migration](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
- [`.github/workflows/deploy-production.yml`](../../.github/workflows/deploy-production.yml)
- [`docs/runbooks/database-restore.md`](../runbooks/database-restore.md) — 手動 traffic 切替
- [`docs/runbooks/post-deploy-verification.md`](../runbooks/post-deploy-verification.md)
- [`__tests__/unit/architecture/deploy-production-workflow.test.ts`](../../__tests__/unit/architecture/deploy-production-workflow.test.ts)
- ADR [0005](0005-node-runtime-for-next-server-bun-elsewhere.md) — Cloud Run 実行時は Node
