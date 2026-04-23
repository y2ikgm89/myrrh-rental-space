---
paths:
  - src/shared/lib/validations/**
  - src/**/lib/validations/**
  - src/**/actions/**/*.ts
  - src/shared/domain/**
---

# Zod パターンルール

> Zod 4.3.6対応

## 基本パターン

### エラーメッセージ（error: パラメータ）

**重要**: Zod 4では `message` パラメータは非推奨。`error` パラメータを使用:

```typescript
import { z } from "zod";

// NG: Zod 3スタイル（非推奨）
z.string().min(1, "タイトルは必須です");
z.string().min(1, { message: "タイトルは必須です" });

// OK: Zod 4スタイル
z.string().min(1, { error: "タイトルは必須です" });
z.string({ error: "フィールドは必須です" });
z.uuid({ error: "有効なUUIDを入力してください" });

// OK: 動的エラーメッセージ（コンテキスト依存）
z.string({
  error: (iss) =>
    iss.input === undefined ? "フィールドは必須です" : "入力が無効です",
});
```

### スキーマ定義

```typescript
import { z } from "zod";

// 必須フィールド
const titleSchema = z
  .string()
  .min(1, { error: "タイトルは必須です" })
  .max(200, { error: "タイトルは200文字以内です" });

// オプショナルフィールド
const descriptionSchema = z
  .string()
  .max(500, { error: "説明は500文字以内です" })
  .optional();

// nullable（DBのnullを許容）
const metaDescriptionSchema = z.string().max(160).nullable().optional();

// カスタムバリデーション（refine）
const lexicalJsonSchema = z.string().refine(
  (val) => {
    try {
      const parsed: unknown = JSON.parse(val);
      return typeof parsed === "object" && parsed !== null && "root" in parsed;
    } catch {
      return false;
    }
  },
  { error: "有効なLexical EditorState JSONではありません" },
);
```

### 複合スキーマ（実際のプロジェクト例）

```typescript
import { z } from "zod";
import { PostStatus, LayoutWidth } from "@/shared/generated/prisma/enums";
import { seoOgpFieldsSchema } from "@/shared/lib/validations/seo";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";

// Server Action用スキーマ（型厳格）
export const updatePostSchema = z
  .object({
    title: z
      .string()
      .min(1, { error: "タイトルは必須です" })
      .max(200, { error: "タイトルは200文字以内" }),
    slug: z
      .string()
      .min(1, { error: "スラッグは必須です" })
      .max(200)
      .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
    contentJson: lexicalJsonSchema,
    contentWidth: z.enum(LayoutWidth).nullable().optional(),
    tags: z.array(z.string().uuid({ error: "タグIDが不正です" })).default([]),
  })
  .extend(seoOgpFieldsSchema.shape); // SEO/OGPフィールドを合成

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

// フォーム用スキーマ（空文字許可・文字列型）
export const postFormSchema = z
  .object({
    title: z.string().min(1, { error: "タイトルは必須です" }),
    slug: z.string().min(1, { error: "スラッグは必須です" }),
    status: z.enum(PostStatus),
    contentJson: z.string().min(1, { error: "本文は必須です" }),
    tags: z.string().optional(), // フォーム: comma-separated string
    publishedAt: z.string().optional(), // フォーム: 文字列のまま
  })
  .extend(seoOgpFieldsFormSchema.shape);

export type PostFormData = z.infer<typeof postFormSchema>;
```

**Server Action用スキーマ vs フォーム用スキーマの使い分け**:

| 用途                       | 特徴                             | 例                 |
| -------------------------- | -------------------------------- | ------------------ |
| Server Action              | 型厳格（Date, number, UUID検証） | `updatePostSchema` |
| フォーム (React Hook Form) | 空文字許可・文字列型             | `postFormSchema`   |

### Server Actions での使用

```typescript
"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { checkPermission } from "@/admin/lib/action-auth";
import { createSuccess, createFailure } from "@/shared/lib/errors";
import type { ActionResult } from "@/shared/types/server-actions";

export async function updatePost(
  id: string,
  input: unknown,
): Promise<ActionResult<Post>> {
  // 1. 認証・権限チェック
  const auth = await checkPermission("post", "update");
  if (!auth.success) return auth.error;

  // 2. バリデーション（safeParse + flattenError）
  const validated = updatePostSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, error: z.flattenError(validated.error) };
  }

  // 3. データ操作
  const post = await prisma.post.update({
    where: { id },
    data: validated.data,
  });

  // 4. キャッシュ無効化
  updateTag(CACHE_TAGS.POSTS);

  return createSuccess(post);
}
```

**`z.flattenError` の出力形式**:

```typescript
{
  formErrors: string[],     // トップレベルエラー
  fieldErrors: {            // フィールド別エラー
    [field: string]: string[]
  }
}
```

## Prisma Enum バリデーション

### z.enum() で Prisma enum を使用（nativeEnum 禁止）

Zod 4 では `z.nativeEnum()` は非推奨。Prisma 7 の `@map` enum は TypeScript 側で `as const` オブジェクトとして生成されるため、`z.enum()` で直接受け付ける:

```typescript
import { z } from "zod";
import {
  DiscountType,
  TaxRateType,
  PostStatus,
} from "@/shared/generated/prisma/enums";

// NG: z.nativeEnum()（Zod 4 非推奨）
z.nativeEnum(DiscountType);

// NG: 文字列リテラル配列（Prisma enum と乖離するリスク）
z.enum(["none", "percentage", "fixed"]);

// OK: Prisma enum を z.enum() に渡す
z.enum(DiscountType);
z.enum(PostStatus);

// OK: Zodスキーマのフィールドで使用
discountType: z.enum(DiscountType).default(DiscountType.none);
status: z.enum(PostStatus);
taxRateType: z.enum(TaxRateType).default(TaxRateType.standard);
```

### デフォルト値もenum定数で

```typescript
// NG: 文字列リテラルのデフォルト（Prisma enum と乖離するリスク）
discountType: z.enum(DiscountType).default("none");

// OK: enum定数のデフォルト（型安全）
discountType: z.enum(DiscountType).default(DiscountType.none);
taxRateType: z.enum(TaxRateType).default(TaxRateType.standard);
```

## 配列要素の uniqueness 契約（React key 安全性）

配列要素を React key として使う可能性がある場合、Zod スキーマで重複を拒否する。UI 層の Set dedup は禁止（責務逸脱・データ契約が暗黙化）:

```typescript
// primitive string[] — .refine() で重複拒否
const imageUrlsSchema = z
  .array(z.string().url())
  .refine((arr) => new Set(arr).size === arr.length, {
    error: "同じ画像を複数登録することはできません",
  });

// useFieldArray の object[] — 同フィールドで dedupe
const buttonsSchema = z
  .array(z.object({ url: z.string(), text: z.string() }))
  .refine((arr) => new Set(arr.map((b) => b.url)).size === arr.length, {
    error: "同じURLのボタンを複数登録することはできません",
  });

// cross-field 重複（mainImage ↔ imageUrls）— top-level refine
export const spaceFormSchema = z
  .object({ mainImageUrl: z.string(), imageUrls: imageUrlsSchema /* ... */ })
  .refine((data) => !data.imageUrls.includes(data.mainImageUrl), {
    error: "メイン画像と同じURLを追加画像に登録することはできません",
    path: ["imageUrls"],
  });

