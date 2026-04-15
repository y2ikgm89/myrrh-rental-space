# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

エントリは [Conventional Commits](https://www.conventionalcommits.org/) から自動生成・手動補完します：

- `feat:` → Added
- `fix:` → Fixed
- `refactor:` / `perf:` → Changed
- `docs:` / `test:` / `chore:` / `ci:` / `style:` → （通常は記載しない、大きな変更のみ）
- `BREAKING CHANGE` / `!:` → **Changed (BREAKING)**

## [Unreleased]

### Added

- `@axe-core/playwright` 統合で WCAG 2.1 AA 自動スキャン（14 tests across 8 public + 6 admin pages）
- Lighthouse CI 統合（perf/a11y/SEO/best-practices 閾値 + `.lighthouseci/budget.json` granular budget）
- Playwright 認証 storage state パターン（setup-customer / setup-admin project + `e2e/authenticated/{customer,admin}/` 構造）
- `e2e/helpers/wait-for-animation.ts` — GSAP / Lenis 完了待機ヘルパー
- `e2e/fixtures/factories.ts` — 型安全 test data factory（`reservationFactory`, `customerFactory`, `inquiryFactory`, `spaceFactory` + unique email/phone/slug generators）
- `e2e/visual/public-pages.spec.ts` — Playwright `toHaveScreenshot` visual regression（opt-in via `PLAYWRIGHT_VISUAL=1`）
- `.github/workflows/codeql.yml` — GitHub Advanced Security `security-extended` query set
- `.github/workflows/actionlint.yml` — GitHub Actions workflow YAML lint
- `.github/workflows/ci.yml` 新規 jobs: `dependency-audit`, `lighthouse-ci`, `visual-regression`, `bundle-analysis`, `bundle-size-diff`
- `.github/CODEOWNERS` — 重要パスへの PR レビュアー自動アサイン
- `.github/pull_request_template.md` — 変更種別・test checklist・CLAUDE.md 準拠確認
- `.github/ISSUE_TEMPLATE/{config,bug_report,feature_request}.yml` — GitHub Issue Forms
- `SECURITY.md` — 脆弱性報告 policy + 対応 SLA
- `CONTRIBUTING.md` — 開発環境セットアップ + ブランチ戦略 + コミット規約
- `CHANGELOG.md` — Keep a Changelog 1.1.0 形式
- `docs/architecture/decisions/` — MADR 4.0 形式 ADR（4 件の重要判断を記録）
- `docs/plans/INDEX.md` — 166 plan ファイルの軽量索引
- `lefthook.yml` — pre-commit（eslint-fix, prettier-fix, protected-files）+ pre-push（type-check, architecture-boundaries）+ commit-msg（Conventional Commits gate）
- `.editorconfig` — エディタ間の UTF-8 / LF / 2-space 統一
- `.vscode/{extensions,settings}.json` — 推奨拡張機能 + workspace 設定
- `CI lint-and-typecheck` job に `format:check` step 追加
- `e2e/a11y/axe-public-pages.spec.ts` (8 tests) — 公開ページ a11y スキャン
- `e2e/authenticated/admin/axe-admin-pages.spec.ts` (6 tests) — 管理画面 a11y スキャン
- `e2e/authenticated/customer/*` 新規 spec 6 件（mypage/reservations/profile/reviews/inquiries/reservation-flow/stripe-payment）
- `e2e/authenticated/admin/*` 新規 spec 3 件（lexical-editor/lexical-editor-formats/notifications）
- `e2e/public/*` 新規 spec 6 件（mypage/customer-auth/events/reviews/error-pages/cookie-consent/instagram-feed/stripe-payment）

### Changed

- **BREAKING**: `@next/bundle-analyzer` を削除し、Next.js 16 公式の Turbopack-native `next experimental-analyze --output` に移行（ADR-0004）
- **BREAKING**: `@generated/prisma/client` からの `Prisma` 値 re-export を gateway から削除、`@generated/prisma/browser` からの **型のみ** re-export に切替（ADR-0002、参照同一性 footgun 物理排除）
- **BREAKING**: Playwright を単一 `chromium` project から **6 project 構成** (setup-customer / setup-admin / chromium / chromium-customer / chromium-admin / chromium-visual) に再編（ADR-0003）
- **BREAKING**: E2E 認証済みテストを `e2e/authenticated/{customer,admin}/` 配下に再構成（既存 `e2e/admin/lexical-editor.spec.ts` と `e2e/authenticated/mypage.spec.ts` を移動）
- **BREAKING**: `.github/dependabot.yml` を削除、`.github/renovate.json5` （14 package grouping rules + auto-merge patch + vulnerabilityAlerts + pinDigests）に置換
- Prettier で 565 ファイル一括整形（whitespace/quote のみ、ロジック変更なし）
- `CLAUDE.md` プロセスルール更新（context7 確認対象に Prisma/Zod 追加、レビューエージェント既知誤報追加、Prisma sentinel identity 罠を gotchas.md に追加）
- `README.md` 全面書き直し（technical stack table 最新化、CI 12 jobs 表、ハードルール抜粋、ドキュメントリンク）
- `shared/types/global.d.ts` から `PrismaClient` type import を削除、`shared/db/prisma.ts` 内に `declare global` で統合
- `CI e2e-tests` job に Playwright browsers cache 追加（~130MB のダウンロード短縮）

### Fixed

- **Critical**: Client Component の Turbopack build failure — `ContactInfoSection.tsx` / `FaqItemTable.tsx` などが `enums/prisma-types.ts` gateway 経由で `node:module` を間接 import していた問題を ADR-0002 の切替で恒久解消
- `src/shared/lib/validations/event.ts:37` の Zod 4 `.refine()` を `{ message }` から `{ error }` に移行（Zod 4 公式仕様）
- `architecture-boundaries.test.ts` に 3 新規 assertion 追加（gateway no-client-import / Prisma value re-export 禁止 / `new PrismaClient()` は shared/db/prisma.ts のみ許可）
- `e2e/admin/lexical-editor.spec.ts` の未使用 `urls` import 削除
- pricing test 3 ファイル（`discount.test.ts` / `tax.test.ts` / `reservation.test.ts`）の重複 `mock.module("@generated/prisma/enums", ...)` コピペバグ修正
- `calendar-sync/route.ts` に「architecture-boundaries の唯一の例外」JSDoc を追加して意図を明文化

### Security

- CodeQL `security-extended` query set で OWASP Top 10 を含む拡張 rule の PR + 週次 full scan
- `bun audit` CI job で transitive deps の脆弱性を継続監視（artifact 保存）
- Renovate `pinDigests: true` で GitHub Actions の supply chain 攻撃防御
- Renovate `minimumReleaseAge: "7 days"` で DB / Stripe SDK の新リリース安定化期間
- Renovate `vulnerabilityAlerts` 即時 PR（schedule 無視）
- `.gitignore` に `playwright/.auth/` 追加（認証 token 漏洩防止）

---

## リリース運用

このプロジェクトは **continuous deployment** を採用しており、現時点では semantic versioning によるタグリリースを行っていません。`main` ブランチへのマージが本番環境への反映、`develop` ブランチが staging 反映のトリガーです。

`[Unreleased]` セクションに変更を集約し、運用方針が変わった場合にのみバージョンタグ（`v1.0.0` 等）を切ります。

## リンク

- [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [`docs/architecture/decisions/`](./docs/architecture/decisions/) — ADR インデックス
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — コミット規約詳細
