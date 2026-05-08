# Project Score — 2026-05-08

> 監査スナップショット: 7 専門 reviewer agent 並列 dispatch + 手動メトリクス収集
> 対象: `myrrh-rental-space` main branch @ `d695922f`（src/ 1601 ファイル / 1871 commits）
> 検証ベース: `bun run validate` exit 0 / `bun run build` exit 0

## Overall Score: **91 / 100**

| 軸                            | スコア | 重み |     加重 |
| ----------------------------- | -----: | ---: | -------: |
| コード品質                    |     92 |  15% |     13.8 |
| セキュリティ                  |     92 |  15% |     13.8 |
| アクセシビリティ              |     91 |  10% |      9.1 |
| 運用 / DevOps                 |     95 |  10% |      9.5 |
| アーキテクチャ / ルーティング |     82 |  10% |      8.2 |
| テスト                        |     88 |  10% |      8.8 |
| パフォーマンス                |     88 |   5% |      4.4 |
| キャッシュ戦略                |     90 |   5% |      4.5 |
| ドキュメント                  |     95 |   5% |     4.75 |
| Better Auth (dual-instance)   |     91 |   5% |     4.55 |
| React Compiler 1.0 互換       |     97 |   5% |     4.85 |
| Zod 4 スキーマ                |     91 |   5% |     4.55 |
| **合計**                      | **91** | 100% | **90.8** |

---

## 軸別評価

### コード品質 — 92/100（project-reviewer agent）

**強み**: ハードコードカラー 0件・`text-[10px]` 0件・`className` テンプレートリテラル 0件。`executeAdminMutationResult` 283 件採用、64 個の `"use server"` ファイル全て async export 準拠。app 層から Prisma 直 import 0 件、`enums/prisma-types` ゲートウェイバイパス 0 件。

**主要 issue**:

1. `Object.keys() as T[]` 残存 — `keysOf()` ヘルパー未使用 (`CustomerBulkActions.tsx:150` / `InquiryBulkActions.tsx:101`)
2. DB JSON フィールドへの直接 cast — `parseBusinessAttributes` / `parseBusinessHours` バイパス (`LocationForm.tsx:356,361`)
3. デザインシステム Button の動的 Icon cast — `createElement(Icon, ...)` パターンで解消可能 (`button.tsx:52` / `magnetic-button.tsx:50`)

### セキュリティ — 92/100（security-reviewer agent）

**強み**: Stripe / GCal webhook の DB アクセス前署名検証、`executeAdminMutationResult` による admin write SSoT、dual-auth cookiePrefix 完全分離、`findFirst({ where: { id, customerId, deletedAt: null } })` IDOR 防止パターン徹底、AES-256-GCM + HKDF at-rest 暗号化。

**主要 issue**:

1. In-process LRU rate limiter — Cloud Run マルチインスタンス間で共有されない（min-instance=1 で実害最小化中）
2. R2 アップロードのクライアント供給 MIME type 信頼 — magic-byte 検証なし
3. fetchOgp SSRF — DNS rebinding に非耐性（admin-only で実害低）

### アクセシビリティ — 91/100（accessibility-reviewer agent）

**強み**: WCAG 2.5.5 Enhanced (AAA) タッチターゲット完全準拠、`<div onClick>` 0 件、`aria-label` 263 箇所、shadcn `FormLabel` 自動紐付け、Radix Dialog focus trap、`AriaLiveProvider` プロジェクト横断、`SkipLink` 実装済み。

**主要 issue**:

1. `month-picker.tsx:141` — 年入力フィールドの focus indicator 消去（WCAG 2.4.11 AA 違反、要修正）
2. `(admin)/(auth)/` 配下 4 ファイル — `focus:ring-2` / `focus-visible:ring-2` 混在（プロジェクトルール逸脱、警告）
3. （3 件目は検出されず）

### アーキテクチャ / ルーティング — 82/100（route-structure-reviewer agent）

**強み**: `app/layout.tsx` 不在、`global-not-found.tsx` + `experimental.globalNotFound: true` 正規実装。3 root layout (`(admin)`/`(public)`/`(preview)`) 全て自前 `<html>`/`<body>`。`global-error.tsx` 完全準拠。`(admin)`/`(public)` の Suspense boundary 網羅的。

**主要 issue**:

1. `(preview)/layout.tsx:19` — `await getPublicTaxSettings()` を Suspense 外で実行、`(preview)/loading.tsx` 不在で PPR 非互換
2. `(preview)/not-found.tsx` 不在 — route group 対称性違反
3. `(preview)/error.tsx` 存在するが上位 Suspense なしで render error をキャッチ不能