// discriminated union — 合成キーで dedupe
const sidebarWidgetsSchema = z
  .array(z.union([builtinWidgetSchema, customWidgetSchema]))
  .refine((widgets) => {
    const keys = widgets.map((w) =>
      w.type === "custom" ? `custom:${w.id}` : `builtin:${w.type}`,
    );
    return new Set(keys).size === keys.length;
  });

// read-side 防御層（write-side 厳格化 + historical data 自己修復）
const stringArraySchema = z
  .array(z.string())
  .transform((arr) => Array.from(new Set(arr)));
```

**ルール:**

- write-side（フォーム送信 / Server Action 入力）は `.refine()` で厳格拒否
- read-side（DB JSON パーサー `parseStringArray` 等）は `.transform()` で silent dedupe（historical data の自己修復）
- 外部 API 応答（Instagram 等）は `.transform()` で防御的 dedupe（契約外事象への備え）

### 複雑な cross-field 検証は `.superRefine()` を parent level で

nested schema に `.refine()` を付けると ZodEffects 化して `.omit()` / `.extend()` が使えなくなる。`*Base` 版を作って parent に埋め込むと validation が完全に無効化される（**dead code パターン** — `gotchas.md` 参照）。

解決策: validation 本体を `collectXxxIssues(data, pathPrefix, ctx)` ヘルパーとして shared に抽出し、parent schema の `.superRefine()` から呼ぶ:

```typescript
// src/shared/lib/validations/business-hours.ts
export function collectBusinessHoursWeekIssues(
  week: BusinessHoursWeek,
  pathPrefix: readonly (string | number)[],
  ctx: z.RefinementCtx,
): void {
  for (const day of ["monday", "tuesday" /* ... */] as const) {
    const d = week[day];
    if (d.isOpen && d.slots.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "営業日には最低1つの時間帯を設定してください",
        path: [...pathPrefix, day, "slots"],
      });
    }
    // overlap / order チェックも同様
  }
}

