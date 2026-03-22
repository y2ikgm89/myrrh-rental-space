# 型安全ルール

> TypeScript 6.0-beta / noUncheckedIndexedAccess 有効

## noUncheckedIndexedAccess（有効）

`tsconfig.json` で `noUncheckedIndexedAccess: true` を有効化済み。配列・オブジェクトのインデックスアクセスは `T | undefined` を返す（`strict` フラグには含まれないため明示的に有効化）。

### 配列アクセス

```typescript
// NG: そのままアクセス（コンパイルエラー）
const first = items[0];
first.name; // Error: Object is possibly 'undefined'

// OK: ガード句でナローイング
const first = items[0];
if (!first) return;
first.name; // T（narrowed）

// OK: optional chain + nullish coalescing
const name = items[0]?.name ?? "default";

// OK: 分割代入デフォルト値
const [localPart = "", domain = ""] = email.split("@");
```

### ループパターン

インデックスループは `noUncheckedIndexedAccess` でエラーになる。`for...of` / `forEach` が推奨:

```typescript
// NG: インデックスループ（strs[i] が string | undefined）
for (let i = 0; i < strs.length; i++) {
  console.log(strs[i].toUpperCase()); // Error: Object is possibly 'undefined'
}

// OK: for...of（各要素は string 型）
for (const str of strs) {
  console.log(str.toUpperCase());
}

// OK: forEach
strs.forEach((str) => {
  console.log(str.toUpperCase());
});

// OK: インデックスが必要な場合はガード句
for (let i = 0; i < arr.length; i++) {
  const item = arr[i];
  if (!item) continue;
  // item は T 型
}
```

### Record 型のアクセス

`Record<string, V>` のプロパティアクセスも `V | undefined` を返す:

```typescript
// NG: Record アクセスをそのまま使用
const style = TYPE_STYLES[type]; // V | undefined
style.bg; // Error: Object is possibly 'undefined'

// OK: デフォルト定数をエクスポートして nullish coalescing
export const DEFAULT_TYPE_STYLE = { bg: "bg-muted", text: "text-foreground" };
const style = TYPE_STYLES[type] ?? DEFAULT_TYPE_STYLE;

// OK: ガード句
const style = TYPE_STYLES[type];
if (!style) return;
```

## 型アサーション（`as`）禁止

型アサーションはコンパイラの型検査を無効化するため、原則禁止。次に列挙する**限定的例外**のみ許可（新規の `as` 追加はレビュー必須）。

### 許可例外（限定的・列挙のみ）

**1. DOM event target**

```typescript
// OK: ブラウザ DOM API の型制約
const input = event.target as HTMLInputElement;
const value = input.value;
```

**2. Prisma JSON 型（`Prisma.InputJsonObject`）**

```typescript
// OK: Prisma API の型制約（InputJsonObject はオブジェクト型を要求）
await prisma.settings.update({
  data: { config: {} as Prisma.InputJsonObject },
});
```

**3. SectionConfig union widening（`validateSectionConfig` 内部のみ）**

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

```typescript
// NG: 呼び出し側で as を書く（不要・禁止）
const config = result.data as SectionConfig;

// OK: validateSectionConfig を使う（as 不要）
const result = validateSectionConfig(type, rawConfig);
if (result.success) {
  doSomething(result.data); // SectionConfig 型
}
```

**4. TypeScript 6.0 条件型（`as unknown as T`）**

```typescript
// OK: 条件型を含む型への代入（TS 6.0 で厳格化）
// ActionSuccess<T> は条件型のため直接 as では不可、二段階キャストが必要
return result as unknown as ActionSuccess<T>;
```

**5. `keysOf` / `entriesOf` / `omitUndefined`（[`@/shared/lib/serialize`](../../../src/shared/lib/serialize.ts) の実装内部のみ）**

`Object.keys` / `Object.entries` / `Object.fromEntries` の標準戻り型が広すぎる、または `exactOptionalPropertyTypes` 向けに `undefined` プロパティを除去した型 `OmitUndefined<T>` へ寄せる必要があるため、**当該モジュールの実装内**でのみ `as` を許可する。呼び出し側で `Object.keys(x) as Foo[]` や `fromEntries(...) as T` と書くことは禁止し、ヘルパーを使う。

