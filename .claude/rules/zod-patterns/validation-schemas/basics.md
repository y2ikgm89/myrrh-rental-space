---
description: Zod 基本スキーマ + 複合スキーマ + スキーマ合成 (.extend / spread) + URL バリデーション + datetime-local 連携
paths:
  - src/shared/lib/validations/**
  - src/**/lib/validations/**
  - src/**/actions/**/*.ts
  - src/shared/domain/**
---

# Zod 基本スキーマ + 合成 + URL + datetime-local

> Zod 4.3 基礎: 基本フィールド / 複合スキーマ / `.extend()` 合成 / URL / datetime-local input 連携 + JST 変換規律。

## 基本スキーマ定義

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

## 複合スキーマ（プロジェクト例）

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
```

**Server Action 用スキーマ vs フォーム用スキーマの使い分け**:

| 用途                       | 特徴                              | 例                 |
| -------------------------- | --------------------------------- | ------------------ |
| Server Action              | 型厳格（Date, number, UUID 検証） | `updatePostSchema` |
| フォーム (React Hook Form) | 空文字許可・文字列型              | `postFormSchema`   |

## スキーマ合成

```typescript
// spread で合成（Zod 4 推奨）
export const seoOgpFieldsSchema = z.object({
  ...seoFieldsSchema.shape,
  ...ogpFieldsSchema.shape,
});

// extend でフィールド追加
const extendedSchema = baseSchema.extend(additionalFields.shape);
```

**スキーマ合成の使い分け**:

| 方法                                   | 用途                                    | 備考                          |
| -------------------------------------- | --------------------------------------- | ----------------------------- |
| `.extend(other.shape)`                 | 既存 ZodObject にフィールドを追加       | Zod 4 推奨（`.merge()` 廃止） |
| `z.object({ ...A.shape, ...B.shape })` | 複数スキーマのスプレッド合成            | tsc 効率最良                  |
| `.merge(other)`                        | **deprecated** — `.extend()` に移行する | Zod 4 changelog で非推奨明記  |

## URL バリデーション

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

## datetime-local input との連携（`.datetime({ local: true })`）

`<input type="datetime-local">` の value は `"YYYY-MM-DDTHH:mm"` 形式（タイムゾーン情報なし）。strict `.datetime()` はこの形式を reject するため、Zod 4 公式オプション `{ local: true }` を必ず指定する:

```typescript
// NG: form 送信値 "2024-06-15T10:00" が validation error → silent bug
startTime: z.string().datetime({ error: "..." });

// OK: full ISO（"...T...Z"）と datetime-local 形式の両方を許容
startTime: z.string().datetime({ local: true, error: "..." });
```

**空欄許容（nullable optional）**: datetime-local input は空時 `""` を返すため `.or(z.literal(""))` で許容、command 層で falsy 判定により null 化:

```typescript
registrationDeadline: z.string()
  .datetime({ local: true })
  .or(z.literal(""))
  .nullable()
  .optional();
```

**command 層での UTC 変換は `parseDateTimeLocalAsJst` 必須**: schema は文字列を通すだけ、Date 化はドメインコマンド側で行う。`new Date(data.startTime)` は **サーバ tz (Cloud Run UTC) 解釈** で 9 時間ずれる silent bug を起こすため禁止:

```typescript
// NG: サーバ tz 依存（Cloud Run UTC で 12:00 を解釈 → JST 21:00 で保存される）
startTime: new Date(data.startTime),

// OK: `parseDateTimeLocalAsJst` で JST 固定 parse → UTC Date 化
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
startTime: parseDateTimeLocalAsJst(data.startTime),
validUntil: data.validUntil && data.validUntil !== ""
  ? parseDateTimeLocalAsJst(data.validUntil)
  : null,
```

`parseDateTimeLocalAsJst` は full ISO（`Z` / `±HH:mm`）入力もそのまま委譲するため、`.datetime({ local: true })` の両形式に対応する。**フォーム表示（initial value）も同 SSoT で揃える**:

```typescript
// NG: ブラウザ tz 依存（date-fns format / .slice(0, 16) など）
defaultValue: format(new Date(coupon.validFrom), "yyyy-MM-dd'T'HH:mm"),  // tz 依存
defaultValue: coupon.validFrom.slice(0, 16),                              // UTC を local 解釈する silent bug

// OK: `formatDateTimeLocalInJst` で JST 固定表示
import { formatDateTimeLocalInJst } from "@/shared/lib/date-format";
defaultValue: formatDateTimeLocalInJst(coupon.validFrom),
```

参照実装: `couponFormSchema` + `commands.ts toCouponData()`、`eventFormBaseSchema` + `events/commands.ts`、`barFormSchema` + `settings/announcement-bar.ts normalizeAnnouncementBarInput()`