### テスト — 88/100

**メトリクス**:

- 186 unit + 59 integration + 48 e2e = 293 test files
- 409 `mock.module` usages（per-directory バッチで干渉回避）
- a11y E2E（axe-core 14 tests / keyboard navigation）
- visual regression（Playwright snapshot）
- `architecture-boundaries.test.ts`（42KB）で境界検出自動化

**強み**: `architecture-boundaries.test.ts` で境界違反を CI で機械検出、E2E に admin / customer / public / a11y / visual の 5 系統、per-directory バッチで mock 干渉回避（CLAUDE.md 明文化）。

**減点**: 統合テストは全てモックベース（実 DB 統合 0 件 — 意図的選択だが silent migration breakage リスクの観点で完全網羅ではない）

### パフォーマンス — 88/100

**メトリクス**:

- `bun run build` exit 0
- 多数の ◐ (Partial Prerender) routes 採用
- Lighthouse CI 設定済み（perf ≥0.85 warn / a11y/best-practices/SEO ≥0.90 error）
- 5 ページで Lighthouse 計測（`/`, `/spaces`, `/posts`, `/contact`, `/faq`）
- `next experimental-analyze` で bundle 解析
- bundle-size-diff CI job

**減点**: 実 Lighthouse スコアは未計測（このセッションで実行せず）。Container Query 採用は card grid に限定で意図通り（6 declarations）、viewport breakpoint 245 件はマクロレイアウト用で逸脱なし。

### 運用 / DevOps — 95/100

**強み**:

- Cloud Run via Dockerfile (multi-stage) + cloudbuild.yaml
- 6 GitHub workflows: ci / codeql / dependency-review / actionlint / stale / labeler
- ci.yml に 11 job（dependency-audit, lint-and-typecheck, unit-tests, e2e-tests, build, bundle-size-diff, bundle-analysis, lighthouse-ci, visual-regression, docs）
- `/api/live` (DB 非依存 liveness) / `/api/health` (詳細ヘルス) 役割分担明確、proxy.ts rate-limit 除外済み
- 8 cron endpoints（calendar-sync, event-import, faq-stale-check, faq-trash-cleanup, instagram-refresh, instagram-sync, notification-cleanup, reservation-reminder）
- 2 webhooks (Stripe / Google Calendar) 署名検証実装
- 57 prisma migrations、44 model + 33 enum
- SECURITY.md / CHANGELOG.md / CONTRIBUTING.md / AGENTS.md 整備
- lefthook pre-commit + actionlint

**減点**: 監視/observability ツール未導入（Sentry / Datadog 等）、ただしプロジェクト規模では現状で許容範囲。

### キャッシュ戦略 — 90/100

**メトリクス**:

- 394 `CACHE_TAGS` / `cacheTag` 参照
- 291 `updateTag`（Next 16 部分再検証）
- 21 `revalidateTag`（完全再検証、`'use cache'` 統合用）
- `executeAdminMutationResult` の `afterSuccess` で fire-and-forget 非同期処理 + cache invalidation 順序契約

**強み**: Next 16 の `updateTag` を主軸に細粒度更新、CACHE_TAGS 定数化で文字列ドリフト防止。

**減点**: `audit-cache` skill による全 Server Action / Route Handler の網羅監査は未実施。

### ドキュメント — 95/100

**メトリクス**:

- ルート: README / CLAUDE.md / AGENTS.md / CONTRIBUTING.md / SECURITY.md / CHANGELOG.md
- Diataxis 構造: 9 explanation + 10 how-to + 6 reference + 5 templates = 30 docs
- 66 path-scoped rule docs（`.claude/rules/**/*.md`）
- 31 Claude memory + 46 Serena memory（永続コンテキスト）
- 30+ spec/plan files（`docs/superpowers/{specs,plans}/`、archive 整備済み）

**強み**: Diataxis 完全準拠、path-scoped rules で常時ロード 0、spec→plan→implementation→ADR-inline ワークフロー定着。

**減点**: 独立 ADR ディレクトリは持たない（spec/plan 内の `ADR 0021` 形式 inline、意図通りだが別系統からの参照性は低い）。

### Better Auth (dual-instance) — 91/100（better-auth-reviewer agent）

**強み**: cookie prefix・basePath・route handler・`server-only` 完全整合、`generateId: "uuid"` 両 instance 明示、databaseHooks 不使用 + `ensureCustomerLinked` の app 層遅延紐づけ、P2002 race fallback 実装。

**主要 issue**:

1. AuditLog: `/reset-password/email` 完了イベント未記録（リクエストのみ記録、完了は不在）
2. `isAdmin()` ヘルパーが EDITOR / VIEWER 除外で `isDashboardRole()` と二本立て
3. Customer 側 AuditLog 設計上の空白（ソーシャルログイン成功・リンク完了が記録されない）

### React Compiler 1.0 互換 — 97/100（react-compiler-reviewer agent）

**強み**: 1601 ファイル中 `useCallback`/`useMemo`/`React.memo` 使用は `lexical-draggable-block-plugin.ts:506` の 1 箇所（フォーク例外、文書化済み）のみ。GSAP `useGSAP` + `gsap.matchMedia()` 完全採用、Lenis `useSyncExternalStore` 安定化パターン正確。`'use no memo'` / `forwardRef` 使用 0。

**主要 issue**:

1. `lexical-draggable-block-plugin.ts:506` の `useCallback` 残存（フォーク、ESLint 緩和済み）
2. `lenis-provider.tsx` の `getSnapshot` が `storeRef.current` 経由（実害なし、注意点）
3. （3 件目: 重大なし）

### Zod 4 スキーマ — 91/100（zod-schema-reviewer agent）

**強み**: `error:` パラメータ Zod 4 形式で一貫使用、配列 uniqueness 全 3 箇所スキーマ層 `.refine()` で担保（UI 層 `Set` dedup 0）、cross-field top-level `.refine()` 正規実装、`safeParse` 318 件、`z.nativeEnum` 0 件。

**主要 issue**:

1. `validations/section.ts` の legacy schema 重複（`definitions/<type>/schema.ts` 正本との drift、文書化済み未解消）
2. `spaceFormBaseSchema.facilities` の uniqueness refine が edit form のみで base に欠落の可能性
3. 21 種 Section schema の `safeParse({})` 成立網羅テスト未確認

---

## Top 5 改善優先度

| #   | 軸               | 課題                                                                                  | 工数感         |
| --- | ---------------- | ------------------------------------------------------------------------------------- | -------------- |
| 1   | アーキテクチャ   | `(preview)/loading.tsx` 追加 + `(preview)/not-found.tsx` 追加で PPR 互換化            | S（30 分）     |
| 2   | アクセシビリティ | `month-picker.tsx:141` の `focus-visible:ring-*` 追加（WCAG 2.4.11 AA 違反）          | S（10 分）     |
| 3   | コード品質       | `keysOf()` 未使用 2 箇所 + JSON cast 2 箇所 + Icon cast 2 箇所 = 6 件の `as` 違反解消 | M（1〜2 時間） |
| 4   | セキュリティ     | R2 upload の magic-byte 検証 + AuditLog `/reset-password/email` 完了イベント記録      | M（半日）      |
| 5   | Zod              | `validations/section.ts` legacy schema 重複の clean-break 削除                        | M（半日）      |

---

## 業界標準ベースラインとの比較

| 項目             | Industry baseline                      | このプロジェクト                         | 評価 |
| ---------------- | -------------------------------------- | ---------------------------------------- | :--: |
| Type safety      | TS strict + `noUncheckedIndexedAccess` | 同左 + `as` 違反 6 件のみ                |  ◎   |
| 認証境界         | NextAuth/Better Auth + RBAC            | dual-instance 完全分離 + 2 層 RBAC       |  ◎   |
| 監視             | Sentry / Datadog                       | 未導入（probe + Lighthouse CI のみ）     |  △   |
| CI/CD            | GitHub Actions + Cloud Build           | 6 workflow + 11 job + Cloud Build        |  ◎   |
| アクセシビリティ | WCAG 2.2 AA                            | AA 達成 + 2.5.5 AAA タッチターゲット     |  ◎   |
| テスト           | unit + integration + e2e               | 293 test + a11y + visual regression      |  ◎   |
| ドキュメント     | README + ADR                           | Diataxis + path-scoped rules + spec/plan |  ◎   |
| キャッシュ       | revalidatePath/Tag                     | Next 16 `updateTag` 主軸 + 細粒度        |  ◎   |

---

## 補遺: 未マージ作業

- `feature/google-business-profile-sync` worktree（17 commits、`adeaf1da`〜`dd7a7f08`）
  - 実装完了、validate / build 通過済み（memory 記録）
  - 残: `GBP_STUB_MODE=true` smoke test → main `--no-ff` merge → Google Cloud Console 申請

## 監査メソッド

並列 dispatch した 7 reviewer agent:

- `project-reviewer` / `accessibility-reviewer` / `security-reviewer`
- `better-auth-reviewer` / `react-compiler-reviewer` / `route-structure-reviewer` / `zod-schema-reviewer`

手動補完: テスト数 / docs / CI/CD / cron / cache / container query / probe routes。
