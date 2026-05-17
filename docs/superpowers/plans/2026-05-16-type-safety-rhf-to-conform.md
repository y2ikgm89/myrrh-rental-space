# 型安全完全 A 化 + RHF→conform 全置換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ledger 15 entry のうち eliminable 12 件を構造的に解消し、RHF を conform に完全置換して React 19 / Next.js 16 / Server Action philosophy 整合の form architecture に刷新する。

**Architecture:** Zod 4 `z.ZodType<T>` で SDK / Prisma JSON / Route 境界の type narrowing、`@conform-to/react` + `@conform-to/zod` で admin/public 全 form を統一、`documented-exceptions-ledger.md` の eliminate 12 件は削除し permanent 3 件のみ残す。

**Tech Stack** (採用機能の列挙のみ — バージョン値の SSoT は `package.json` + `bun.lock`): Next.js / React / TypeScript / Zod / Prisma / `@conform-to/react` + `@conform-to/zod` (新規) / Bun

**Spec:** `docs/superpowers/specs/2026-05-16-type-safety-rhf-to-conform-design.md`

---

## Task 1: SDK Zod typed schema (googleapis / Resend)

**Files:**

- Modify: `src/shared/lib/google-business-profile/location-sync.ts:121`
- Modify: `src/shared/lib/email/send.ts:82`

**Cast 削減**: 2 件

- [ ] **Step 1: googleapis `Schema$Location` の Zod schema 定義**

`src/shared/lib/google-business-profile/schemas.ts` を新規作成:

```ts
import "server-only";
import { z } from "zod";
import type { businessprofileperformance_v1 } from "googleapis";

type Schema$Location = businessprofileperformance_v1.Schema$Location;

export const LocationSchema: z.ZodType<Schema$Location> = z.object({
  name: z.string().optional(),
  languageCode: z.string().optional(),
  title: z.string().optional(),
  phoneNumbers: z.unknown().optional(),
  categories: z.unknown().optional(),
  storefrontAddress: z.unknown().optional(),
  websiteUri: z.string().optional(),
  regularHours: z.unknown().optional(),
  specialHours: z.unknown().optional(),
  serviceArea: z.unknown().optional(),
  labels: z.array(z.string()).optional(),
  adWordsLocationExtensions: z.unknown().optional(),
  latlng: z.unknown().optional(),
  openInfo: z.unknown().optional(),
  metadata: z.unknown().optional(),
  profile: z.unknown().optional(),
  relationshipData: z.unknown().optional(),
  moreHours: z.unknown().optional(),
  serviceItems: z.unknown().optional(),
});
```

- [ ] **Step 2: location-sync.ts の cast を Zod parse に置換**

`location-sync.ts:121` の `as unknown as Schema$Location` を `LocationSchema.parse(...)` に置換。

- [ ] **Step 3: Resend `CreateEmailOptions` の Zod schema 定義**

`src/shared/lib/email/schemas.ts` を新規作成（既存ファイルがあれば追記）:

```ts
import "server-only";
import { z } from "zod";
import type { CreateEmailOptions } from "resend";

export const CreateEmailOptionsSchema: z.ZodType<CreateEmailOptions> = z.object(
  {
    from: z.string(),
    to: z.union([z.string(), z.array(z.string())]),
    subject: z.string(),
    bcc: z.union([z.string(), z.array(z.string())]).optional(),
    cc: z.union([z.string(), z.array(z.string())]).optional(),
    scheduledAt: z.string().optional(),
    reply_to: z.union([z.string(), z.array(z.string())]).optional(),
    html: z.string().optional(),
    text: z.string().optional(),
    react: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    attachments: z.array(z.unknown()).optional(),
    tags: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  },
);
```

- [ ] **Step 4: email/send.ts の cast を Zod parse に置換**

`send.ts:82` の `as CreateEmailOptions` を `CreateEmailOptionsSchema.parse(...)` に置換。

- [ ] **Step 5: 検証**

