---
name: create-admin-page
description: >
  管理画面の CRUD ページ一式を admin-ui-patterns.md 準拠でスキャフォールド生成する。
  新しいリソース（モデル）を管理画面に追加する際に使用。
when_to_use: 新規モデルに対応する管理画面 CRUD ページ（一覧・編集・新規作成）を一括生成するとき。
argument-hint: <resource-name-camelCase>
---

# 管理画面 CRUD スキャフォールド

管理画面に新しいリソースを追加するための標準テンプレート集。`admin-ui-patterns.md` / `nuqs-patterns.md` / `error-handling.md` に完全準拠する。

**Post / News のような Lexical インラインエディタ + `UnifiedSidePanel` の新規コンテンツ種別**は本スキルの CRUD テンプレートではなく、`.claude/rules/frontend/admin-inline-editor-patterns.md` と既存の `content-types/post.tsx` / `news.tsx` を複製・改変して追加する。

## リファレンス（必要に応じて読み込む）

- [ページテンプレート](reference/page-templates.md) — 一覧 / 詳細 / 編集 / 新規作成の 4 ページ
- [コンポーネントテンプレート](reference/component-templates.md) — Table / Filters / ActionCell
- [Server Actions テンプレート](reference/server-actions-template.md) — `_shared/actions/<resources>.ts`
- [nuqs パーサー設定](reference/nuqs-setup.md) — searchParams パーサーマップ

## 実行前の確認事項

以下を確認する（不明な場合は AskUserQuestion で確認）:

1. **リソース名**: 英語 camelCase（例: `coupon`, `spaceCategory`）
2. **Prisma モデル名**: 同名または異なる場合（例: `Coupon`）
3. **主要フィールド**: 一覧表示に使うカラム（name, title, status 等）
4. **権限設定**: `executeAdminMutationResult` の resource 名（通常リソース名と同じ）
5. **既存 Server Action**: `_shared/actions/` に既存ファイルがあるか確認
6. **ルートパス**: `/admin/<resources>` のパス（複数形が一般的）

### フォームパターン (conform canonical)

- **標準** (Phase 1 Task 4-6 で確立): React 19 `useActionState` + conform `useForm` (`@conform-to/react`) + `parseWithZod` (`@conform-to/zod/v4`)。Server Action は `(prev, formData) => SubmissionResult` signature、`executeConformMutation` SSoT helper 経由で `executeAdminMutationResult` を呼ぶ
- **`useFormAction` (RHF) は legacy** — 新規 admin form では使用禁止。Phase 1 Task 8 で `react-hook-form` / `@hookform/resolvers` を `package.json` から削除予定。既存 RHF 残存 form の編集時は同じ commit 内で conform に置換
- **複雑 form** (Phase 1 Task 7 移行中): DnD・`useFieldArray`・MediaPicker・Lexical 統合は conform `form.insert/remove/reorder` + useInputControl bridge + hidden input pattern に統一予定。現在の移行中参照: `SpaceEditForm` (RHF + `useActionState` + `FormData` hybrid、Task 7 で conform に置換予定)
- **参照実装** (PR #61-#62、admin form 16 件 migration 済):
  - **simple** (settings sections): `MaintenanceSection` / `CookieConsentSection` / `NotificationSection` / `HeaderSection` / `PermalinkSection` / `ReservationSection` / `EmailSection` / `FooterSection` / `TaxSection`
  - **medium**: `CustomerForm` (create) / `CustomerEditForm` (edit + email blur + bind) / `CouponForm` (create/edit 統合 + conditional UI) / `PageSeoForm` + `ListPageSeoForm` (MediaPicker bridge) / `UserForm` (schema mode 切替) / `InviteForm` (derived success state + delayed redirect)

## 生成ファイル構成

```
src/app/(admin)/admin/(dashboard)/<resources>/
├── page.tsx                          # 一覧（Server Component）
├── new/page.tsx                      # 新規作成（Server Component）
├── [id]/
│   ├── page.tsx                      # 詳細（Server Component）
│   ├── edit/page.tsx                 # 編集（Server Component）
│   └── _components/
│       ├── <Resource>Form.tsx        # 新規・編集共用フォーム
│       ├── <Resource>Detail.tsx      # 詳細表示
│       └── <Resource>ActionCell.tsx  # テーブル操作列
└── _components/
    ├── <Resource>Table.tsx           # テーブル
    └── <Resource>Filters.tsx         # 検索・フィルター
```

## 実装手順

1. **Prisma スキーマ確認**: `prisma/schema.prisma` でモデル定義を確認
2. **nuqs パーサー追加**: `@/shared/lib/nuqs/parsers.ts` に追加（→ [nuqs-setup.md](reference/nuqs-setup.md)）
3. **Server Actions 作成**: `create-server-action` スキル or [server-actions-template.md](reference/server-actions-template.md)
4. **CACHE_TAGS 追加**: `@/shared/lib/constants.ts` に新タグ定数を追加
5. **ページ生成**: [page-templates.md](reference/page-templates.md) の 4 ページを生成
6. **コンポーネント生成**: [component-templates.md](reference/component-templates.md) の 3 コンポーネントを生成
7. **検証**: `bun run validate && bun run build`

## 禁止事項（`admin-ui-patterns.md` 準拠）

- 削除ボタンをページ最下部カードに配置（`DetailDeleteButton` をヘッダー `actions` に配置）
- 管理画面ページでの `connection()` 使用（公開ページ専用）
- `backLabel` に「<Resource>一覧に戻る」のような具体名（「一覧に戻る」のみ）
- テーブル操作列の Button+Link 直書き（`ActionDropdown` の `*ActionCell` を使用）
- `DetailDeleteButton.onDelete` にクロージャ（`.bind(null, id)` を使用）
- バックナビゲーションに `ChevronLeft` 使用禁止（`AdminDetailLayout` が `ArrowLeft` を自動提供、手動実装も `ArrowLeft` のみ）
