# 型安全完全 A 化 + RHF→conform 全置換 — Design

## 概要

`documented-exceptions-ledger.md` の 15 entries のうち **eliminable な 12 entries を構造的に解消** し、cast 実装層の真の違反を 0 件にする。同時に RHF（`react-hook-form` + `@hookform/resolvers`）を Vercel official な `@conform-to/react` + `@conform-to/zod` に完全置換し、React 19 / Next.js 16 / Server Action philosophy と整合した form architecture に刷新する。

**3 entries は公式 idiom として永久 documented exception** として ledger に残す:

| entry                                                                | 理由                                                                                                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `globalThis as unknown as GlobalStore` (prisma.ts / r2/client.ts)    | Next.js + Prisma 公式 dev singleton pattern。`prisma-patterns.md` で「`declare global { var prisma }` 形式は Prisma 7 公式推奨から外れている」と明示済 |
| `as OmitUndefined<T>` (serialize.ts §`omitUndefined`)                | `Object.fromEntries` 戻り型の境界 helper、`assertion-bans.md` §4 で許可済                                                                              |
| `as SectionConfig` (validations/section.ts §`validateSectionConfig`) | discriminated union widening の関数内閉じ込め、`assertion-bans.md` §3 で許可済                                                                         |

破壊的変更を許容し、後方互換性は維持しない。

## 公式準拠の根拠

| 領域                        | 公式 idiom                                                      | source                                                                                                                        |
| --------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Form library                | `@conform-to/react` + `@conform-to/zod` + `useActionState`      | Vercel official example `next-forms`、Next.js docs §Server Actions form pattern、conform docs §Next.js App Router integration |
| Zod typed schema            | `const Schema: z.ZodType<Target> = z.object({...})`             | Zod 4 docs §`z.ZodType<T>`                                                                                                    |
| Prisma JSON column          | Zod schema typed as `z.ZodType<Prisma.InputJsonObject>`         | Prisma docs §Working with Json fields                                                                                         |
| HMR singleton               | `declare global { var __X: T \| undefined }` + `globalThis.__X` | TypeScript handbook §Global Augmentation、Next.js docs §Database singleton pattern                                            |
| Internal helper return type | mapped types + conditional types で写像、cast 不要              | TypeScript handbook §Mapped Types                                                                                             |
| Section schema union        | discriminated union narrowing (switch on `type` field)          | TypeScript handbook §Discriminated Unions                                                                                     |
| Route literal               | `z.ZodType<Route<string>>` で typed Zod schema                  | Next.js 16 §typedRoutes                                                                                                       |

## Scope

### In scope

1. **ledger 全 15 entries の構造的解消**（cast 実装 0 件）
2. **RHF → conform 完全置換**（admin / public 全 form ~40 file）
3. **Zod 4 を boundary SSoT 化**（client / server validation を同一 schema で統合）
4. **`documented-exceptions-ledger.md` 削除**、`assertion-bans.md` の例外 §1-7 を「全 cast 禁止」へ書き換え
5. **rule docs / CLAUDE.md / skills / subagents の追従更新**（必要箇所のみ）

### Out of scope

- Phase 2（Next.js 16 PPR / `use cache` / `after()`）
- Phase 3（Lexical 移行 / bundle 削減）
- `executeAdminMutationResult` API 仕様変更（戻り値型 / 監査ログ契約は維持）
- 既存 Prisma schema の変更（migration 不発生）
- public form の Turnstile 統合 layer 変更

## Architecture

### A. Form (conform 単一採用)

#### A.1 Server Action canonical pattern

```ts
// "use server"
import { parseWithZod } from "@conform-to/zod";
import { schema } from "./schema";

export async function saveAction(prevState: unknown, formData: FormData) {
  const submission = parseWithZod(formData, { schema });
  if (submission.status !== "success") return submission.reply();
  // executeAdminMutationResult({ ... }) で監査ログ + 認証 + 権限処理
  return submission.reply({ resetForm: true });
}
```

