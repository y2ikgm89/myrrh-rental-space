# 全コードベース監査レポート (2026-07-29)

> **これは 2026-07-29 時点のスナップショットで、現行仕様書ではない。**
> 以降更新していないので、本文中のファイル名・PR 番号・件数・「残 follow-up」は
> **当時の事実**として読むこと（実際、いくつかはその後の変更で解決済み／改名済み）。
> 現在の状態はコードと [`README.md`](README.md) の「現行」節を見る。
> 置き場の性質については [`README.md`](README.md) を参照。

## ベースライン gates

| Gate                            | 結果                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `bun run validate`              | pass                                                                                                          |
| `bun run test:unit` (709 files) | pass                                                                                                          |
| `bun run build:skip-env`        | pass                                                                                                          |
| `bun run test:integration`      | 未実行（ローカル test DB 資格情報未設定のため。CI required ではないが DB concurrency 網羅は CI E2E 側に依存） |

## 重大度別 findings（修正済み / 意図的設計）

### Critical / High — 修正済み

| #   | 項目                                                   | 判定                                                         | 修正                                                                                               |
| --- | ------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | 予約キャンセル系が space advisory lock (728351) 未取得 | **欠陥**（規約 #8 違反。cancel は EXCLUDE 占有解放の write） | `customer-commands` / `lifecycle-commands` / `pending-expiry` / `series-commands` に lock 追加     |
| 2   | 通知 `event-registration` resourceType で href null    | **欠陥**                                                     | 発行側を `resourceType: "event"` + `eventId` に統一（`payment-queries.ts`, `checkout-helpers.ts`） |
| 3   | receipt-resend idempotencyKey                          | **Phase 1-5 で誤修正** → Phase 6 で復元                      | `Date.now()` bucket は正当リトライ用（doc/test 契約）。abuse は per-serial rate limiter が担当     |

### Medium — 修正済み

| #   | 項目                                 | 判定                                        | 修正                                                                                                                    |
| --- | ------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 4   | cron コメント drift (instagram-sync) | **ドキュメント欠陥**                        | route コメントを `*/30` に合わせ更新                                                                                    |
| 5   | receipt-backfill コメント            | **問題なし**（コードは既に毎時 :15 と一致） | —                                                                                                                       |
| 6   | cache tag producer なし invalidator  | **意図的**                                  | `INVALIDATION_ONLY` allowlist（`type-safety-cast-and-cache-tag-drift.test.ts`）で機械固定。SITEMAP は CDN co-purge のみ |
| 7   | AGENTS.md inquiry cascade 記述       | **ドキュメント誤り**                        | コード正本（Inquiry 独立匿名化）に AGENTS.md を修正                                                                     |
| 8   | cron-oidc 硬コード 22 routes         | **ゲート欠陥**                              | 全 cron route を filesystem scan するよう変更                                                                           |
| 9   | cron route↔terraform path 同期       | **ゲート欠如**                              | `cron-scheduler-path-sync.test.ts` 新規追加                                                                             |
| 10  | guest-token-actions テスト空白       | **カバレッジ gap**                          | `run-guest-mutation.test.ts` 追加                                                                                       |

### Low — 修正済み

| #   | 項目                                          | 修正                                     |
| --- | --------------------------------------------- | ---------------------------------------- |
| 11  | Zod 4 legacy (`z.string().uuid`, `.strict()`) | `reagree-schema.ts`, `rate-breakdown.ts` |
| 12  | 未使用 `@deprecated` section helpers          | 3 関数削除                               |
| 13  | `consumeSignupTermsAction` unused `isNew`     | signature から除去（caller 更新）        |

### 意図的設計 / 問題なし（断定）

| 項目                                                 | 理由                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Stripe Checkout create に Stripe idempotencyKey 無し | **Phase 7 で修正** — 決定的 `idempotencyKey` を orchestrator + legacy caller に追加 |
| SwitchBot reissue revoke wait                        | 実装 clean（`reissue-passcode.ts`）                                                 |
| cron 23/23 path↔job                                  | 一致（新 gate で機械保証化）                                                        |
| Feature module public gates                          | `public-route-gates.test.ts` で整合                                                 |
| Next/React/Prisma/Tailwind legacy                    | 実質 0 件（事前スキャン確認）                                                       |
| `throw new Error("not implemented")`                 | src に 0 件                                                                         |

## クラスタ監査サマリ（49 ドメイン）

