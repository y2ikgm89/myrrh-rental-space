---
description: 型アサーション (`as`) / 非null アサーション (`!`) 禁止 + 限定許可例外（DOM event / Prisma JSON / SectionConfig / serialize ヘルパー / standardSchemaResolver）+ 禁止パターン代替
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# 型アサーション / 非null アサーション禁止

> `as` キャスト・`!` 非null アサーションは原則禁止。許可例外は 5 ケース限定 + 禁止パターン → 代替手段マッピング。

## 非null アサーション (`!`) の代替パターン

```typescript
// NG: 非null アサーション
location!.id
config.items!.map(...)
uniforms["key"]!.value

// OK: ガード句（edit mode で optional prop を使う場合）
if (!location) throw new Error("location is required for edit mode");
location.id

// OK: 変数抽出で narrowing（三項演算子内で narrowing が効かない場合）
const inlineItems = config.items;
if (inlineItems != null && inlineItems.length > 0) {
  inlineItems.map(...)  // narrowed
}

// OK: optional + early return（noUncheckedIndexedAccess 対応）
const uniform = uniforms["key"];
if (!uniform) return;
uniform.value = 42;
```

## `as` の許可例外（限定的）

### 1. DOM event target

```typescript
// OK: ブラウザ DOM API の型制約
const input = event.target as HTMLInputElement;
const value = input.value;
```

### 2. Prisma JSON 型（`Prisma.InputJsonObject` / `Prisma.InputJsonValue`）

```typescript
// OK: Prisma API の型制約（InputJsonObject はオブジェクト型を要求）
await prisma.settings.update({
  data: { config: {} as Prisma.InputJsonObject },
});
```

**SDK 境界 cast の `satisfies + as` 最小化パターン**: `as A as B` の double cast は不格好。先行の `satisfies` で shape を検証してから単一 `as` で SDK 型に narrow する:

```typescript
// NG: double cast（shape 未検証の二段 escape hatch）
const label =
  data.label as ReadonlyArray<Prisma.JsonValue> as Prisma.InputJsonValue;

// OK: satisfies で shape 検証 + 単一 as で SDK 境界
const label =
  data.label satisfies ReadonlyArray<unknown> as Prisma.InputJsonValue;
```

参照実装: `@/shared/domain/navigation/commands.ts` の `normalizeNavigationItemInput`（`PortableTextSpan[]` 配列を Prisma の Json 列に渡す境界 cast）。discriminated union の span 配列が `Prisma.InputJsonValue` と直接 assignable でないため必要。

### 3. SectionConfig union widening（`validateSectionConfig` 内部のみ）

`validateSectionConfig` は戻り値型に `z.ZodSafeParseResult<SectionConfig>` を明示することで union widening を関数内部に閉じ込めている。**呼び出し側での `as SectionConfig` は不要かつ禁止**。

```typescript
// section.ts 内部（唯一の許可場所）
export function validateSectionConfig(
  type: SectionType,
  config: unknown,
): z.ZodSafeParseResult<SectionConfig> {
  const schema = sectionConfigSchemas[type];
  // 各スキーマの safeParse 結果は個別型だが、戻り値型注釈により SectionConfig に widening される
  return schema.safeParse(config);
}

// 呼び出し側（as 不要）
const result = validateSectionConfig(type, config);
if (result.success) {
  const config = result.data; // SectionConfig 型（as 不要）
}
```

### 4. `keysOf` / `entriesOf` / `omitUndefined`（`@/shared/lib/serialize.ts` の実装内部のみ）

`Object.keys` / `Object.entries` / `Object.fromEntries` の標準戻り型が広すぎる、または `exactOptionalPropertyTypes` 向けに `undefined` プロパティを除去した型 `OmitUndefined<T>` へ寄せる必要があるため、**当該ファイルの実装内**でのみ `as` を許可する。呼び出し側で `Object.keys(x) as Foo[]` や `fromEntries(...) as T` と書くことは禁止し、ヘルパーを使う。新規の類似「境界ヘルパー」を増やさないこと。

```typescript
// @/shared/lib/serialize.ts（実装内部のみ）
export function keysOf<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}
export function entriesOf<T extends object>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as [keyof T, T[keyof T]][];
}
export function omitUndefined<T extends object>(obj: T): OmitUndefined<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as OmitUndefined<T>;
}
// 呼び出し側: keysOf(config) / entriesOf(obj) / omitUndefined(parsed) — as 不要
```

> ジェネリック制約 `T extends object` によりキーが `keyof T` に限定されるため型安全。
> 呼び出し側で `Object.keys(obj) as ConfigKey[]` と書くことは禁止。`keysOf(obj)` を使う。

### 5. RHF `Path<T>` / `UseFormSetValue<FieldValues>` 境界（generic invariance への対処）