// 呼び出し側: parent schema で .superRefine()
export const businessHoursSettingsSchema = z
  .object({ businessHours: businessHoursWeekSchema /* ... */ })
  .superRefine((data, ctx) => {
    collectBusinessHoursWeekIssues(data.businessHours, ["businessHours"], ctx);
  });
```

**利点:** nested schema は ZodObject のまま、検証ロジックは shared に集約、UI / Zod / 他モデル（location 等）で同一ロジックを再利用。

## 共通スキーマの再利用

### SEOフィールド（seoFieldsSchema / ogpFieldsSchema）

```typescript
// @/shared/lib/validations/seo.ts
export const SEO_LIMITS = {
  META_DESCRIPTION: 160,
  META_KEYWORDS: 500,
  OGP_TITLE: 70,
  OGP_DESCRIPTION: 200,
} as const;

// Server Action用（nullable）
export const seoFieldsSchema = z.object({
  metaDescription: z
    .string()
    .max(SEO_LIMITS.META_DESCRIPTION)
    .nullable()
    .optional(),
  metaKeywords: z.string().max(SEO_LIMITS.META_KEYWORDS).nullable().optional(),
});

export const ogpFieldsSchema = z.object({
  ogpTitle: z.string().max(SEO_LIMITS.OGP_TITLE).nullable().optional(),
  ogpDescription: z
    .string()
    .max(SEO_LIMITS.OGP_DESCRIPTION)
    .nullable()
    .optional(),
  ogpImageUrl: z.string().url().nullable().optional(),
});

// 統合スキーマ（spread で合成 — Zod 4 推奨、.merge() は deprecated）
export const seoOgpFieldsSchema = z.object({
  ...seoFieldsSchema.shape,
  ...ogpFieldsSchema.shape,
});

// フォーム用（空文字許可）
export const seoFieldsFormSchema = z.object({
  metaDescription: z.string().max(SEO_LIMITS.META_DESCRIPTION).optional(),
  metaKeywords: z.string().max(SEO_LIMITS.META_KEYWORDS).optional(),
});
export const seoOgpFieldsFormSchema = z.object({
  ...seoFieldsFormSchema.shape,
  ...ogpFieldsFormSchema.shape,
});
```

**スキーマ合成の使い分け**:

| 方法                                   | 用途                                    | 備考                          |
| -------------------------------------- | --------------------------------------- | ----------------------------- |
| `.extend(other.shape)`                 | 既存 ZodObject にフィールドを追加       | Zod 4 推奨（`.merge()` 廃止） |
| `z.object({ ...A.shape, ...B.shape })` | 複数スキーマのスプレッド合成            | tsc 効率最良                  |
| `.merge(other)`                        | **deprecated** — `.extend()` に移行する | Zod 4 changelog で非推奨明記  |

### URLバリデーション

```typescript
// 空文字列も許可するURL（フォーム用）
const optionalUrlSchema = z.string().url().optional().or(z.literal(""));

// nullable + 空文字も許可（DB nullable フィールドのフォーム用）
const imageUrlSchema = z
  .string()
  .url()
  .nullable()
  .optional()
  .or(z.literal(""))
  .or(z.literal(null));

// 安全なURL（相対パスも許可）
const safeUrlSchema = z
  .string()
  .refine((val) => !val || val.startsWith("/") || val.startsWith("http"), {
    error: "URLは / または http で始まる必要があります",
  });
```

### useFieldArray との連携（object[] 必須）

RHF の `useFieldArray` は primitive 配列（`string[]`）を管理できない。フォームで配列フィールドを D&D ソートや動的追加/削除する場合は object 配列にすること:

```typescript
// NG: useFieldArray に渡せない（primitive 配列）
imageUrls: z.array(z.string().url());

// OK: { url: string }[] — useFieldArray が id フィールドを自動付与して管理
imageUrls: z.array(
  z.object({ url: z.string().url({ error: "有効なURLを入力してください" }) }),
);

// Server Action 側では .map((i) => i.url) で string[] に変換して Prisma へ渡す
// 編集時の初期値: DB string[] → フォーム { url: string }[]: location.imageUrls.map((url) => ({ url }))
```

### datetime-local input との連携（`.datetime({ local: true })`）

`<input type="datetime-local">` の value は `"YYYY-MM-DDTHH:mm"` 形式（タイムゾーン情報なし）。strict `.datetime()` はこの形式を reject するため、Zod 4 公式オプション `{ local: true }` を必ず指定する:

```typescript
// NG: form 送信値 "2024-06-15T10:00" が validation error → silent bug
startTime: z.string().datetime({ error: "..." });

