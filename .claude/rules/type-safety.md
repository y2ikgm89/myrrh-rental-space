---
paths: ["**/*.ts", "**/*.tsx"]
---

# 型安全性

strict フラグと 2 段構えのゲート（ESLint + `architecture-boundaries.test.ts` の grep gate）で
型の抜け穴を機械封鎖している。**lint 緑でも unit テストで落ちる**規約に注意。

## tsconfig（緩和禁止）

- `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` +
  `erasableSyntaxOnly` + `noPropertyAccessFromIndexSignature` + `noImplicitOverride` +
  `verbatimModuleSyntax` すべて有効
- `erasableSyntaxOnly` により TS の `enum` / `namespace` / parameter properties は
  コンパイルエラー。enum 値は Prisma 生成の const オブジェクトを使う
- `exactOptionalPropertyTypes`: optional プロパティへ `undefined` を明示代入しない
  （`page?: number | undefined` のような明示 union が必要な場合がある）
- `noPropertyAccessFromIndexSignature`: index signature 由来はブラケット記法
  （例 `packageJson["scripts"]`）
- tsc:app（tsconfig.json）は `__tests__` を検査しない。テスト側の型エラーは
  tsconfig.test.json を使う tsc:test でのみ検出される（`bun run type-check` が両方走らせる）

## 0 件強制される cast（grep gate）

`src/`（一部は `scripts/` も）で以下は 0 件を `architecture-boundaries.test.ts` が強制:

- `as any` / `: any` / `<any>` / `Promise<any>` / `Record<string, any>` / `@ts-ignore` / `@ts-expect-error`
- `as Prisma.InputJsonValue` 等の Prisma JSON 直 cast →
  `src/shared/db/prisma-input-json.ts` の `parsePrismaInputJson` 系 helper を使う
- `as Record<string, unknown>` → `src/shared/lib/serialize.ts` の `isRecord` を使う
- `as {`（構造 cast）→ 許可は `src/shared/lib/conform/typed-input-control.ts` のみ
- `as never` / `as SectionConfig` / literal union cast（`as TermsScope` 等）
- `as unknown as FieldMetadata` → typed-input-control.ts のみ許可

non-null assertion（`!`）と angle-bracket assertion は ESLint error（`as` スタイルのみ許可）。

## Prisma 型の流通経路

- `@generated/prisma` の直 import は `src/shared/db` / `src/shared/domain` /
  `src/shared/lib/validations/enums/`（gateway）の 3 箇所のみ
- app 層は gateway（`prisma-types.ts` の enum 値・型、`guards.ts` の `isValid*`、
  `helpers.ts` の `getValid*` / `parse*Filter`）を経由する
- gateway は `@generated/prisma/enums`（値）と `@generated/prisma/browser`（型のみ）から
  しか import できない。`client` entry の import・`Prisma` の値 re-export は禁止
  （`Prisma.JsonNull` の identity 比較が runtime 間で壊れるため）

## React / Zod

- React Compiler 前提のため `react` からの `forwardRef` / `useMemo` / `useCallback` の
  import は禁止（唯一の例外: lexical-draggable-block-plugin.ts）
- Zod 4: エラーメッセージは `{ error: "..." }` 形式、日付は `z.iso.date()` /
  `z.iso.datetime()` のトップレベル形式を使う

検証: `bun run type-check` と
`bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts`