React Hook Form の `Path<T>` は `T extends FieldValues` のフォーム型から **静的な string literal union** を導出する型関数。ジェネリック関数の本体内では `T` が unbound のため `"contentWidth"` が `Path<T>` の member であることを TS が証明できない（既知の TS limitation）。同様に `Control<T>` / `UseFormSetValue<T>` は invariant のため、複数フォーム型（Post / News 等）で 1 つの connected component を共有する場合に `UseFormSetValue<FieldValues>` への widening が必要。**`as Path<T>` / `as UseFormSetValue<FieldValues> | undefined` は本境界のみで許可**:

```typescript
// OK: Pure Component + Connected ラッパーで限定する
export function LayoutFieldsConnected<T extends FieldValues>({
  control,
  setValue,
}: Props<T>) {
  const contentWidthPath = "contentWidth" as Path<T>;
  const v = useWatch({ control, name: contentWidthPath });
  (setValue as UseFormSetValue<FieldValues> | undefined)?.("contentWidth", v);
}
```

参照実装: `LayoutFields.tsx` の `LayoutFieldsConnected`、`use-public-form.ts` の `form.setError(field as Path<TInput>, ...)`（`field in currentValues` で existence 検証済み + `Object.entries(fieldErrors)` の `string` key を RHF Path に narrow）。

**ルール**: 本境界の外（Section / Inspector / 単一フォーム型 Component 内）では generic にせず concrete form type を直接使い、`Path<T>` cast を発生させない。Connected wrapper を新規追加する場合は本セクションに参照実装を追記する。

### 6. `standardSchemaResolver` 境界変換（`auto-section-form.tsx` の RHF 呼び出しのみ）

RHF の `standardSchemaResolver` は `StandardSchemaV1<FieldValues>` を要求するが、動的セクション定義の `configSchema` は `z.ZodType<unknown>` として保持される（`sectionConfigSchemas` マップから取得）。`configSchema` は全て `z.object({...})` で定義されるため実行時は安全だが、TypeScript の invariance のため `as unknown as z.ZodObject<Record<string, z.ZodType>>` で橋渡しする。単一フォームへの適用であり Pure Component + Connected wrapper への分離は過剰なため、境界ヘルパーとして本ファイル内で完結する例外として許容する。

```typescript
// src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx
resolver: standardSchemaResolver(
  schema as unknown as z.ZodObject<Record<string, z.ZodType>>,
),
```

## 禁止パターンと代替手段

| 禁止パターン                        | 代替                                      |
| ----------------------------------- | ----------------------------------------- |
| `Object.keys(obj) as ConfigKey[]`   | `keysOf(obj)`（`@/shared/lib/serialize`） |
| `value as DiscountType`             | `isValidDiscountType(value)` 型ガード     |
| `value as 'asc' \| 'desc'`          | Set-based 型ガード + if 文                |
| `{ ... } as Record<K, V>`           | `satisfies` キーワード                    |
| `value as SomeType`（Zod parse 後） | `safeParse` + `result.data` を直接使用    |

```typescript
// NG: 型アサーション
const keys = Object.keys(config) as ConfigKey[]
const tab = params.tab as TabType
onValueChange={(value) => setType(value as DiscountType)}

// OK: 型安全な代替
const keys = keysOf(config)
const tab = isValidTab(params.tab) ? params.tab : 'default'
onValueChange={(value) => { if (isValidDiscountType(value)) setType(value) }}
```

## 監査 grep（型アサーション横断検出）

```bash
# `as Type` 全体（shadcn primitive rename 等を含む、要精査）
grep -rnE '\bas\s+[A-Z][a-zA-Z0-9_]*(\[\]|<[^>]+>)?\b' src/

# `as any` / `as unknown as` / `@ts-ignore` 系（最優先で潰す対象）
grep -rnE '\bas\s+any\b|\bas\s+unknown\s+as\b|@ts-(ignore|expect-error|nocheck)' src/

# `Object.keys() as T[]` パターン（keysOf() 置換対象）
grep -rnE 'Object\.keys\([^)]+\)\s+as\s+' src/

# isRecord narrowing 直後の冗長 `as Record<string, unknown>`
grep -rn 'as Record<string, unknown>' src/
```

## Gotchas

- **同名 enum / Prisma 名前空間の重複 import が `as` rename を強制する silent debt** — 例: `EventStatus` を `@generated/prisma/enums`（直）と `@/shared/lib/validations/enums/prisma-types`（gateway）の両方から import すると TS2300（重複宣言）になり、回避策として `EventStatus as EventStatusEnum` rename が混入する。本来は gateway 経由（`enums/prisma-types`）に統一すれば rename 不要。**`as` rename を見つけたら同名 import の存在を grep で先に確認**してから rename 除去を試みる（rename 単体を消すと TS2300 が顕在化して silent debt の根を発見できる）。2026-05-12 `events/commands.ts` で実遭遇