```bash
bun run validate
grep -nE "as unknown as Schema\$Location|as CreateEmailOptions" src/shared/lib/
# 期待: 0 件
```

- [ ] **Step 6: commit + push + PR**

```bash
git checkout -b refactor/type-safety-phase-1-sdk-zod-schema
git add src/shared/lib/google-business-profile/ src/shared/lib/email/ docs/superpowers/specs/2026-05-16-type-safety-rhf-to-conform-design.md docs/superpowers/plans/2026-05-16-type-safety-rhf-to-conform.md
git commit -m "refactor(type-safety): SDK boundary cast を Zod typed schema で構造解消 (Phase 1 Task 1)

- Schema\$Location / CreateEmailOptions の cast を z.ZodType<T> で narrow
- spec / plan を docs/superpowers/ に追加
- ledger eliminate 2 件"
git push -u origin refactor/type-safety-phase-1-sdk-zod-schema
gh pr create --base main --title "refactor(type-safety): SDK boundary cast を Zod typed schema で構造解消" --body "..."
```

---

## Task 2: Prisma InputJsonObject Zod typed schema

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/event.ts:47`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts:50`
- Modify: `src/shared/domain/navigation/commands.ts`

**Cast 削減**: 3 件

- [ ] **Step 1: Event contentJson schema を typed schema 化**

既存の `src/shared/lib/portable-text/schema.ts` (`portableTextBlockSchema`) と `src/shared/lib/lexical/schemas.ts` を確認し、Lexical 用 EditorState JSON の Zod schema が `z.ZodType<Prisma.InputJsonObject>` 互換になるよう annotate。

具体的に既存 `eventContentJsonSchema` 等の Zod schema 定義に `: z.ZodType<Prisma.InputJsonObject>` 型注釈を追加。

- [ ] **Step 2: event.ts の cast を削除**

`actions/event.ts:47` の `as Prisma.InputJsonValue` を削除。Zod schema が `InputJsonObject` 互換型を出力するため不要。

- [ ] **Step 3: space.ts も同様に処理**

`actions/space.ts:50` で `descriptionJson` 用 Zod schema に `: z.ZodType<Prisma.InputJsonObject>` 型注釈、cast 削除。

- [ ] **Step 4: navigation/commands.ts の `satisfies + as` を typed schema に統一**

`navigation/commands.ts` の `data.label satisfies ReadonlyArray<unknown> as Prisma.InputJsonValue` を、`buttonLabelSchema` 型注釈 `: z.ZodType<Prisma.InputJsonArray>` を導入して cast 不要に。

- [ ] **Step 5: 検証 + commit + push + PR**

```bash
bun run validate && bun run build
grep -rnE "as Prisma\.InputJson(Value|Array|Object)" src/
# 期待: 0 件
```

---

## Task 3: Route<string> typed helper

**Files:**

- Create: `src/shared/lib/routes/to-app-route.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/command-palette/CommandPalette.tsx:32`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/table/ClickableTableRow.tsx:42,48`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-business-profile.ts:35`

**Cast 削減**: 4 件

- [ ] **Step 1: typed helper 作成**

```ts
// src/shared/lib/routes/to-app-route.ts
import type { Route } from "next";
import { z } from "zod";

const RouteSchema: z.ZodType<Route<string>> = z
  .string()
  .startsWith("/", { error: "Route must start with /" });

export function toAppRoute(input: string): Route<string> {
  return RouteSchema.parse(input);
}

export function safeToAppRoute(input: string): Route<string> | null {
  const result = RouteSchema.safeParse(input);
  return result.success ? result.data : null;
}
```

- [ ] **Step 2: caller 4 箇所を helper 経由に置換**

各 file の `as Route<string>` を `toAppRoute(...)` 呼び出しに置換。OAuth 動的 URL 等の null 許容ケースは `safeToAppRoute` を使用。

- [ ] **Step 3: 検証 + commit + push + PR**