// OK: full ISO（"...T...Z"）と datetime-local 形式の両方を許容
startTime: z.string().datetime({ local: true, error: "..." });
```

**空欄許容（nullable optional）**: datetime-local input は空時 `""` を返すため `.or(z.literal(""))` で許容、command 層で falsy 判定により null 化:

```typescript
registrationDeadline: z
  .string()
  .datetime({ local: true })
  .or(z.literal(""))
  .nullable()
  .optional();

// command 側
registrationDeadline: data.registrationDeadline
  ? new Date(data.registrationDeadline)
  : null,
```

**テストの落とし穴**: テストで full ISO `"2024-06-15T10:00:00Z"` を使うと `.datetime({ local: true })` の有無に関わらず通るため、サイレントに発生する。E2E で実 form 送信を確認するか、unit テストで明示的に `"2024-06-15T10:00"` 形式を含めること。

### URLパラメータバリデーション

```typescript
// @/shared/lib/validations/params.ts — 'use cache' 関数の入口検証
export const slugParamSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const idParamSchema = z.string().min(1).max(100);

// 使用例（'use cache' 関数内）
export async function getPublishedPost(slug: string) {
  "use cache";
  const validated = slugParamSchema.safeParse(slug);
  if (!validated.success) return null; // 不正な入力をDB到達前にブロック

  return prisma.post.findUnique({ where: { slug: validated.data } });
}
```

## Discriminated union + `.default()` による破壊的 schema 拡張（migration 不要）

既存の `z.enum([...])` 統一 schema を `z.literal(...)` + discriminated union に分割し、特定 type のみにフィールドを追加する場合、`.default()` が safeParse 時に欠落を補完するため、DB JSON カラムの既存データはそのまま互換を保てる（Prisma migration 不要）:

```ts
// Before: 全 type 共通の狭い schema
const builtinSchema = z.object({
  type: z.enum(["search", "recent", "popular"] as const),
  enabled: z.boolean(),
});

// After: recent/popular に固有フィールド追加（残りは simple schema へ分離）
const simpleSchema = z.object({
  type: z.enum(["search", "categories", "tags"] as const),
  enabled: z.boolean(),
});
const recentSchema = z.object({
  type: z.literal("recent"),
  enabled: z.boolean(),
  layout: z.enum(["compact", "stacked"]).default("compact"),
});
const popularSchema = z.object({
  type: z.literal("popular"),
  enabled: z.boolean(),
  layout: z.enum(["compact", "stacked"]).default("compact"),
  showRanking: z.boolean().default(true),
});
const schema = z.array(
  z.union([simpleSchema, recentSchema, popularSchema /* ... */]),
);
```

**利点**:

- 既存 JSON `{ type: "recent", enabled: true }` は safeParse で `layout: "compact"` が補完される
- UI 側は `switch (widget.type)` の narrow で `widget.layout` / `widget.showRanking` に**型アサーションなし**でアクセス可能
- DB migration / 一括データ書き換え不要で破壊的拡張を完遂できる

**注意**: `z.infer<typeof schema>` 型を inline で使うテストデータ（例: `__tests__/integration/actions/sidebar.test.ts`）は schema 拡張時に手動同期必要（→ `test-quality.md` §統合テストのインライン Zod スキーマは手動保守）

## 型ガードパターン

### Prisma Enum型ガード（enums.ts から import — ローカル定義禁止）

全Prisma enumの型ガードは `@/shared/lib/validations/enums.ts` に集約。ローカル定義禁止:

```typescript
import {
  isValidDiscountType,
  getValidDiscountType,
  isValidPostStatus,
  getValidPostStatus,
} from '@/shared/lib/validations/enums'

// isValid* — boolean判定（UIイベントハンドラ等）
onValueChange={(value) => {
  if (isValidDiscountType(value)) setDiscountType(value)
}}

// getValid* — デフォルト値付きパース（DB値・フォーム初期値のパースに最適）
const type = getValidDiscountType(rawValue)                        // デフォルト: DiscountType.none
const type = getValidDiscountType(rawValue, DiscountType.percentage)  // カスタムデフォルト
```

### ローカルEnum型ガード（Prisma enumが存在しない場合のみ）

Prisma enum に対応しない値のみローカル定義可:

```typescript
// OK: Prisma に対応するenumがない場合
const CONNECTION_METHODS = ["oauth", "manual"] as const;
type ConnectionMethod = (typeof CONNECTION_METHODS)[number];
const CONNECTION_METHOD_SET = new Set<string>(CONNECTION_METHODS);