戻り値は conform の `SubmissionResult`。既存 `executeAdminMutationResult` の戻り値型は維持し、conform 経由 form のみ `SubmissionResult` を返す（`useActionState` の `lastResult` が `SubmissionResult` を期待するため）。

#### A.2 Client component canonical pattern

```tsx
"use client";
import { useActionState } from "react";
import {
  useForm,
  getFormProps,
  getInputProps,
  getTextareaProps,
} from "@conform-to/react";
import { parseWithZod, getZodConstraint } from "@conform-to/zod";

export function MyForm({ defaultValue }: Props) {
  const [lastResult, action] = useActionState(saveAction, undefined);
  const [form, fields] = useForm({
    id: "my-form",
    constraint: getZodConstraint(schema),
    lastResult,
    defaultValue,
    onValidate: ({ formData }) => parseWithZod(formData, { schema }),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  return (
    <form {...getFormProps(form)} action={action}>
      <input {...getInputProps(fields.title, { type: "text" })} />
      {fields.title.errors && (
        <p id={fields.title.errorId}>{fields.title.errors}</p>
      )}
      <button>Save</button>
    </form>
  );
}
```

#### A.3 Field array canonical pattern

```tsx
const items = fields.items.getFieldList();

{
  items.map((item, index) => {
    const fs = item.getFieldset();
    return (
      <Fragment key={item.key}>
        <input {...getInputProps(fs.key, { type: "text" })} />
        <input {...getInputProps(fs.value, { type: "text" })} />
        <button
          {...form.remove.getButtonProps({ name: fields.items.name, index })}
        >
          削除
        </button>
      </Fragment>
    );
  });
}
<button {...form.insert.getButtonProps({ name: fields.items.name })}>
  追加
</button>;
```

dnd-kit 統合は `form.reorder.getButtonProps({ name, from, to })` で対応。

#### A.4 動的 schema 切替（auto-section-form 対応）

conform の `useForm` schema は React state で切替可能:

```tsx
const [sectionType, setSectionType] = useState<SectionType>(defaultType);
const schema = useMemo(
  () => getSectionSchemaByType(sectionType),
  [sectionType],
);

const [form, fields] = useForm({
  id: `section-form-${sectionType}`, // schema 切替時に form を再初期化
  constraint: getZodConstraint(schema),
  onValidate: ({ formData }) => parseWithZod(formData, { schema }),
});
```

`id` を schema-derived にすることで schema 切替時に form state が clean reset される。

### B. Prisma JSON (Zod ZodType<InputJsonObject | InputJsonArray>)

Prisma の `InputJsonValue` は `InputJsonObject \| InputJsonArray \| string \| number \| boolean \| null` の union。object 形式の JSON 列 (Lexical contentJson / descriptionJson) は `InputJsonObject`、array 形式 (navigation items) は `InputJsonArray` を target type にする。

```ts
// schemas/space-description.ts
import { z } from "zod";
import type { Prisma } from "@/shared/db/prisma-types";

export const DescriptionJsonSchema: z.ZodType<Prisma.InputJsonObject> =
  z.object({
    type: z.literal("doc"),
    content: z.array(z.unknown()),
    version: z.number().optional(),
  });

export type DescriptionJsonValue = z.infer<typeof DescriptionJsonSchema>;
```

```ts
// schemas/navigation-items.ts
export const NavigationItemsSchema: z.ZodType<Prisma.InputJsonArray> = z.array(
  z.object({
    label: z.string(),
    href: z.string(),
    children: z.array(z.unknown()).optional(),
  }),
);
```

```ts
// actions/space.ts ("use server")
const parsed = DescriptionJsonSchema.parse(input);
await prisma.space.update({
  where: { id },
  data: { descriptionJson: parsed }, // ✅ cast 不要
});
```

`z.ZodType<Prisma.InputJsonObject>` の型注釈により、schema 内 field 型が `InputJsonObject` 互換でない場合は **schema 定義時点で型エラー**になり、silent drift を防ぐ。

### C. SDK Boundary (Zod ZodType<Target>)