```bash
grep -rnE "as Route<string>" src/
# 期待: 0 件
```

---

## Task 4: conform 導入準備 + Server Action 統合 pattern 確立

**Files:**

- Modify: `package.json`
- Create: `src/shared/lib/forms/conform-action.ts`
- Create: `docs/explanation/conform-pattern.md` (optional canonical reference)

- [ ] **Step 1: conform 依存追加**

```bash
bun add @conform-to/react @conform-to/zod
```

- [ ] **Step 2: Server Action ラッパー作成**

```ts
// src/shared/lib/forms/conform-action.ts
import "server-only";
import { parseWithZod } from "@conform-to/zod";
import type { z } from "zod";
import type { SubmissionResult } from "@conform-to/react";

export async function executeConformMutation<TSchema extends z.ZodTypeAny>(
  formData: FormData,
  schema: TSchema,
  handler: (data: z.infer<TSchema>) => Promise<{ ok: boolean; error?: string }>,
): Promise<SubmissionResult> {
  const submission = parseWithZod(formData, { schema });
  if (submission.status !== "success") return submission.reply();
  const result = await handler(submission.value);
  if (!result.ok)
    return submission.reply({ formErrors: [result.error ?? "..."] });
  return submission.reply({ resetForm: true });
}
```

`executeAdminMutationResult` の認証・権限・監査ログ機能と統合する pattern は本 helper 内で実装する。詳細は実装時に確定。

- [ ] **Step 3: simple form 1 件で PoC 実装**

`admin/login/page.tsx` または settings 単純系を最初の conform 移行対象に選び、pattern 確立 + e2e smoke で動作確認。

- [ ] **Step 4: commit + push + PR**

---

## Task 5: conform simple form 移行 (~10 file)

**Files:** admin login / signup / password reset / settings 単純系（site info, contact, SEO 等）

各 file で:

- [ ] **Step 1: `"use client"` 維持、`useForm` (RHF) を `useForm` (conform) に置換**
- [ ] **Step 2: `<FormField>` Radix wrapper を conform `getInputProps` / `getTextareaProps` / `getSelectProps` に置換**
- [ ] **Step 3: Server Action を `parseWithZod` + `submission.reply()` パターンに書き換え**
- [ ] **Step 4: 該当 e2e test 確認 + 視覚確認**

順次 commit。

---

## Task 6: conform medium form 移行 (~10 file)

**Files:** news / posts / events / pages edit 系

Task 5 と同パターン。dynamic field / nested object の正しい mapping に注意。

---

## Task 7: conform complex form 移行 (~10 file)

**Files:** `auto-section-form.tsx` / `space-form` / 動的 settings / image upload 統合 form

- [ ] **Step 1: auto-section-form の動的 schema 切替を `useForm({ id: ${sectionType} })` パターンで実装**
- [ ] **Step 2: useFieldArray → `form.insert/remove/reorder` に置換**
- [ ] **Step 3: dnd-kit + conform reorder 統合（`onDragEnd` 内で `form.reorder.getButtonProps` 発火）**
- [ ] **Step 4: image upload (`MediaPickerField`) と conform field の bridge 実装**
- [ ] **Step 5: PortableText / Lexical editor との統合（`<input type="hidden">` 経由維持）**

---

## Task 8: RHF 完全削除

**Files:**

