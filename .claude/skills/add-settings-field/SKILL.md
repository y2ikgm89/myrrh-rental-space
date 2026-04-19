---
name: add-settings-field
description: >
  Settings シングルトンにフィールドを追加する 4 箇所更新パターンをスキャフォールドする。
  schema.prisma → types.ts → queries.ts/commands.ts → schemas.ts/actions。
  管理画面に新しい設定グループを追加する際に使用。
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

型サフィックス:

- `string` → `String @default("")` / `z.string().min(1)`
- `string?` → `String?` / `z.string().nullable()`
- `boolean` → `Boolean @default(false)` / `z.boolean()`
- `number` → `Int @default(0)` / `z.number().int()`
- `number?` → `Int?` / `z.number().int().nullable()`

引数が不足している場合はユーザーに確認する。

## Step 1: フィールド定義の解析

引数をパースして以下の情報を生成する:

| 変数             | 例（`footer`）                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `sectionName`    | `footer`                                                                                                                  |
| `SectionPascal`  | `Footer`                                                                                                                  |
| `SECTION_UPPER`  | `FOOTER`                                                                                                                  |
| フィールドリスト | `[{ name: "tagline", prismaType: "String?", zodType: "z.string().nullable()", tsType: "string \| null", default: null }]` |

## Step 2: 更新対象ファイルの確認

4 箇所すべてが存在することを確認する:

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

### 3-1. `prisma/schema.prisma` — Settings モデルにフィールド追加

既存フィールドの末尾（`createdAt` の直前）に追加する:

```prisma
  // <SectionPascal> Settings (<日本語ラベル>)
  <sectionName><FieldPascal>  <PrismaType>  @default(<defaultValue>)
```

**注意**: マイグレーションは別途 `/prisma-migration` で実行する。

### 3-2. `src/shared/domain/settings/types.ts` — SettingsData に型追加

`SettingsData` 型の `createdAt` の直前に追加:

```typescript
  <sectionName><FieldPascal>: <tsType>;
```

### 3-3. `src/shared/domain/settings/queries.ts` — 取得クエリ追加

既存の `get*Settings` 関数の後に新しいクエリを追加する:

```typescript
export interface <SectionPascal>Settings {
  <field1>: <tsType>;
  <field2>: <tsType>;
}

export async function get<SectionPascal>Settings(): Promise<<SectionPascal>Settings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(getCacheTag(CACHE_TAGS.SETTINGS));

  return safeFetch(
    async () => {
      const settings = await prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          <field1>: true,
          <field2>: true,
        },
      });
      return {
        <field1>: settings?.<field1> ?? <defaultValue>,
        <field2>: settings?.<field2> ?? <defaultValue>,
      };
    },
    {
      <field1>: <defaultValue>,
      <field2>: <defaultValue>,
    },
    {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "get<SectionPascal>Settings" },
    },
  );
}
```

**注意**: 即時反映が必要な設定（メンテナンスモード等）は `CACHE_LIFE.DYNAMIC_DATA` を使用する。

### 3-4-a. `src/shared/domain/settings/commands.ts` — 更新コマンド追加

```typescript
export type <SectionPascal>SettingsInput = {
  <field1>: <tsType>;
  <field2>: <tsType>;
};

export async function update<SectionPascal>Settings(
  data: <SectionPascal>SettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}
```

### 3-4-b. `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas.ts` — Zod スキーマ追加

```typescript
export const <sectionName>SettingsSchema = z.object({
  <field1>: <zodType>,
  <field2>: <zodType>,
});
export type <SectionPascal>SettingsInput = z.infer<typeof <sectionName>SettingsSchema>;
```

### 3-4-c. `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts` — Server Action 追加

```typescript
export async function update<SectionPascal>Settings(
  input: <SectionPascal>SettingsInput,
): Promise<MutationResult<null>> {
  const parsed = <sectionName>SettingsSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => update<SectionPascal>SettingsCommand(parsed.data),
    afterSuccess: () => {
      invalidateLayoutCache();
    },
  });
}
```

### 3-4-d. `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts` — export 追加

schemas の type export と other の action export を追加する。

## Step 4: 管理画面 UI（案内のみ）

以下のファイルを手動で作成する必要がある旨を案内する:

- `settings/_components/sections/<SectionPascal>Section.tsx` — `"use client"` フォームコンポーネント
- `settings/site/page.tsx` — タブに `<SectionPascal>Section` を追加

テンプレートとして最新の `FooterSection.tsx` または `HeaderSection.tsx` を参照する。

## Step 5: 生成後チェックリスト

```
## チェックリスト

- [ ] `bunx --bun prisma migrate dev --name add_<section>_settings` でマイグレーション実行
- [ ] `bun run db:generate` で Prisma クライアント再生成
- [ ] `<SectionPascal>Section.tsx` UI コンポーネント作成
- [ ] `settings/site/page.tsx` のタブに追加
- [ ] `bun run type-check` で型エラーなし確認
- [ ] `bun run validate` で lint エラーなし確認
```

## 注意事項

- **Settings はシングルトン** — `id: "singleton"` 固定。`create` / `delete` 不要、`upsert` で `update` のみ
- **`invalidateLayoutCache()`** — `updateTag(CACHE_TAGS.SETTINGS)` + `updateTag(CACHE_TAGS.LAYOUT_SETTINGS)` の両方を無効化
- **Zod 4 の `{ error: }` パラメータ** — `{ message: }` は非推奨
- **公開ページで使用する場合** — `queries.ts` のクエリに `"use cache"` + `cacheLife` + `cacheTag` 必須
- **テーマカラー等の viewport 関連** — `layout.tsx` の `generateViewport()` で使用する場合は `"use cache"` 付きクエリ経由
