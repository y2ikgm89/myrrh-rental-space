---
name: create-admin-page
description: >
  管理画面の CRUD ページ一式を admin-ui-patterns.md 準拠でスキャフォールド生成する。
  新しいリソース（モデル）を管理画面に追加する際に使用。
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

### フォームパターン（標準と例外）

- **標準**: `useFormAction` + react-hook-form + `standardSchemaResolver`（`admin-ui-patterns.md`）
- **例外が必要なとき**（DnD・複数 `useFieldArray`・メディアピッカー等で `FormData` 経路が有利な場合）: `admin-ui-patterns.md` の「**useFormAction 非適用の例外**」を読み、参照実装として `SpaceEditForm` / `submitSpaceFormAction` / `@/admin/lib/space-form-data-codec` を踏襲する

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
