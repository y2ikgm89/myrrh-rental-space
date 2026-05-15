---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# 型アサーション documented exceptions 完全 ledger

> 2026-05-15 確立。`assertion-bans.md` §1-7 の許可例外を全て instance level で
> 列挙し、audit grep の "as cast 違反" 偽陽性を排除する。新規 cast 追加時は
> 必ず本 ledger に追記すること。

## 完全 ledger (2026-05-15 時点)

| File                                                                                             |   Line   | Cast                                                      |         例外区分          | Justification                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | :------: | --------------------------------------------------------- | :-----------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/db/prisma.ts`                                                                        |    53    | `globalThis as unknown as GlobalStore`                    |         §SDK境界          | Next.js 公式推奨 dev singleton pattern (HMR safe)                                                                                                                              |
| `src/shared/lib/r2/client.ts`                                                                    |    23    | `globalThis as unknown as GlobalStore`                    |         §SDK境界          | 同上 (R2 S3Client singleton)                                                                                                                                                   |
| `src/shared/lib/serialize.ts`                                                                    |   486    | `as OmitUndefined<T>`                                     |    §4 internal helper     | `Object.fromEntries` 型 widening を `omitUndefined` 内部で吸収                                                                                                                 |
| `src/shared/lib/validations/section.ts`                                                          |   251    | `as SectionConfig`                                        |     §3 union widening     | `validateSectionConfig` 内部のみ、戻り値型注釈で union widening 関数内閉じ込め                                                                                                 |
| `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/LayoutFields.tsx` | 176-177  | `as Path<T>`                                              | §5 RHF generic invariance | `Path<T>` は static literal union のため generic body で証明不可 (TS limitation)                                                                                               |
| `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/LayoutFields.tsx` | 188, 193 | `as UseFormSetValue<FieldValues>`                         | §5 RHF generic invariance | `UseFormSetValue<T>` invariant、Pure + Connected wrapper の境界 cast                                                                                                           |
| `src/shared/lib/routes/to-app-route.ts`                                                          |  16-25   | internal `as Route<string>` via `z.custom<Route<string>>` |     §typedRoutes境界      | `toAppRoute()` / `safeToAppRoute()` SSoT 内部のみ。Zod 4 `z.custom<T>` で 1 箇所に集約                                                                                         |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`     |   146    | `as unknown as z.ZodObject<...>`                          | §7 standardSchemaResolver | `configSchema` の dynamic z.object を RHF resolver 境界に渡すための単一 file 内 cast                                                                                           |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/event.ts`                                     |    47    | `as Prisma.InputJsonValue`                                |      §2 Prisma JSON       | `architecture-boundaries` test が `@/shared/db/*` prefix match のため admin action 内から `parsePrismaInputJson` import 不可。domain layer parse 移動が必要（別 Phase で対応） |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts`                                     |    50    | `as Prisma.InputJsonValue`                                |           同上            | 同上 (descriptionJson)                                                                                                                                                         |

## 監査時の対処

**`grep -rE "\bas [A-Z]" --include="*.ts" --include="*.tsx" src` の hit 件数**:

- ~75 件 (`as const` / `as unknown` 除外後 ~5-10 件)
- うち上記 ledger の **10 件は全て documented exceptions** (`assertion-bans.md` §1-7 + typedRoutes patterns)
- import alias (`{ X as Y }`) は型 cast ではないため対象外

**実質違反の数**: **0 件**。`as` cast 軸 audit は本 ledger を参照して「documented exceptions 外 0 件 → 型安全 A」と判定する。

## 新規追加時のルール

1. cast を追加する PR 内で本 ledger を必ず更新
2. 「Justification」列に技術的根拠を記述 (TS limitation / SDK boundary / etc.)
3. 例外区分は `assertion-bans.md` §1-7 のいずれかに紐づけ (該当なしの場合は cast 自体を再検討)
4. PR description に「型 cast 追加: ledger 更新済」を明記
