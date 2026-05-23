---
description: 型アサーション (`as`) / 非null アサーション (`!`) 禁止 + 限定許可例外（DOM event / Prisma JSON helper / SectionConfig / serialize ヘルパー / typedRoutes / conform generic invariance / JSX defensive narrowing）+ 禁止パターン代替
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# 型アサーション / 非null アサーション禁止

> `as` キャスト・`!` 非null アサーションは原則禁止。許可例外は 6 種類限定 + 禁止パターン → 代替手段マッピング。

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

## `as` の許可例外（6 種類限定）

### 1. DOM event target / DOM walker (instanceof narrow が canonical)

ブラウザ DOM API の `EventTarget` / `Node` / `Document.getElementById` 等は仕様で wider 型。**`as` cast ではなく `instanceof` narrow が canonical** (2026-05-18 PR で全 10 cast を排除済、type-safe + null check 同時実現):

```typescript
// NG: as cast による型逃がし
const input = event.target as HTMLInputElement;
const target = e.target as HTMLElement;
const nameInput = document.getElementById(id) as HTMLInputElement | null;
const el = node as HTMLElement;
const textNode = range.startContainer as Text;
e.target as Node;

// OK: instanceof narrow (TypeScript 公式推奨、cast 不要 + null check 同時)
if (event.target instanceof HTMLInputElement) {
  const value = event.target.value;
}
if (!(e.target instanceof Element)) return;
const iconSpan = e.target.closest("[data-icon]");
const nameInput = document.getElementById(id);
if (!(nameInput instanceof HTMLInputElement)) return;
for (const node of root.childNodes) {
  if (!(node instanceof HTMLElement)) continue;
  // ...
}
const textNode = range.startContainer;
if (!(textNode instanceof Text)) return null;
if (e.target instanceof Node && !panel.contains(e.target)) close();
```

**例外**: React event handler の `e.currentTarget` は `React.MouseEvent<HTMLDivElement>` 等の generic で narrow される (bubbling 対象である `e.target` は仕様で wider のまま — `instanceof` narrow 必須)。

### 2. Prisma JSON 型 — helper 強制 + Prisma.InputJsonObject data field のみ許容

`as Prisma.InputJsonValue` cast は **禁止**（2026-05-17 PR #109 で src/ 12 cast → 0 構造解消済、2026-05-18 PR #133 で `prisma/seed.ts` 10 cast も helper 経由化 → プロジェクト全体で 0 達成）。`@/shared/db/prisma-input-json` の `asPrismaInputJsonValue(value, msg)` / `parsePrismaInputJson(json, msg)` / `clonePrismaInputJson(value, msg)` helper 経由で `isPrismaInputJsonValue` type guard + `DomainError("VALIDATION")` throw による runtime narrow を強制する:

```typescript
// NG: cast による型逃がし
await prisma.event.update({
  data: { contentJson: value as Prisma.InputJsonValue },
});

// OK: helper 経由で runtime 検証
import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";

await prisma.event.update({
  data: { contentJson: asPrismaInputJsonValue(value, "本文の形式が不正です") },
});
```

`as Prisma.InputJsonObject` は **オブジェクト型を要求する Prisma data field** に限定して許容（Prisma 型システム制約により JSON literal を inline する場合に必要）:

```typescript
// OK: Prisma API の型制約（InputJsonObject はオブジェクト型を要求）
await prisma.settings.update({
  data: { config: {} as Prisma.InputJsonObject },
});
```

`as Prisma.InputJsonArray` は **`satisfies + as` 最小化パターン**で shape 検証を先行させる。`as A as B` の double cast は禁止:

```typescript
// NG: double cast（shape 未検証の二段 escape hatch）
const label =
  data.label as ReadonlyArray<Prisma.JsonValue> as Prisma.InputJsonValue;

// OK: satisfies で shape 検証 + 単一 as で SDK 境界
const label =
  data.label satisfies ReadonlyArray<unknown> as Prisma.InputJsonArray;
```

