---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "scripts/**/*.ts"
---

# 型安全

TypeScript 6 / `strict` に加えて `noUncheckedIndexedAccess` ・
`exactOptionalPropertyTypes` ・ `erasableSyntaxOnly` ・
`noPropertyAccessFromIndexSignature` ・ `verbatimModuleSyntax` が有効。
typed ESLint（`no-unsafe-*` / `no-floating-promises` / `no-misused-promises` /
`restrict-template-expressions` など）もフルセットで error。

## 使わないもの

- **非 null assertion `!`** — ESLint error。
- **`as` 型アサーション**（literal narrowing を除く）。call-site の
  `as unknown as X` / `as Record<string, unknown>` / `as { … }` / `as never` /
  `as Prisma.(Input)?Json*` は 0 件が現状値で、ゲートが増加を落とす。
- angle-bracket 形式のアサーション。
- `@ts-ignore` / `@ts-expect-error` / `any`（`scripts/` を含む）。
- `JSON.parse(JSON.stringify(...))` による型逃がし。

## 代わりに通す SSoT helper

| 境界                          | helper                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| unknown → object              | `isRecord`（段階的 narrowing）                                                                                |
| Prisma の JSON 列             | `asPrismaInputJsonValue` / `parsePrismaInputJson` / `clonePrismaInputJson`（`@/shared/db/prisma-input-json`） |
| googleapis `Schema$Location`  | `src/shared/lib/google-business-profile/schemas.ts`                                                           |
| resend `CreateEmailOptions`   | `src/shared/lib/email/schemas.ts`                                                                             |
| Next.js `Route<string>`       | `toAppRoute` / `safeToAppRoute`（`src/shared/lib/routes/to-app-route.ts`）                                    |
| conform の generic invariance | `typed-input-control` helper                                                                                  |

helper の内部に `z.custom<T>()` が 1 箇所だけあるのが許される形で、呼び出し側の
cast は 0 件。強制は `__tests__/unit/architecture-boundaries.test.ts` と
`__tests__/unit/architecture/type-safety-cast-and-cache-tag-drift.test.ts`。

`SectionConfig` のような判別 union を widening cast で潰さない
（`__tests__/unit/architecture/section-config-widening-cast.test.ts`）。

## 日時

`src/shared/lib/date-format.ts` が JST の SSoT。

- `Intl.DateTimeFormat` / `toLocale*String` は `timeZone` 指定必須。
- `new Date(`${date}T${time}`)` の naive parse は禁止（`datetime-local` の値を
  ローカルタイムゾーン依存で解釈してしまう）。
- `toISOString().slice(0, 10)` / `.split("T")[0]` のような UTC 前提の日付切り出しは禁止。
- `date-format` モジュールを `mock.module` で差し替えない
  （`__tests__/unit/architecture/date-format-not-mocked.test.ts`）。

## 型ではなく仕組みで守っているもの

- Zod の `.max()` は union の中にあると `getZodConstraint` が拾えない。
  上限の有無を確かめたいときは制約の申告ではなく `safeParse` の挙動で見る。
- Prisma の生成型を手で写した const は `satisfies` で受ける
  （`__tests__/unit/architecture/prisma-shape-consts-satisfies.test.ts`）。