```ts
// adapters/google-business-profile/schemas.ts
import { z } from "zod";
import type { businessprofileperformance_v1 } from "googleapis";

type Schema$Location = businessprofileperformance_v1.Schema$Location;

export const LocationSchema: z.ZodType<Schema$Location> = z.object({
  name: z.string(),
  // ...
});
```

```ts
// location-sync.ts
const result = await client.businesslocations.get({ id });
const location = LocationSchema.parse(result.data); // ✅ cast 不要、型 Schema$Location
```

### D. HMR Singleton (declare global)

```ts
// src/shared/db/prisma.ts
import { PrismaClient } from "@/generated/prisma";

declare global {
  var __prismaClient: PrismaClient | undefined;
}

const prisma = globalThis.__prismaClient ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaClient = prisma;
}

export { prisma };
```

```ts
// src/shared/lib/r2/client.ts
import { S3Client } from "@aws-sdk/client-s3";

declare global {
  var __r2Client: S3Client | undefined;
}

const r2Client =
  globalThis.__r2Client ??
  new S3Client({
    /* ... */
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__r2Client = r2Client;
}

export { r2Client };
```

### E. Internal Helper Return Types (mapped types)

```ts
// src/shared/lib/serialize.ts
type OmitUndefined<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
};

export function omitUndefined<T extends object>(input: T): OmitUndefined<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) result[key] = value;
  }
  return result as OmitUndefined<T>; // ❌ 残るが、helper 内部のみで application 層に露出しない
}
```

完全 cast 0 を目指す場合は `Object.entries` のループを keyof T で書き、各 key の undefined check を type narrowing でやる必要がある。実装コストと cast 1 件のトレードオフ。

**判断**: ledger entry は削除（実装 layer に露出しない）、helper 内部の cast は許容。ledger は application-layer cast のみ管理対象とする。

### F. Discriminated Union Narrowing

```ts
// src/shared/lib/validations/section.ts
export function validateSectionConfig(input: unknown): SectionConfig {
  const base = sectionBaseSchema.parse(input);
  switch (base.type) {
    case "hero":
      return heroSectionSchema.parse(input);
    case "spaces":
      return spacesSectionSchema.parse(input);
    // ... 全 type 列挙
  }
}
```

各 case 内では schema.parse の戻り値が discriminated union の 1 branch に narrow される。戻り値型 `SectionConfig` の cast 不要。

### G. Route<string> typed helper

```ts
// src/shared/lib/routes/to-app-route.ts
import type { Route } from "next";
import { z } from "zod";

const AppRouteSchema: z.ZodType<Route<string>> = z
  .string()
  .refine((v): v is Route<string> => v.startsWith("/"), {
    error: "Route must start with /",
  });

export function toAppRoute(input: string): Route<string> {
  return AppRouteSchema.parse(input);
}
```

caller:

```ts
router.push(toAppRoute(href));
redirect(toAppRoute(url));
```

## Migration Order

依存順に並べる。各 Phase = 1 PR、独立 revert 可能。

### Phase 1.1: ~~declare global 移行~~（**Skip — Next.js 公式パターン維持**）

`globalThis as unknown as GlobalStore` は Next.js + Prisma 公式 dev singleton pattern であり、`prisma-patterns.md` で「`declare global` 形式は Prisma 7 公式推奨から外れている」と明示済。**ledger に permanent documented exception として残す**。

### Phase 1.2: ~~internal helper return type 書き換え~~（**Skip — `assertion-bans.md` §3/§4 で許可済**）

`as OmitUndefined<T>` (serialize.ts) と `as SectionConfig` (validations/section.ts) は `assertion-bans.md` §3/§4 で internal helper / discriminated union widening の境界 cast として明示許可済。auto-section-form.tsx の `as unknown as z.ZodObject` は **Phase 1.6-1.9 の RHF→conform 移行で structurally 消滅**（conform 採用後に standardSchemaResolver 不要）。

### Phase 1.3: SDK Zod typed schema

