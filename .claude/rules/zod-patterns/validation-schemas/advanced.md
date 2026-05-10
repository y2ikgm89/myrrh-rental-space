---
description: Zod 高度パターン（useFieldArray + safeParse + Discriminated union default + prefault + Length introspection + .default([]) skip + Read/Write 分離）
paths:
  - src/shared/lib/validations/**
  - src/**/lib/validations/**
  - src/**/actions/**/*.ts
  - src/shared/domain/**
  - src/shared/lib/json-validators.ts
  - src/shared/lib/sections/definitions/**
---

# Zod 高度パターン

> useFieldArray 連携 / safeParse exact optional / discriminated union default / prefault inner default / Length introspection / .default([]) min skip / Read-side vs Write-side default 分離。

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

```typescript
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

`z.array().min(N).max(M)` / `z.string().min(N).max(M)` 等の length check は `_zod.def.checks` 配列に格納される。各 check の値は **`_zod.def.minimum` / `_zod.def.maximum` キー**で保持される（`_zod.def.value` ではない — silent debug 沼）:

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

## Read-side / Write-side で default の有無を分離する canonical pattern

同じスキーマを「DB JSON read」と「フォーム write」両方で使う場合、canonical は **`.default()` なし** で定義し、form 利用側で `.default([])` を chain する:

- **Read-side**（`parseXxx(value: unknown)` ヘルパー）: `safeParse(value)` で strict 判定、失敗時は `[]` fallback。`.default([])` を canonical に混ぜると undefined input が silent に通り防御的型ガードが効かなくなる
- **Write-side**（form / Server Action schema）: input undefined → `[]`（min 検証 skip）の Zod 4 公式挙動を `safeParse({})` 契約と両立させたい

```typescript
// canonical（json-validators.ts）— .default() なし、parseFacilities が safeParse fallback
export const facilitiesSchema = z
  .array(facilityItemSchema)
  .refine(/* uniqueness */);

export function parseFacilities(value: unknown): FacilityItem[] {
  const result = facilitiesSchema.safeParse(value);
  return result.success ? result.data : []; // strict + helper fallback
}

// form 利用側（admin/lib/validations/space.ts）— canonical を import + .default([])
import { facilitiesSchema } from "@/shared/lib/json-validators";
const facilitiesFormSchema = facilitiesSchema.default([]);
```

**禁止**: 1 つの schema に `.default([])` を混ぜて両用する（read-side で undefined が silent 通過する silent bug）。`facilitiesSchema` 統合（2026-05-08）が参照実装。