```typescript
// @/shared/lib/serialize.ts（実装内部のみ — 新規の類似ヘルパーを増やさないこと）
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
```

### 禁止パターンと代替手段

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

## `satisfies` キーワード

型チェックを維持しながら定数オブジェクトのプロパティ型を保持する:

```typescript
// NG: as キャスト（個別プロパティの型情報が失われる）
const STATUS_CONFIG = {
  active: { label: "有効", variant: "success" },
  inactive: { label: "無効", variant: "destructive" },
} as Record<string, StatusConfig>;

// OK: satisfies（型チェック + プロパティ型保持）
const STATUS_CONFIG = {
  active: { label: "有効", variant: "success" },
  inactive: { label: "無効", variant: "destructive" },
} satisfies Record<string, StatusConfig>;

// satisfies の利点: palette.red は string でなく [number, number, number] として推論される
type RGB = [number, number, number];
const palette = {
  red: [255, 0, 0],
  green: "#00ff00",
} satisfies Record<string, string | RGB>;
const red = palette.red; // [number, number, number]（string | RGB ではなく）
```

## 型ガードパターン

### ユーザー定義型ガード（`is` キーワード）

```typescript
// 型述語で戻り値型をナローイング
function isString(value: unknown): value is string {
  return typeof value === "string";
}

// filter と組み合わせ（型安全）
const strings = mixedArray.filter((v): v is string => typeof v === "string");
```

### Set-based 型ガード

Prisma enum にない値（ローカルの union 型）のみで使用:

```typescript
const CONNECTION_METHODS = ["oauth", "manual"] as const;
type ConnectionMethod = (typeof CONNECTION_METHODS)[number];
const CONNECTION_METHOD_SET = new Set<string>(CONNECTION_METHODS);

function isConnectionMethod(value: string): value is ConnectionMethod {
  return CONNECTION_METHOD_SET.has(value);
}
```

### Zod safeParse 型ガード（推奨）

```typescript
const result = schema.safeParse(unknownValue);
if (!result.success) {
  return { success: false, error: z.flattenError(result.error) };
}
// result.data は型安全
```

### Select / SelectionBox の onChange 型絞り込み

UI コンポーネントの `onChange` は `string` を返すため `enums.ts` の型ガードで絞り込む:

```typescript
import { isValidDiscountType, getValidDiscountType } from '@/shared/lib/validations/enums'

// NG: 型アサーション
onValueChange={(value) => setType(value as DiscountType)}

// OK: isValid* 型ガード
onValueChange={(value) => { if (isValidDiscountType(value)) setType(value) }}

// OK: getValid* デフォルト値付き（DB 値やフォーム初期値のパースに最適）
const taxRate = getValidTaxRateType(settings.taxRateType)  // デフォルト: standard
```

## ユーティリティ

| 関数                | シグネチャ                                                                          | ファイル                              | 用途                                            |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| `keysOf()`          | `<T extends object>(obj: T) => (keyof T)[]`                                         | `src/shared/lib/serialize.ts`         | 型安全な Object.keys（`as` なし）               |
| `entriesOf()`       | `<T extends object>(obj: T) => [keyof T, T[keyof T]][]`                             | `src/shared/lib/serialize.ts`         | 型安全な Object.entries                         |
| `filterTruthy()`    | `<T>(arr: readonly (T \| false \| null \| undefined)[]) => T[]`                     | `src/shared/lib/serialize.ts`         | `arr.filter(Boolean) as T[]` の型安全代替       |
| `createTypeGuard()` | `<T extends string>(allowedValues: readonly T[]) => (value: unknown) => value is T` | `src/shared/lib/serialize.ts`         | const 配列から Set-based 型ガード関数を生成     |
| `isRecord()`        | `(value: unknown) => value is Record<string, unknown>`                              | `src/shared/lib/serialize.ts`         | オブジェクト型ガード（`as Record<...>` の代替） |
| `isValid*()`        | —                                                                                   | `src/shared/lib/validations/enums.ts` | Prisma enum 型ガード                            |
| `getValid*()`       | —                                                                                   | `src/shared/lib/validations/enums.ts` | デフォルト値付き enum 取得                      |