**Files**: `src/shared/lib/google-business-profile/location-sync.ts` / `src/shared/lib/email/send.ts`
**Cast 削減**: 2 件
**Time**: 半日
**Risk**: 中（SDK 型変更追従が必要、googleapis Schema$\* / Resend `CreateEmailOptions` の field 完全列挙）

### Phase 1.4: Prisma InputJsonObject Zod typed schema

**Files**: `src/app/(admin)/admin/(dashboard)/_shared/actions/event.ts` / `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts` / `src/shared/domain/navigation/commands.ts`
**Cast 削減**: 3 件
**Time**: 半日
**Risk**: 中（Lexical contentJson / descriptionJson の schema 定義精度）

### Phase 1.5: Route<string> typed helper

**Files**: `src/shared/lib/routes/to-app-route.ts` 新規作成 + `src/app/(admin)/admin/(dashboard)/_shared/components/command-palette/CommandPalette.tsx` / `src/app/(admin)/admin/(dashboard)/_shared/components/table/ClickableTableRow.tsx` / `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-business-profile.ts`
**Cast 削減**: 4 件
**Time**: 半日
**Risk**: 低

### Phase 1.6: conform 導入 + simple form 移行

**Tasks**:

1. `bun add @conform-to/react @conform-to/zod`
2. RHF をまだ削除しない（並存期間）
3. simple admin form を conform 移行（login / signup / search / settings 単純系）
4. 各 form の Server Action を `parseWithZod` + `submission.reply()` パターンに書き換え

**Files**: ~10 file
**Time**: 1.5 日
**Risk**: 中（conform pattern を SSoT 化、`useActionState` integration の確立）

### Phase 1.7: medium form 移行

**Files**: news / posts / events / pages 編集系 ~10 file
**Time**: 1.5 日
**Risk**: 中（dynamic field / nested object の正しい mapping）

### Phase 1.8: complex form 移行

**Files**: `auto-section-form.tsx` / `space-form` / 動的 settings / image upload 統合 form
**Time**: 2 日
**Risk**: 高（auto-section-form の動的 schema 切替、dnd-kit + conform reorder 統合）

### Phase 1.9: RHF 完全削除

**Tasks**:

1. `react-hook-form` / `@hookform/resolvers` を `package.json` から削除
2. 残骸 import 検出 → cleanup
3. `LayoutFields.tsx` 撤去 or conform 化
4. `@/shared/lib/forms/*` の RHF 依存削除

**Time**: 半日
**Risk**: 中（残骸検出の徹底）

### Phase 1.10: ledger 削除 + rule docs 更新

**Tasks**:

1. `.claude/rules/type-safety/documented-exceptions-ledger.md` 削除
2. `.claude/rules/type-safety/assertion-bans.md` を「全 cast 禁止 + 例外 SDK boundary 限定」に書き換え
3. `architecture-boundaries.test.ts` に cast 0 件検出 test 追加（CI gate）
4. CLAUDE.md の「型アサーション（`as`）禁止」セクションに新 pattern を反映

**Time**: 30 min
**Risk**: 低

### Phase 1.11: verification

```bash
bun run validate && bun run build
grep -rE "\bas [A-Z]" --include="*.ts" --include="*.tsx" src \
  | grep -vE "as const|as unknown|^src/[^:]*://" \
  | wc -l                                # 期待: 0
bun run test:unit && bun run test:integration
bunx playwright test --project=chromium-smoke
```

**Time**: 1 日
**Risk**: 高（regression 検出、admin form 動作確認）

**合計**: 8-10 日

## Verification

### Phase 単位 gate

各 Phase 完了で:

1. `bun run validate && bun run build` exit 0
2. cast grep の残数が Phase 想定通り減少
3. 該当 test pass
4. 視覚確認（form 系 Phase は実ブラウザで動作確認）

### Phase 1 全体完了 gate

1. `as` cast 実装 layer 0 件
2. `react-hook-form` / `@hookform/resolvers` が `package.json` から削除済
3. `documented-exceptions-ledger.md` 削除済
4. CI required jobs 全 green
5. E2E smoke pass