機械 gate（architecture-boundaries 106 + architecture/* 84 + ESLint + CI required 8）が厚く、**横断 invariant は概ね clean**。薄いテスト領域（instagram, notifications domain unit, data-retention 等）は architecture/cron/integration 依存 — 回帰は CI unit + smoke E2E でカバー。

主要 E2E フロー（予約→決済→領収書→SwitchBot、イベント waitlist、匿名化、GCal 同期）は domain/action/api 配線が一貫。

## 修正 PR 分割案（参考）

1. advisory lock on cancel paths
2. notification href + receipt idempotency
3. cron gates + comment fix
4. clean-break (Zod, deprecated helpers, consumeSignupTerms)
5. AGENTS.md doc fix
6. guest-token-actions test

## 残リスク / follow-up（未実装）

- 領収書詳細 UI のイベント申込 admin 導線（`ReceiptDetailView.tsx` Phase 2 コメント — 機能 gap ではなく計画済み）
- Phase 3 任意 clean-break（`PAYMENT_REFUND_TRANSACTION_OPTIONS` rename、middleware→proxy コメント）

## クラスタ E–H フォローアップ（追加修正済）

- **Medium**: editor-comments RBAC — `contentType` ごとに `page|post|news|faq` resource + EDITOR `userPageAssignment` を検証（`editor-comment-auth.ts`）
- **Low**: guest-token テスト / cron OIDC path sync gate（前セッションで対応済み）

## Phase 6 補完監査（lib / data+ops / e2e+UI+email）

**スコープ**: clusters A–H で未カバーだった層（`src/shared/lib` 横断基盤、prisma/scripts/terraform、e2e/UI/メール）。

### 監査サマリ（3 エージェント）

| エージェント | 対象                                  | Critical/High | Medium | Low |
| ------------ | ------------------------------------- | ------------- | ------ | --- |
| lib 横断基盤 | security/infra/内部基盤               | 0             | 1      | 1   |
| data+ops     | prisma/scripts/terraform/workflows    | 0             | 2      | 5   |
| e2e+UI+email | 66 specs / client UI / email registry | 1             | 2      | 2   |

### Phase 6 修正済み

| 重大度 | 項目                                               | 修正                                               |
| ------ | -------------------------------------------------- | -------------------------------------------------- |
| High   | receipt-resend idempotencyKey 実装↔doc/test 不整合 | `Date.now()` bucket を復元                         |
| Medium | SSRF NAT64/6to4 経由の私設 IPv4 漏れ               | `ssrf-guard.ts` + unit test                        |
| Medium | `SECONDARY_ENCRYPTION_KEYS` 監査 SSoT 欠落         | `REQUIRED_CLOUD_RUN_SECRET_ENV_REFS` に追加        |
| Medium | `InquiryStatusHistory` append-only 未実装          | DB trigger migration + data-retention purge bypass |
| Medium | DesignPreview nonce なし `<style>` (CSP)           | keyframes を `admin.css` へ移行                    |
| Low    | cron OIDC email 比較が非 timing-safe               | `timingSafeEqualStrings`                           |
| Low    | email registry テスト件数 stale                    | `TEMPLATE_KEYS.length` と exact match              |
| Low    | encryption runbook が cloudbuild 手順を参照        | Terraform pin 手順に更新                           |

### Phase 6 残 follow-up（Phase 7 でクローズ）

- ~~**data+ops (Low)**: trgm / partial index~~ → PR4
- ~~**data+ops (Low)**: audit plain env / terraform-drift blind spot~~ → PR6
- ~~**e2e (Medium)**: CalendarPicker `initialNowIso`~~ → PR3
- ~~**e2e (Low)**: `inquiryFixtures` 未参照~~ → PR7
- ~~**e2e カバレッジ gap**~~ → PR8–12
- ~~**integration test ローカル**~~ → PR13

### 網羅性の正直な評価

| 層                            | Phase 6 前          | Phase 6 後                                       |
| ----------------------------- | ------------------- | ------------------------------------------------ |
| `src/shared/domain` (48 dirs) | clusters A–H で網羅 | 変更なし                                         |
| `src/shared/lib` 横断基盤     | 未監査              | 監査 + 主要 finding 修正                         |
| prisma / scripts / terraform  | 機械 gate のみ      | 監査 + append-only/audit SSoT 修正               |
| e2e / UI / email              | 部分                | 監査（カバレッジ gap は follow-up として文書化） |
| integration test ローカル     | 未実行              | 未実行（CI 依存）                                |

## Phase 7 — 監査 follow-up 完遂

**スコープ**: Phase 6 残 follow-up（cache/PII、DB index、Stripe idempotency、ops gate、E2E gap 5 系統、integration ローカル整備）を full closure。

### Phase 7 修正済み

| ID     | 項目                                                                            | 修正                                                                                                                   |
| ------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| PR1    | イベントカテゴリ更新時 `CACHE_TAGS.EVENTS` co-invalidation                      | `event-category.ts` + architecture unit test                                                                           |
| PR2    | email 用 `meetingUrl` CONFIRMED gate                                            | `registration-queries.ts` + unit test                                                                                  |
| PR3    | CalendarPicker `initialNowIso` 配線                                             | 予約フォーム chain + `rate-plan-preview.smoke.spec.ts` 安定化                                                          |
| PR4    | `TermsAgreement.guestEmail` trgm + `Customer.suppressedEmailHash` partial index | migration `20260729130000_admin_search_index_followups` + schema `@@index`                                             |
| PR5    | Stripe Checkout `idempotencyKey`                                                | `checkout-session-create-orchestration.ts` + 全 caller + unit test                                                     |
| PR6    | Cloud Run plain env gate + terraform-drift blind spot 文書化                    | `gcp-production-audit-model.ts` SSoT 定数 + architecture test + `terraform/README.md`                                  |
| PR7    | `inquiryFixtures` operational 定数 drift gate                                   | `e2e/authenticated/admin/inquiry-operational-fixtures.spec.ts`                                                         |
| PR8–12 | E2E 5 flows                                                                     | mypage receipt / guest status hub / waitlist offer confirm / admin anonymize / passcode reveal specs + fixture scripts |
| PR13   | integration test ローカル setup                                                 | `README.md` + `project-workflow` verification 追記（`bun run setup` 経路確認済）                                       |

### Phase 7 意図的残置（スコープ外）

- `ReceiptDetailView.tsx` Phase 2 admin 導線（計画済み機能 gap）
- Phase 3 任意 clean-break（`PAYMENT_REFUND_TRANSACTION_OPTIONS` rename 等）

### ゲート（Phase 7 完了時点）

| Gate                         | 結果                                  |
| ---------------------------- | ------------------------------------- |
| `bun run validate`           | 実行済（type-check + lint）           |
| 該当 unit/architecture tests | 実行済                                |
| E2E 新 spec                  | CI / ローカル Playwright project 経由 |