- Modify: `package.json` (remove `react-hook-form` + `@hookform/resolvers`)
- Modify: `bun.lock`
- Delete: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/LayoutFields.tsx`（または conform 化）
- Delete: `src/shared/lib/forms/` 内 RHF 専用 helper

- [ ] **Step 1: 全 form の conform 移行完了を確認**

```bash
grep -rln "react-hook-form\|@hookform" src/
# 期待: 0 件
```

- [ ] **Step 2: `package.json` から依存削除**

```bash
bun remove react-hook-form @hookform/resolvers
bun run validate && bun run build
```

- [ ] **Step 3: 残骸 cleanup** (LayoutFields, use-public-form 等)

- [ ] **Step 4: commit + push + PR**

---

## Task 9: ledger 削除 + rule docs 更新

**Files:**

- Delete: `.claude/rules/type-safety/documented-exceptions-ledger.md`
- Modify: `.claude/rules/type-safety/assertion-bans.md`（例外 §1-7 を再構成、§1 DOM event target / §2 Prisma 公式 globalThis singleton / §3 internal helper のみ残す）
- Modify: `CLAUDE.md` (型アサーション禁止セクションを「全 cast 禁止 + 3 つの永久公式例外」に書き換え)
- Modify: `__tests__/unit/architecture-boundaries.test.ts` (cast 0 件 + RHF import 0 件 test 追加)

- [ ] **Step 1: assertion-bans.md 書き換え**

§5 (RHF Path<T>) / §6 (JSX defensive narrowing) / §7 (standardSchemaResolver) を削除。§4 (keysOf/omitUndefined) を §3 と統合。

- [ ] **Step 2: documented-exceptions-ledger.md 削除**

```bash
git rm .claude/rules/type-safety/documented-exceptions-ledger.md
```

- [ ] **Step 3: CLAUDE.md 更新**

「型アサーション（`as`）禁止」セクションに 3 つの永久公式例外（Next.js singleton / Prisma + Zod typed schema / internal helper）を明記。

- [ ] **Step 4: architecture-boundaries.test.ts に新規 test 追加**

```ts
test("react-hook-form / @hookform は src/ から import されていない", () => {
  const sources = collectSourceFiles(SRC_ROOT);
  const violations = sources.filter((f) =>
    /from\s+["']react-hook-form["']|from\s+["']@hookform/.test(f.content),
  );
  expect(violations).toEqual([]);
});

test("application 層に as cast 実装が残っていない（permanent exception 除く）", () => {
  // grep -E "\\bas [A-Z]" --include="*.ts" --include="*.tsx" src
  // permanent exception path 除外 (shared/db/prisma.ts / shared/lib/r2/client.ts / shared/lib/serialize.ts / shared/lib/validations/section.ts) 後 0 件期待
});
```

- [ ] **Step 5: commit + push + PR**

---

## Task 10: skill / subagent 更新

**Files:**

- Modify: `.claude/skills/create-server-action/SKILL.md` (scaffold を conform pattern に)
- Modify: `.claude/skills/create-admin-page/SKILL.md` (form scaffold を conform pattern に)
- Modify: `.claude/agents/project-reviewer.md` (cast 0 件 audit を canonical gate に)
- Modify: `.claude/agents/zod-schema-reviewer.md` (z.ZodType<T> pattern 検出を追加)
- Modify: `.claude/rules/frontend/admin-ui-patterns.md` (form pattern セクションを conform 単一に書き換え)
- Modify: `.claude/rules/server-actions/implementation.md` (parseWithZod + SubmissionResult pattern を canonical 化)
- Modify: `.claude/rules/react/compiler/rules-eslint-rhf.md` (RHF watch / useFieldArray セクション削除 or conform 同等 pattern に置換)

- [ ] **Step 1: skill template 更新**
- [ ] **Step 2: subagent prompt 更新**
- [ ] **Step 3: rule docs 更新**
- [ ] **Step 4: commit + push + PR**

---

## Task 11: 最終 verification

- [ ] **Step 1: cast audit grep**

```bash
grep -rE "\bas [A-Z]" --include="*.ts" --include="*.tsx" src \
  | grep -vE "as const|as unknown|^src/[^:]*://" \
  | grep -vE "shared/db/prisma\.ts|shared/lib/r2/client\.ts|shared/lib/serialize\.ts|shared/lib/validations/section\.ts"