function isConnectionMethod(value: string): value is ConnectionMethod {
  return CONNECTION_METHOD_SET.has(value);
}
```

### unknown からのパース

```typescript
// Zod safeParse 推奨（型安全）
const result = schema.safeParse(unknownValue);
if (result.success) {
  // result.data は型安全
}

// 型ガード関数（シンプルなケース）
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}
```

### safeParse 結果と exactOptionalPropertyTypes の橋渡し

`z.object({ field: z.string().optional() })` の出力は `{ field: string | undefined }`。
`readonly field?: string` 型（`exactOptionalPropertyTypes: true` 下）への代入には `omitUndefined` を使う:

```typescript
import { omitUndefined } from "@/shared/lib/serialize";

// NG: safeParse の result.data を直接返す（string | undefined が readonly field?: string と非互換）
return result.data; // 型エラー

// OK: omitUndefined で undefined プロパティを除去
return result.success ? omitUndefined(result.data) : undefined;
```

参照実装: `src/shared/lib/sections/field-registry.ts` の `z.registry<FieldMeta>()` 経由 metadata registration（Zod 4 公式パターン、ADR 0018）。

## React Hook Form 連携

```typescript
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

// フォーム用スキーマ（空文字許可・文字列型）を resolver に渡す
const form = useForm<PostFormData>({
  resolver: zodResolver(postFormSchema),
  defaultValues: {
    title: "",
    slug: "",
    status: PostStatus.draft,
    contentJson: "",
    metaDescription: "",
    ogpTitle: "",
    ogpDescription: "",
    ogpImageUrl: "",
  },
});

// フォーム送信時は Server Action 用スキーマで再バリデーション
const onSubmit = async (formData: PostFormData) => {
  const result = await updatePost(id, transformFormData(formData));
  // ...
};
```

**注意**: React Hook Form に渡すスキーマはフォーム用（空文字許可・文字列型）。
Server Action 側で改めてサーバー用スキーマで検証する二段構成。

## Zod 4 新機能

### z.fromJSONSchema()

既存の JSON Schema 定義を Zod スキーマに変換:

```typescript
import { z } from "zod";

// 外部ライブラリや OpenAPI spec の JSON Schema を Zod へ変換
const jsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    age: { type: "number", minimum: 0 },
  },
  required: ["name"],
};

const schema = z.fromJSONSchema(jsonSchema);
type Schema = z.infer<typeof schema>;
// => { name: string; age?: number }
```

**ユースケース**: 外部 API の JSON Schema 仕様から型安全なバリデーターを自動生成する場合。

## 禁止事項

1. **z.any() / z.unknown() の乱用禁止**
   - 具体的な型を定義する。`unknown` を受け取ってすぐ `safeParse` するのは正しいパターン

2. **型アサーションとの併用禁止**
   - `safeParse` の結果は `result.data` をそのまま使用。`as` でキャストしない

3. **バリデーションなしの Server Action 禁止**
   - 入力は必ず `safeParse` でバリデーション後に使用

4. **z.nativeEnum() 禁止（Zod 4 非推奨）**
   - `z.enum(PrismaEnum)` を使用

5. **Zodデフォルト値での文字列リテラル禁止（Prisma enum存在時）**
   - `z.enum(DiscountType).default('none')` → `.default(DiscountType.none)`

6. **ローカルファイルへの Prisma enum 型ガード定義禁止**
   - `isValid*` / `getValid*` は `@/shared/lib/validations/enums.ts` から import

7. **message: パラメータ禁止（Zod 4）**
   - `{ message: 'エラー' }` → `{ error: 'エラー' }`

## ファイル配置

| パス                                  | 内容                                                       |
| ------------------------------------- | ---------------------------------------------------------- |
| `@/shared/lib/validations/enums.ts`   | Prisma enum型ガード（`isValid*` / `getValid*`）、re-export |
| `@/shared/lib/validations/seo.ts`     | SEO/OGP 共通スキーマ（Server Action用 + フォーム用）       |
| `@/shared/lib/validations/section.ts` | セクション設定スキーマ                                     |
| `@/shared/lib/validations/lexical.ts` | Lexical EditorState JSON バリデーション                    |
| `@/shared/lib/validations/params.ts`  | URL パラメータバリデーション（slugParamSchema等）          |
| `@/shared/lib/validations/`           | その他共有スキーマ                                         |
| `@/admin/lib/validations/`            | 管理画面専用スキーマ                                       |
| `@/public/lib/validations/`           | 公開ページ専用スキーマ                                     |
