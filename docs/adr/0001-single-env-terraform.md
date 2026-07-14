# ADR 0001: Single-env Terraform (prod only)

Status: Accepted (2026-07-14)

## Context

Terraform フル活用ロードマップ (Phase 1〜7) 検討で multi-env (dev/staging/prod)
分離の要否を評価した。GCP プロジェクトを複数持ち Terraform config を
`environments/dev/` `environments/staging/` `environments/prod/` に分ける
一般的パターンを採るか、単一 prod プロジェクトで継続するかを決める必要があった。

## Decision

**単一環境 (prod only) で継続**。multi-env dir 構造 / GCP project 複数化は
実施しない。Terraform state は `gs://myrrh-rental-space-terraform-state` の単一
backend、`terraform/*.tf` は flat 構造を維持する。

## Rationale

- **3x GCP コスト**: Cloud Run min=0 でも Cloud SQL instance / Secret Manager
  metadata (16 secrets × 3 env) / Load Balancer forwarding rule + static IP
  (admin service 用) / Cloud Scheduler jobs (13 crons × 3 env) で数千円/月の
  下限コストが発生する。dev/staging は idle 時間が長いにもかかわらず、
  Cloud SQL は provisioned charging のため実質全額 pay になる
- **DNS / IAP OAuth / Cloudflare 設定複製コスト**: admin service は
  Load Balancer + Google-managed SSL + IAP OAuth client + Cloudflare DNS proxy
  を必要とし、これを env ごとに複製すると OAuth consent screen の再承認 /
  Cloudflare zone 設定 / IAP-secured group 管理が env ごとに発生する。
  automated provisioning でも drift が起きる面が increases 3-fold
- **seed 差分管理コスト**: `prisma/seed.ts` と `prisma/seed-prod.ts` の 2 系統
  だけでも drift が起きているため (memory:
  `project_production-seed-fake-data-cleanup-2026-07-10`)、staging 用の
  3 系統目を維持する余力がない
- **チーム規模 mismatch**: solo team + single-tenant B2B SaaS 規模で
  multi-env の benefit (parallel dev streams / SLA-driven staging validation /
  compliance-required audit env) がいずれも該当しない
- **pre-prod validation は既に担保**: `docker compose up -d test-db`
  (localhost:5433) + `bun run build:skip-env` + `bun run test:integration` で
  ローカル validation、CI で `terraform plan` + `terraform validate` +
  tfsec / tflint、main merge 時に自動で breaking migration mode
  (DROP/RENAME 検出時の 310s drain 付きデプロイ) が動く。staging env なしでも
  「本番に壊れた config が入る」経路は塞がっている

## Migration Triggers (この判断を re-evaluate すべき条件)

以下いずれかが発生した時点で multi-env 化を再評価する:

- **SLA 契約が発生**: 99.9%+ uptime commit が入る B2B 契約 (staging での
  pre-release validation なしでは commit 不可のため)
- **IAP config 変更が月次以上**: OAuth consent screen / IAP-secured group /
  Cloudflare DNS の変更が定常運用化した場合 (production で試行錯誤する
  リスクが benefit を上回る)
- **チーム 3+ 名 or 別 workload 追加**: 並行開発 branch の integration
  validation env が必要になる場合
- **Business-critical experiment を prod で試せない状況**: 決済 flow /
  在庫制御 / 予約 lock 系の変更を production revenue traffic に対して
  試すのが許容できなくなった場合
- **監査要件で staging env 必須**: SOC 2 / ISO 27001 / PCI-DSS 等で
  production と分離された validation env が明示要件となった場合

Migration triggers のいずれか発火時は、multi-env 化の設計として
[terraform-google-bootstrap](https://github.com/terraform-google-modules/terraform-example-foundation)
の 4-projects 構造 (org / net / shared / envs) をベースに再検討する。

## Rejected Alternatives

- **Terraform workspaces**: HashiCorp 公式が
  ["Named workspaces are not a suitable isolation mechanism for strong separation"](https://developer.hashicorp.com/terraform/cli/workspaces)
  と明言している (single backend / single credential / single state prefix)。
  prod credential を持ったまま dev workspace で apply する事故が構造的に
  塞げないため却下
- **`environments/dev|staging|prod/` dir 構造**: 上記 rationale で ROI 負。
  seed drift + IAP / OAuth 再設定コストが 3 倍化する
- **Multi-project structure (FAST 0-org-setup 型)**: enterprise pattern で、
  4 GCP project (org / net-shared / prod-shared / prod-workload) を前提とする。
  solo/small team には過剰。organizational structure 自体が Google Workspace
  Organization 契約を要求するため、$6/user/month の運用コストが加算される

## Related

- memory: `project_terraform-full-adoption-2026-07-14` — Terraform フル活用の
  4 絶対規約 (runner IAM bootstrap-only / import{} blocks / F1 structural
  closure / strict blocking gate)
- `terraform/README.md` — Phase 進捗 / bootstrap-owns-all-project-IAM 契約 /
  Custom role lifecycle
- `.claude/rules/deploy-infra.md` — main push = 即・本番デプロイ / breaking
  migration mode の挙動