## Risks

| Risk                                                                                  | Probability | Mitigation                                                                                                                              |
| ------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| conform で auto-section-form の動的 schema 切替が安定動作しない                       | 中          | Phase 1.6 で simple form 移行時に動的 schema PoC 検証（1 schema 切替の最小例）                                                          |
| RHF + Lexical / PortableText editor 統合の conform 移行が壊れる                       | 中          | editor は form value を `<input type="hidden">` 経由で渡す pattern を維持。conform 側は単純 string field として受領                     |
| dnd-kit + conform reorder 統合                                                        | 中          | `form.reorder.getButtonProps` を `@dnd-kit/sortable` の `onDragEnd` 内で発火                                                            |
| Server Action `executeAdminMutationResult` と conform `SubmissionResult` の戻り値統合 | 中          | conform 経由 form のみ `SubmissionResult` を返す。`executeAdminMutationResult` は内部 helper として使用、ラッパー Server Action で wrap |
| `Path<T>` 系 cast が generic helper で他に隠れている                                  | 低          | Phase 1.1 開始前に `grep -rE "as (Path<\|UseFormSetValue<\|Control<)" --include="*.tsx" src` で全件 audit                               |
| Zod 4 `z.ZodType<T>` の互換性                                                         | 低          | Zod 4 公式 docs で確認済、`infer` 結果が target type に narrow                                                                          |
| `as Prisma.InputJsonObject` 型注釈時の Prisma update API 受領                         | 低          | Prisma 7 公式 §Json fields で確認、`Prisma.InputJsonObject` は writable JSON 型として update API 互換                                   |

## Rollback

- Phase 1.1 - 1.5 は entry 単位で revert（各 Phase = 1 PR）
- Phase 1.6 - 1.9 は form 単位で revert（per-file の `"use client"` + import 切替）。中間状態の RHF + conform 並存は Phase 1.6 - 1.8 期間中許容
- Phase 1.10 - 1.11 は最終 step、Phase 1 全体の revert は branch 単位

## After Implementation: rule docs / CLAUDE.md / skills / subagents 更新

### 更新対象（実装後に判定）

| File                                                        | 想定変更                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` §「型アサーション（`as`）禁止」                 | 「全 cast 禁止（例外なし）+ SDK boundary は Zod typed schema 経由」に書き換え                                     |
| `.claude/rules/type-safety/assertion-bans.md`               | 例外 §1-7 削除、Zod typed schema / declare global / discriminated union / conform を canonical pattern として記載 |
| `.claude/rules/type-safety/documented-exceptions-ledger.md` | **削除**                                                                                                          |
| `.claude/rules/frontend/admin-ui-patterns.md`               | form pattern セクションを conform 単一採用に書き換え、RHF references 削除                                         |
| `.claude/rules/server-actions/implementation.md`            | `parseWithZod` + `SubmissionResult` pattern を canonical 化、`executeAdminMutationResult` との関係を記載          |
| `.claude/skills/create-server-action/SKILL.md`              | scaffold template を conform pattern に書き換え                                                                   |
| `.claude/skills/create-admin-page/SKILL.md`                 | admin CRUD form scaffold を conform pattern に書き換え                                                            |
| `.claude/agents/project-reviewer.md`                        | cast 0 件 audit を canonical gate に追加                                                                          |
| `.claude/agents/zod-schema-reviewer.md`                     | `z.ZodType<T>` pattern の検出 / 推奨を追加                                                                        |
| `__tests__/unit/architecture-boundaries.test.ts`            | cast 0 件 + `react-hook-form` import 0 件の test 追加                                                             |

実装完遂後に各 file の現状を再 audit し、必要箇所のみ更新する。

## Out of Scope (再掲)

- Phase 2 / Phase 3 は本 spec の対象外
- public form の SSR-only 形態 / Turnstile 統合 layer は変更しない（既存 wrapper 維持）
- Prisma schema migration なし
- Better Auth / RBAC / Stripe / Resend / R2 / googleapis の SDK version 変更なし