参照実装: `@/shared/domain/navigation/commands.ts` の `normalizeNavigationItemInput`（`PortableTextSpan[]` 配列を Prisma の Json 列に渡す境界 cast）。discriminated union の span 配列が `Prisma.InputJsonValue` と直接 assignable でないため必要。

### 3. `keysOf` / `entriesOf` / `omitUndefined`（`@/shared/lib/serialize.ts` の実装内部のみ）

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

### 4. SDK 境界 Zod typed schema（`z.custom<T>` SSoT 内部のみ）

Node-only SDK（`googleapis` / `resend` 等）の generated 型は internal implementation 詳細（`null` vs `undefined` の round-trip 問題、discriminated union variant 復元不能等）を含むため、Zod 4 公式 `z.custom<T>` パターン（[zod.dev/api#custom](https://zod.dev/api#custom)）で **SSoT helper 内部のみ** に cast を閉じ込める:

```typescript
// @/shared/lib/google-business-profile/schemas.ts（唯一の許可場所）
import "server-only";
import type { mybusinessbusinessinformation_v1 } from "googleapis";
import { z } from "zod";
import { isRecord } from "@/shared/lib/serialize";

export const LocationSchema =
  z.custom<mybusinessbusinessinformation_v1.Schema$Location>(
    isRecord,
    "Expected a Google Business Profile Schema$Location object",
  );

// 呼び出し側（as 不要）
const requestBody = LocationSchema.parse(payload);
await client.locations.patch({ requestBody, ... });
```

同パターン: `@/shared/lib/email/schemas.ts` (`CreateEmailOptionsSchema` for Resend), `@/shared/lib/routes/to-app-route.ts` (`Route<string>` for Next.js typedRoutes)。

**ルール**: 呼び出し側で `as unknown as Schema$Location` / `as CreateEmailOptions` / `as Route<string>` の cast を新規に書くことは禁止。SSoT helper を `.parse()` / `.safeParse()` で経由する。新規 SDK 統合時は `<service>/schemas.ts` に同パターンで追加する。

### 5. conform `FieldMetadata<T>` generic invariance 境界 (typed-input-control SSoT)

conform の `FieldMetadata<T, FormShape, FormError>` は **invariant** な type parameter を持つため、動的 schema (22 種の Section type に対応する `AutoSectionForm` 等) や Pure Component 越境で `FieldMetadata<unknown>` → `FieldMetadata<T>` の boundary cast が必要になる (公式仕様の限界、library 側 semver-major 対応待ち)。

**`@/shared/lib/conform/typed-input-control` の 9 helper 内部のみ許可** (`useTypedInputControl` / `getTypedFieldList` / `getTypedFieldset` / `asTypedField` / `asConformDefaultValue` / `asConformSubmissionValue` / `asConformButtonGetter` / `asConformLooseRecord` / `asConformFieldset`)、helper 外部での `as unknown as FieldMetadata<...>` 記述は禁止。呼び出し側 cast は 0 件、helper 内部 9 件のみに集約済 (2026-05-18 PR #143 で 5 helper 追加完了)。

```typescript
// OK: helper 経由 (呼び出し側 cast 0 件)
import {
  useTypedInputControl,
  getTypedFieldset,
  asTypedField,
} from "@/shared/lib/conform/typed-input-control";

const control = useTypedInputControl(field);
const fieldset = getTypedFieldset<{ name: string }>(field);
<TagFields tagsField={asTypedField<string[]>(ctx.fields.tags)} />;

// NG: 呼び出し側で cast (architecture-boundaries.test.ts §5 gate で fail)
const control = useInputControl(field as unknown as FieldMetadata<string>);
```

**検出 grep**:

```bash
# helper 内部以外で hit したら違反
grep -rnE 'as\s+unknown\s+as\s+FieldMetadata' src/ | grep -v 'src/shared/lib/conform/typed-input-control.ts'
# 期待: 0 件
```

検知 gate: `__tests__/unit/architecture-boundaries.test.ts` の §5 gate が src/ 全体を grep し、`typed-input-control.ts` 以外で hit したら fail。

参照実装: `@/shared/lib/conform/typed-input-control` の 4 helper、消費者は `auto-section-form.tsx` / `Auto{Boolean,Select,Array,Group}Field.tsx` / `LayoutFields.tsx` (Connected wrapper) / `content-types/post.tsx` (tagsField 配送)。

**Gotchas — `useTypedInputControl` を array of objects 値で使うと silent crash**:

`useTypedInputControl` は内部で `FieldMetadata<string>` に固定 cast するため、conform `useInputControl<string>` の内部 sync `useEffect` が `change(field.value)` を呼ぶ際 `dom.mjs:normalizeStringValues` で「Expected string or string[] value for string based input」を throw する。conform `defaultValue` が array of objects（`PortableTextSpan[]` / `PortableTextBlock[]` 等）を含む field でこの helper を使うと、初回マウントまたは `router.refresh()` による remount 直後に AdminError boundary が発火する。**canonical: local `useState<T[]>` + hidden input `JSON.stringify(state)` transit + 「Adjusting State Directly During Render」パターンで `field.value` の外部変更（variant 切替の `form.update` 等）を同期する** — `BarDialog.messageSpans` / `NavigationDialog.labelSpans` / `AutoRichLabelField` / `AutoRichBlocksField` が参照実装。schema 側は `createSpanArraySchema` / `createBlockArraySchema` の `decodePortableTextInput` preprocess で JSON 文字列を配列に復号する（→ `ssot-singletons.md` §Lexical / 記事表示 の PortableText 行）。

**判定基準**: `useTypedInputControl` を呼ぶ前に `field.initialValue` / `field.value` の取りうる runtime 型を確認する。string / null / undefined のみ → 安全。array / object を含む可能性 → 上記 canonical local state pattern を採用（helper 経由禁止）。

### 6. JSX 内 repeated property access の defensive narrowing（typedoc / tsc control-flow analysis 差）

JSX 内で同一 nullable property を **複数回 read** する場合、TypeScript の control-flow narrowing が文脈境界で失われ、`tsc --noEmit` では pass するのに **CI typedoc では `TS2339` (Property X does not exist on type 'never')** が出る silent CI bug が起きる。typedoc は内部で別 TS checker を呼ぶため、tsc と control-flow analysis の挙動が一致しない可能性あり（typedoc / tsc version mismatch、外部 type 推論 cache の差）。

```tsx
// NG: JSX 内で 3 回 access → typedoc が後段の startsWith() で narrow 失敗
{
  currentBar.linkUrl &&
    currentBar.linkText &&
    (isAppRoute(currentBar.linkUrl) ? (
      <Link href={currentBar.linkUrl}>{currentBar.linkText}</Link>
    ) : (
      <a
        href={currentBar.linkUrl}
        target={currentBar.linkUrl.startsWith("http") ? "_blank" : undefined}
        rel={currentBar.linkUrl.startsWith("http") ? "noreferrer" : undefined}
      >
        {currentBar.linkText}
      </a>
    ));
}
```

**対処**: JSX 外で **outer const 抽出** + derived 値も const 化。JSX 内では narrow 済み変数のみ参照する:

```tsx
// JSX 外（return 直前）で narrowing を確定
const linkUrl = currentBar.linkUrl;
const linkText = currentBar.linkText;
const isExternalLink = linkUrl != null && linkUrl.startsWith("http");
const linkClassName = cn(/* ... */);

// JSX 内では narrow 済み変数のみ
{
  linkUrl != null &&
    linkText != null &&
    (isAppRoute(linkUrl) ? (
      <Link href={linkUrl} className={linkClassName}>
        {linkText}
      </Link>
    ) : (
      <a
        href={linkUrl}
        className={linkClassName}
        target={isExternalLink ? "_blank" : undefined}
        rel={isExternalLink ? "noreferrer" : undefined}
      >
        {linkText}
      </a>
    ));
}
```

**判定基準**:

- 同一 nullable property を JSX 内で **2 回以上** read する
- read のうち少なくとも 1 つが method call (`.startsWith()` / `.toLowerCase()` 等)
- 上記 2 条件が揃ったら **必ず outer const 抽出**（tsc local で pass しても CI typedoc で fail する preemptive 防御）

**禁止**: JSX 内 IIFE (`{(() => { const x = ...; return ...; })()}`) で narrow を作る — `@eslint-react/unsupported-syntax` 違反。必ず JSX 外で抽出する（→ `react/gotchas.md` §JSX 内の IIFE 禁止）。

参照実装: `src/app/(public)/_shared/components/announcement-bar/announcement-bar.tsx` の `linkUrl` / `linkText` / `isExternalLink` 抽出（2026-05-13 typedoc TS2339 修正）。

## 禁止パターンと代替手段

| 禁止パターン                           | 代替                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Object.keys(obj) as ConfigKey[]`      | `keysOf(obj)`（`@/shared/lib/serialize`）                                                                                                                       |
| `value as DiscountType`                | `isValidDiscountType(value)` 型ガード                                                                                                                           |
| `value as 'asc' \| 'desc'`             | Set-based 型ガード + if 文                                                                                                                                      |
| `{ ... } as Record<K, V>`              | `satisfies` キーワード                                                                                                                                          |
| `value as SomeType`（Zod parse 後）    | `safeParse` + `result.data` を直接使用                                                                                                                          |
| `value as Prisma.InputJsonValue`       | `asPrismaInputJsonValue(value, msg)`（`@/shared/db/prisma-input-json`）                                                                                         |
| `value as Route<string>`               | `toAppRoute(value)` / `safeToAppRoute(value)`（`@/shared/lib/routes/to-app-route`）                                                                             |
| `value as unknown as Schema$Location`  | `LocationSchema.parse(value)`（`@/shared/lib/google-business-profile/schemas`）                                                                                 |
| `value as CreateEmailOptions`          | `CreateEmailOptionsSchema.parse(value)`（`@/shared/lib/email/schemas`）                                                                                         |
| `field as unknown as FieldMetadata<T>` | `useTypedInputControl(field)` / `getTypedFieldList(field)` / `getTypedFieldset(field)` / `asTypedField<T>(field)`（`@/shared/lib/conform/typed-input-control`） |

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

# §5 conform FieldMetadata cast の helper 強制検証（typed-input-control.ts 内部以外 0 件期待）
grep -rnE 'as\s+unknown\s+as\s+FieldMetadata' src/ | grep -v 'src/shared/lib/conform/typed-input-control.ts'

# 旧 SectionConfig union widening cast 構造解消検証 (validateSectionConfig generic narrowing 化済、0 件期待)
grep -rnE '\bas\s+SectionConfig\b' src/

# `Object.keys() as T[]` パターン（keysOf() 置換対象）
grep -rnE 'Object\.keys\([^)]+\)\s+as\s+' src/

# isRecord narrowing 直後の冗長 `as Record<string, unknown>`
grep -rn 'as Record<string, unknown>' src/

# §2 Prisma.InputJsonValue cast の構造解消検証（コメント外 0 件期待）
grep -rnE '\bas\s+Prisma\.InputJsonValue\b' src/ | grep -v '^[^:]*:[^:]*:\s*\*\|^[^:]*:[^:]*:\s*//'

# §4 SDK 境界 cast の helper 強制検証（schemas.ts / to-app-route.ts 内部以外 0 件期待）
grep -rnE 'as\s+unknown\s+as\s+Schema\$Location|as\s+CreateEmailOptions\b|as\s+Route<string>' src/
```

`architecture-boundaries.test.ts` が src/ 横断で gate を担保する（コメント除外で実体 cast のみ検出）。

## Gotchas

- **同名 enum / Prisma 名前空間の重複 import が `as` rename を強制する silent debt** — 例: `EventStatus` を `@generated/prisma/enums`（直）と `@/shared/lib/validations/enums/prisma-types`（gateway）の両方から import すると TS2300（重複宣言）になり、回避策として `EventStatus as EventStatusEnum` rename が混入する。本来は gateway 経由（`enums/prisma-types`）に統一すれば rename 不要。**`as` rename を見つけたら同名 import の存在を grep で先に確認**してから rename 除去を試みる（rename 単体を消すと TS2300 が顕在化して silent debt の根を発見できる）。2026-05-12 `events/commands.ts` で実遭遇
