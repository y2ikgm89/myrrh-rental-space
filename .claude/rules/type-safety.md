---
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# 型安全ルール

> TypeScript 6.0 / noUncheckedIndexedAccess 有効

> 詳細サブルール（path-scoped auto-load）:
>
> - **noUncheckedIndexedAccess + TS 6.0 設定 + 配列 / ループ / Record アクセス** — `type-safety/index-access.md`
> - **`as` / `!` 禁止 + 5 つの限定許可例外 + 禁止パターン代替** — `type-safety/assertion-bans.md`
> - **Mutually Exclusive Discriminated Union + `_type` Portable Text + `satisfies`** — `type-safety/discriminated-unions.md`
> - **ユーザー定義 / Set-based / Zod safeParse / Select onChange 型ガード** — `type-safety/type-guards.md`

## tsconfig 必須オプション

| オプション                           | 値     | 影響                                                                                                                 |
| ------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `erasableSyntaxOnly`                 | `true` | `enum`・`namespace`・parameter properties 禁止（コンパイラレベル）。`const` + as const オブジェクトか union 型を使う |
| `verbatimModuleSyntax`               | `true` | `import type` 必須。値と型を同一インポートで混在させるとビルドエラー                                                 |
| `noPropertyAccessFromIndexSignature` | `true` | インデックスシグネチャへのドット記法禁止。`obj['key']` を使う（`obj.key` はエラー）                                  |
| `noUncheckedIndexedAccess`           | `true` | 配列・Record アクセスが `T \| undefined` を返す（→ `type-safety/index-access.md`）                                   |

```typescript
// NG: enum（erasableSyntaxOnly: true でエラー）
enum Direction {
  Up = "up",
  Down = "down",
}

// OK: const as const + union
const Direction = { Up: "up", Down: "down" } as const;
type Direction = (typeof Direction)[keyof typeof Direction];

// NG: ドット記法（noPropertyAccessFromIndexSignature）
obj.dynamicKey; // Error

// OK: ブラケット記法
obj["dynamicKey"];

// NG: 型と値の混在インポート（verbatimModuleSyntax）
import { User, createUser } from "./user";

// OK: 型は import type で分離
import type { User } from "./user";
import { createUser } from "./user";
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

## Gotchas

- **`exactOptionalPropertyTypes` 下で optional boolean prop に三項演算子禁止** — `disabled={condition ? !isDirty : undefined}` は型エラー（`boolean | undefined` は `boolean?` と非互換）。条件スプレッド `{...(condition && { disabled: !isDirty })}` を使用
- **任意 schema の `.default()` は z.input 型を optional 化する（z.enum 限定ではない）** — `z.array(...).default([])` / `z.object(...).default({})` 等あらゆる schema で適用される Zod 4 公式挙動。RHF `standardSchemaResolver` に渡す form schema は `.default()` を持たない素の `z.array(itemSchema)` / `z.object({...})` で構築し、UI の `defaultValues` で初期値を補う。実例: 2026-05-09 NavigationItem rich label 化で `navFormSchema.label` を factory schema 経由ではなく `z.array(portableTextSpanSchema).refine()` で RHF input 型 mismatch を解消
- **`__tests__/` は type-check 対象に含まれている**（`tsconfig.test.json`）— `bun run type-check` が `tsc -p tsconfig.test.json` も実行し、テスト内型エラーを検出する
- **`Serialized<T>` は配列・object 構造を保持する** — `Serialized<string[]>` = `string[]`、`Serialized<string[] \| null>` = `string[] \| null`、`Serialized<{ a: Date; b: string[] }>` = `{ a: string; b: string[] }`。`Date → string` のみが substitution、配列要素・object key は再帰展開（`@/shared/lib/serialize` 定義）。`(serializedValue.imageUrls as string[])` 等の back-cast は dead code
- **`?: never` variant 混在の discriminated union で `"key" in options && options.key` は TS2774** — `{ a: string; b?: never } | { a?: never; b: T }` のような型では、`"b" in options` で narrow 後 `options.b` が `T` 型に確定し truthy check が常時 true 扱いされる。`if (options.b)` 単独で十分（`?: never` variant は実行時 undefined で falsy）。`in` operator は **キー存在しない variant の絞り込み** が目的、value の null check と組み合わせない。`executeAdminMutationResult` の `resolveResourceId` callback 検出で実遭遇（2026-05-08）
