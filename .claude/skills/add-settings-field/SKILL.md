---
name: add-settings-field
description: >
  Settings シングルトンにフィールドを追加する 4 箇所更新パターンをスキャフォールドする。
  schema.prisma → types.ts → queries.ts/commands.ts → schemas.ts/actions。
  管理画面に新しい設定グループを追加する際に使用。
when_to_use: 管理画面の Settings シングルトンに新しい設定グループ・フィールドを追加するとき。
argument-hint: <sectionName> <field1:type field2:type ...>
---

# Settings フィールド追加スキャフォールダー

Settings シングルトンに新しいフィールドグループを追加する 4 箇所更新を案内・実行する。

## 引数

```
/add-settings-field <sectionName> <field1:type field2:type ...>
```

- `sectionName`: セクション名（camelCase, 例: `footer`, `seo`, `header`）
- `field:type`: フィールド定義（例: `tagline:string?`, `showLinks:boolean`, `label:string`）

型サフィックス: `string` / `string?` / `boolean` / `number` / `number?`
（→ `reference/schema-samples.md` §型マッピング）

引数が不足している場合はユーザーに確認する。

## Step 1: フィールド定義の解析

| 変数             | 例（`footer`）                                                                   |
| ---------------- | -------------------------------------------------------------------------------- |
| `sectionName`    | `footer`                                                                         |
| `SectionPascal`  | `Footer`                                                                         |
| `SECTION_UPPER`  | `FOOTER`                                                                         |
| フィールドリスト | `[{ name: "tagline", prismaType: "String?", zodType: "z.string().nullable()" }]` |

## Step 2: 更新対象ファイルの確認

```bash
ls 'prisma/schema.prisma' \
   'src/shared/domain/settings/types.ts' \
   'src/shared/domain/settings/queries.ts' \
   'src/shared/domain/settings/commands.ts' \
   'src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas.ts' \
   'src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts' \
   'src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts'
```

## Step 3: 4 箇所の更新

各箇所のコードサンプルは `reference/schema-samples.md` を参照。

1. **`prisma/schema.prisma`** — Settings モデルの `createdAt` 直前にフィールド追加（マイグレーションは別途 `/prisma-migration`）
2. **`src/shared/domain/settings/types.ts`** — `SettingsData` 型の `createdAt` 直前に型フィールドを追加
3. **`src/shared/domain/settings/queries.ts`** — `get<SectionPascal>Settings()` クエリを追加（`"use cache"` + `cacheLife` + `cacheTag` 必須）
4. **`src/shared/domain/settings/commands.ts`** + **`actions/settings/schemas.ts`** + **`actions/settings/other.ts`** — コマンド + Zod スキーマ + Server Action を追加し `index.ts` に export

## Step 4: 管理画面 UI（案内のみ）

以下のファイルを手動で作成する必要がある:

- `settings/_components/sections/<SectionPascal>Section.tsx` — `"use client"` フォームコンポーネント
- `settings/site/page.tsx` — タブに `<SectionPascal>Section` を追加

テンプレート: 最新の `FooterSection.tsx` または `HeaderSection.tsx` を参照。

## Step 5: 生成後チェックリスト

- [ ] `bunx --bun prisma migrate dev --name add_<section>_settings` でマイグレーション実行
- [ ] `bun run db:generate` で Prisma クライアント再生成
- [ ] `<SectionPascal>Section.tsx` UI コンポーネント作成
- [ ] `settings/site/page.tsx` のタブに追加
- [ ] `bun run type-check` で型エラーなし確認
- [ ] `bun run validate` で lint エラーなし確認

## 注意事項

- **Settings はシングルトン** — `id: "singleton"` 固定。`create` / `delete` 不要、`upsert` で `update` のみ
- **`invalidateLayoutCache()`** — `updateTag(CACHE_TAGS.SETTINGS)` + `updateTag(CACHE_TAGS.LAYOUT_SETTINGS)` の両方を無効化
- **即時反映が必要な設定**（メンテナンスモード等）— `CACHE_LIFE.DYNAMIC_DATA` を使用（通常は `CACHE_LIFE.STATIC_SETTINGS`）
- **Zod 4 の `{ error: }` パラメータ** — `{ message: }` は非推奨
- **テーマカラー等の viewport 関連** — `layout.tsx` の `generateViewport()` で使用する場合は `"use cache"` 付きクエリ経由

## 参考ファイル

- `reference/schema-samples.md` — 型マッピング・queries.ts / commands.ts / schemas.ts の完全サンプル