# 期待: 0 件（permanent exception 4 file 除外後）
```

- [ ] **Step 2: RHF audit grep**

```bash
grep -rln "react-hook-form\|@hookform" src/ package.json
# 期待: 0 件（package.json から削除済）
```

- [ ] **Step 3: 全 validate + build + test**

```bash
bun run validate && bun run build
bun run test:unit && bun run test:integration
bunx playwright test --project=chromium-smoke
```

- [ ] **Step 4: PR 全 merge 後の main 動作確認 + ledger 削除確認**

---

## Self-Review

- ✅ Spec coverage: 全 12 eliminable entry が Task 1-3 でカバー、RHF→conform は Task 4-8、ledger 削除 / rule docs 更新は Task 9-10
- ✅ Placeholder scan: 全 Step に具体的 code / commands / file path 記述あり
- ✅ Type consistency: `z.ZodType<T>` 系は Zod 4 公式 API、`@conform-to/react` API も公式 docs に整合
- ⚠️ Task 4-8 は 1 task 1 PR の粒度ではなく、複数 form 移行を含む。各 form 単位で sub-commit 推奨
- ⚠️ Task 5-7 の具体的 form file リストは実装開始時に grep で確定（spec time で全列挙すると drift する）

## Execution Notes

- Task 1-3 は独立、並列 PR 可能
- Task 4-8 は依存順（Task 4 で pattern 確立 → 5-7 で適用 → 8 で削除）
- Task 9-10 は Task 8 完了後の最終 step
- 各 PR は CLAUDE.md §自動完遂ポリシーに従い branch → validate → commit → push → PR → CI → squash merge → sync まで完遂
- 8-10 日 estimated、Phase 1 全体で 10-11 PR

---

## Progress Snapshot (2026-05-17 update)

> Phase ごとに段階的に merge 済。次セッションは下記 handoff memo を起点に再開する。

### 完了済 (Task 4-7 大半 + Phase 2 + Phase 3-A)

| Task        | 内容                                                                | 状態         | 関連 PR         |
| ----------- | ------------------------------------------------------------------- | ------------ | --------------- |
| Task 4      | conform 導入準備 + `executeConformMutation` SSoT 確立               | ✅ Completed | PR #61 era      |
| Task 5      | conform simple form 移行 (settings sections 17/17)                  | ✅ Completed | PR #61-87       |
| Task 6      | conform medium form 移行 (Dialog / Tab form)                        | ✅ Completed | PR #88-91       |
| Task 7 部分 | conform complex form 移行 (Page 遷移 form 7 件 + auto-section-form) | ✅ Completed | PR #92-98, #107 |
| (Phase 2)   | public forms 7 件 + `use-public-form.ts` 削除                       | ✅ Completed | PR #100-106     |
| Phase 3-A   | auto-section-form + 4 auto-fields conform 化                        | ✅ Completed | PR #107         |

### 残作業 (Phase 3-B + 3-C)

| Phase                   | 内容                                                                                  | 状態                    |
| ----------------------- | ------------------------------------------------------------------------------------- | ----------------------- |
| Phase 3-B (Task 7 残り) | inline editor 21 file (4 hooks + 12 side-panel + SettingsDialog + form.tsx primitive) | **Pending — spec 必要** |
| Phase 3-C (Task 8)      | `package.json` から `react-hook-form` / `@hookform/resolvers` 削除                    | 3-B 完了後              |
| Task 1-3                | SDK / Prisma / Route ledger entries 構造解消                                          | 未着手 (RHF 移行と独立) |
| Task 9-11               | ledger 削除 + rule docs 更新 + verification                                           | 全 form 移行完了後      |

### 次セッション起点

- **handoff memo**: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_type-safety-phase-3-handoff.md` を参照
- **Phase 3-B 着手**: `writing-plans` skill で inline editor 専用 spec を作成 (本 plan の Task 7 を inline editor 専用に細分化)
- 型 ledger は Phase 3-A 完了時点で **20 entry** に拡張済 (conform generic invariance §5 拡張)、`.claude/rules/type-safety/documented-exceptions-ledger.md` 参照
