# Plans Index

> **このファイルは Status × Domain の軽量索引です。** 詳細な進行状況・計画内容は [`README.md`](./README.md) を参照してください。新規プラン作成手順は [`CLAUDE.md`](./CLAUDE.md)。

**ファイル数**: `docs/plans/*.md` 166件 + `docs/superpowers/plans/*.md` 41件 = **207件**

---

## ステータス凡例

- ✅ **Completed** — `README.md` の「完了した計画」セクションに掲載済み
- 🚧 **Active** — 進行中・実装中（`README.md` 上部「進行中の計画」セクション）
- 📐 **Design** — `*-design.md` サフィックス付きの設計文書（実装未着手 or 並行）
- 📊 **Audit** — 監査・スコアリング系（コードの変更を伴わない）

---

## 直近のアクティブ・進行中

`README.md` 上部に詳細あり。短縮表示:

| 日付       | プラン                                                                 | 状態         |
| ---------- | ---------------------------------------------------------------------- | ------------ |
| 2026-04-15 | [test-drift-remediation](./2026-04-15-test-drift-remediation.md)       | ✅ Completed |
| 2026-04-14 | [clean-restructure](./2026-04-14-clean-restructure.md)                 | ✅ Completed |
| 2026-04-14 | [faq-admin-overhaul](./2026-04-14-faq-admin-overhaul.md)               | ✅ Completed |
| 2026-04-13 | [review-reply](./2026-04-13-review-reply.md)                           | ✅ Completed |
| 2026-04-13 | [space-description-lexical](./2026-04-13-space-description-lexical.md) | ✅ Completed |
| 2026-04-13 | [reviews-space-integration](./2026-04-13-reviews-space-integration.md) | ✅ Completed |

---

## ドメイン別カテゴリ（主要計画のみ）

### 認証・権限・セキュリティ

- `2026-03-26-customer-social-auth*` — Google/LINE ソーシャルログイン
- `2026-03-26-customer-mypage*` — マイページ実装
- `2026-03-22-better-auth-rbac.md` — RBAC 実装
- `2026-03-19-instagram-state-csrf.md` — OAuth state 検証
- `2026-03-15-admin-login-gate*` — Admin Gate (HMAC token)
- `2026-04-08-account-deletion.md` — アカウント削除フロー

### 予約・決済フロー

- `2026-03-23-reservation-ui*` — 予約ページ UI 改善
- `2026-03-25-reservation-status-expansion.md` — ステータス追加
- `2026-03-27-quality-sprint.md` — Stripe決済 + CSV エクスポート
- `2026-04-08-public-admin-integration-fixes.md` — 予約キャッシュ・クーポン
- `2026-04-11-payment-finalization.md` — 決済統合確定

### イベント・カレンダー

- `2026-04-01-event-calendar-phase1.md` — Event/EventRegistration モデル
- `2026-04-02-event-calendar-phase2*` — FullCalendar UI
- `2026-04-03-event-calendar-phase3*` — Google Calendar 取り込み
- `2026-04-08-events-calendar-redesign.md` — 自作カレンダー移行

### コンテンツ・エディタ

- `2026-02-28-lexical-optimization-design.md` — Lexical 設計
- `2026-03-08-lexical-content-redesign.md` — Lexical Primary パターン
- `2026-04-13-space-description-lexical.md` — Space に Lexical 統合
- `2026-04-14-faq-admin-overhaul.md` — FAQ 管理画面
- `2026-04-11-page-editor-{redesign,v2,v3}*` — ページエディタ進化

### 公開ページ・デザイン

- `2026-03-17-public-page-redesign*` — Page-First Architecture
- `2026-03-18-public-pages-migration*` — 12+ ページ移行
- `2026-04-02-major-ui-redesign.md` — Editorial Magazine 統一
- `2026-04-02-anti-ai-design-refresh.md` — anti-AI ガイド適用
- `2026-04-07-spaces-carousel-redesign.md` — Center Stage Carousel

### アーキテクチャ・品質

- `2026-04-15-test-drift-remediation.md` — Prisma re-export gateway 138 ファイル一括
- `2026-04-14-clean-restructure.md` — domain commands + Lexical UI 分割
- `2026-03-10-comprehensive-cleanup*` — ActionResult→MutationResult 統一
- `2026-03-05-code-quality-improvements.md` — Prisma select 最適化
- `004-type-safety-improvement.md` — `as` 禁止確立（連番形式の初期計画）

### 監査・スコアリング

- `2026-03-21-codebase-consistency-audit.md` — 包括的境界監査
- `2026-04-11-project-scorecard-improvements.md` — スコア改善
- `2026-03-31-test-coverage-expansion.md` — テスト拡充

---

## 連番形式（001〜069、初期完了プラン）

> 連番形式の新規追加は禁止（[`CLAUDE.md`](./CLAUDE.md)）。日付形式 `YYYY-MM-DD-*.md` を使用すること。

主要連番プラン:

- `001-architecture-improvements.md` — 初期アーキテクチャ
- `002-stripe-payment-settings.md` — Stripe 初期実装
- `004-type-safety-improvement.md` — `as` 禁止
- `005-settings-tabs.md` — 設定タブ構造
- `008-api-keys-management.md` — API キー管理
- `030-blog-redesign.md` — ブログ初期実装
- `069-comprehensive-issue-fixes.md` — 一括バグ修正

---

## 検索のヒント

| 探したいもの              | 推奨コマンド                                                     |
| ------------------------- | ---------------------------------------------------------------- |
| 進行中のプラン            | `head -60 docs/plans/README.md`                                  |
| 特定ドメイン (例: events) | `ls docs/plans/*event*.md docs/plans/2026*event*.md`             |
| 直近の変更                | `ls -t docs/plans/*.md \| head -10`                              |
| ステータス検索            | `grep -l "ステータス.*\(実装中\|設計承認済み\)" docs/plans/*.md` |
| 設計文書のみ              | `ls docs/plans/*-design.md`                                      |
| superpowers プラン        | `ls docs/superpowers/plans/*.md`                                 |

## 関連ファイル

- [`README.md`](./README.md) — 詳細進行状況・完了プラン履歴・品質スコア
- [`CLAUDE.md`](./CLAUDE.md) — プラン作成・実行ワークフロー
- [`docs/superpowers/plans/`](../superpowers/plans/) — `writing-plans` スキル生成の詳細プラン (41 件)
- [`docs/superpowers/specs/`](../superpowers/specs/) — `brainstorming` スキル生成の要件・設計
