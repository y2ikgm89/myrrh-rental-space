---
paths:
  - "src/shared/lib/conform/**/*.ts"
  - "src/shared/lib/serialize.ts"
  - "src/shared/db/prisma-input-json.ts"
  - "src/shared/lib/routes/**/*.ts"
  - "src/shared/lib/google-business-profile/schemas.ts"
  - "src/shared/lib/email/schemas.ts"
  - "__tests__/unit/architecture-boundaries.test.ts"
---

# 型安全 / 型アサーションの規約

`src/` は明示 `any` / 非null assertion (`foo!`) / `@ts-ignore`・`@ts-expect-error`・`@ts-nocheck` /
型関連 `eslint-disable` を **すべて 0 件**に保つ。`tsconfig.json` は strict +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noPropertyAccessFromIndexSignature` +
`verbatimModuleSyntax` + `erasableSyntaxOnly` で実質最大強度。

> この doc は 2026-05-18 に廃止した旧 `assertion-bans.md` / `documented-exceptions-ledger.md`
> （`.claude` 統合で削除）の後継 SSoT。テスト・コメント中の旧 `§` 章番号参照はこの doc に集約した。

## 型アサーション (`as`) の原則

優先順位は **実行時検証 > `satisfies` > 局所 `as`**。

- 外部入力（HTTP body / cookie / `JSON.parse` / 外部 API レスポンス）は `unknown` で受け、
  Zod `safeParse` か type-guard で narrow してから使う。生の `any` 参照は禁止。
- リテラル整合は `as Foo` ではなく `satisfies Foo` で型を保ったまま検証する。
- `as never` / `as <Enum>` は禁止。実行時検証（`src/shared/lib/validations/enums/guards.ts`）か
  正しい型付けで解消する。
- どうしても TS の型システムで表現できない FW 境界の `as` は、下記 **SSoT helper の内部に閉じ込め**、
  呼び出し側に cast を漏らさない。

## `as` を許可する SSoT helper（外部使用は grep gate で禁止）

| helper                                              | 吸収する FW 境界                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/shared/lib/conform/typed-input-control.ts`     | conform `FieldMetadata<T>` / `DefaultValue<T>` の generic invariance              |
| `src/shared/lib/routes/to-app-route.ts`             | Next.js typedRoutes `Route<string>`（`z.custom<T>`）                              |
| `src/shared/lib/google-business-profile/schemas.ts` | googleapis `Schema$Location`（`z.custom<T>`）                                     |
| `src/shared/lib/email/schemas.ts`                   | resend `CreateEmailOptions`（`z.custom<T>`）                                      |
| `src/shared/db/prisma-input-json.ts`                | `Prisma.InputJsonValue`（再帰 type-guard。`as Prisma.InputJsonValue` 直書き禁止） |
| `src/shared/lib/serialize.ts`                       | `Object.keys`/`entries` の構造的制約（`keysOf`/`entriesOf`/`omitUndefined`）      |

## 強制レイヤ（二重化）

1. **ESLint**（`eslint.config.mjs` typescript-rules）: `@typescript-eslint/no-non-null-assertion`（`!` 禁止）
   - `@typescript-eslint/consistent-type-assertions`（`assertionStyle: "as"`、angle-bracket 禁止）。
     型情報不要の構文 ratchet。`assertionStyle: "never"` は正当な `as` literal narrowing を一律違反化し
     disable 散布を招くため**採用しない**。
2. **grep gate**（`__tests__/unit/architecture-boundaries.test.ts`）: 上記 SSoT helper 以外での
   `as unknown as FieldMetadata` / SDK 境界 cast / `as Prisma.InputJsonValue` / `as SectionConfig` を
   src 全体で 0 件強制。型情報を要する「特定 helper のみ許可」の精密強制を担う。
