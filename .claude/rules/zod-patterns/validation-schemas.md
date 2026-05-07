---
paths:
  - src/shared/lib/validations/**
  - src/**/lib/validations/**
  - src/**/actions/**/*.ts
  - src/shared/domain/**
---

# Zod バリデーションスキーマ構築

> Zod 4.3 対応

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

**Server Action用スキーマ vs フォーム用スキーマの使い分け**:

| 用途                       | 特徴                             | 例                 |
| -------------------------- | -------------------------------- | ------------------ |
| Server Action              | 型厳格（Date, number, UUID検証） | `updatePostSchema` |
| フォーム (React Hook Form) | 空文字許可・文字列型             | `postFormSchema`   |

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

## URLバリデーション

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

## URLパラメータバリデーション

```typescript
// @/shared/lib/validations/params.ts — 'use cache' 関数の入口検証
export const slugParamSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const idParamSchema = z.string().min(1).max(100);
```

## useFieldArray との連携（object[] 必須）

RHF の `useFieldArray` は primitive 配列（`string[]`）を管理できない。フォームで配列フィールドを D&D ソートや動的追加/削除する場合は object 配列にすること:

```typescript
// NG: useFieldArray に渡せない（primitive 配列）
imageUrls: z.array(z.string().url());

// OK: { url: string }[] — useFieldArray が id フィールドを自動付与して管理
imageUrls: z.array(
  z.object({ url: z.string().url({ error: "有効なURLを入力してください" }) }),
);
```

## safeParse 結果と exactOptionalPropertyTypes の橋渡し

`z.object({ field: z.string().optional() })` の出力は `{ field: string | undefined }`。
`readonly field?: string` 型（`exactOptionalPropertyTypes: true` 下）への代入には `omitUndefined` を使う:

```typescript
import { omitUndefined } from "@/shared/lib/serialize";

// NG: safeParse の result.data を直接返す
return result.data; // 型エラー

// OK: omitUndefined で undefined プロパティを除去
return result.success ? omitUndefined(result.data) : undefined;
```

## Discriminated union + `.default()` による破壊的 schema 拡張（migration 不要）

```ts
// After: recent/popular に固有フィールド追加
const recentSchema = z.object({
  type: z.literal("recent"),
  enabled: z.boolean(),
  layout: z.enum(["compact", "stacked"]).default("compact"),
});
```

既存 JSON `{ type: "recent", enabled: true }` は safeParse で `layout: "compact"` が補完される。DB migration 不要で破壊的拡張を完遂できる。

## ネスト object の inner default 発火 — `.prefault({})` 必須

`z.object({ inner: z.object({ a: z.string().default("x") }) })` で input `{}`（inner キーなし）の挙動:

- **`.default({})`** — output に `{}` がそのまま流れて **inner default は発火しない**（`{ inner: {} }`）
- **`.prefault({})`** — input undefined を `{}` に置換 → parser 通過 → **inner default が発火**（`{ inner: { a: "x" } }`）

共通 group schema を section / form 横断で注入する場合（parent が省略してもデフォルト展開したい）は `.prefault({})` 一択。
`parseSectionConfig` のような fallback chain で両 fallback が `safeParse({})` を呼ぶ設計の場合、`.default({})` を使うと sub-field が required のまま全 fallback fail → throw に到達する silent bug を生む。

generic helper（`<TFields>` で受けて `.prefault({})` を内蔵）は TS が `TFields` 全要素 ZodDefault かを推論できず型エラー。**各 schema 定義側で `z.object({...}).prefault({}).register(...)` を直接呼ぶのが Zod 4 公式 idiom**（generic helper 化禁止）。

参照実装: `sectionLayoutSchema` / `createImageGroupSchema`（`@/shared/lib/sections/definitions/_shared/{layout,image}`）

## Length check の内部構造（runtime introspection 用）

`z.array().min(N).max(M)` / `z.string().min(N).max(M)` 等の length check は `_zod.def.checks` 配列に格納される。各 check の値は **`_zod.def.minimum` / `_zod.def.maximum` キー**で保持される（`_zod.def.value` ではない — これは silent debug 沼）:

```typescript
// z.array(...).min(2).max(4) の内部構造
{
  _zod: {
    def: {
      type: "array",
      checks: [
        { _zod: { def: { check: "min_length", minimum: 2 } } },
        { _zod: { def: { check: "max_length", maximum: 4 } } },
      ],
    },
  },
}
```

schema constraint を runtime introspection する場合（admin UI 連動・dynamic form 生成等）は `bun -e "import('./schema.ts').then(m => console.log(JSON.stringify(m.schema._zod.def, null, 2)))"` で実構造を dump してから helper を書く。`value` キーで取得しようとして `undefined` が返る場合は `minimum` / `maximum` を試す。

参照実装: `getArrayConstraints` (`pages/[slug]/_sections/_components/zod-introspection.ts`) — `field.array({ min, max })` の制約を読み取り `AutoArrayField` の追加/削除ボタン disable に流す。

## `.default([])` は `.min()` 検証を skip する（`safeParse({})` 契約両立）

`z.array(...).min(2).default([])` で input が `undefined` の場合、Zod 4 は default 値 `[]` を返し `.min(2)` validator を skip する（公式仕様）:

```typescript
const s = z.array(z.string()).min(2).default([]);
s.parse(undefined); // → [] （min 検証 skip、default fallback）
s.parse([]); //         → throws（min 違反）
s.parse(["a"]); //      → throws（min 違反）
s.parse(["a", "b"]); // → ["a", "b"]（OK）
```

これにより **section schema の `safeParse({})` 成立契約と admin write-side 検証（min/max）を両立**できる:

- Schema fallback chain（`createTypedConfigGetterFromSchema`）: input undefined → `[]` で安全に通る
- Admin form / Server Action: 実 input は `.min(N).max(M)` で厳格検証

object 系の `.prefault({})` 必須パターンとは挙動が異なるため混同しない（object は default で inner default が発火しない / array は default で min 検証が skip される）。

## React Hook Form 連携

```typescript
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

// フォーム用スキーマ（空文字許可・文字列型）を resolver に渡す
const form = useForm<PostFormData>({
  resolver: zodResolver(postFormSchema),
  defaultValues: { title: "", slug: "" },
});
```

**注意**: React Hook Form に渡すスキーマはフォーム用（空文字許可・文字列型）。Server Action 側で改めてサーバー用スキーマで検証する二段構成。

## Zod 4 新機能

### z.fromJSONSchema()

```typescript
import { z } from "zod";

const schema = z.fromJSONSchema({
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    age: { type: "number", minimum: 0 },
  },
  required: ["name"],
});
```

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

## 禁止事項

1. **z.any() / z.unknown() の乱用禁止**
2. **型アサーションとの併用禁止** — `safeParse` の結果は `result.data` をそのまま使用
3. **バリデーションなしの Server Action 禁止** — 入力は必ず `safeParse` でバリデーション後に使用
