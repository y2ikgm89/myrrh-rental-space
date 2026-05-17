# Phase 3-B Inline Editor Inventory

> **作成**: 2026-05-17
> **目的**: Phase 3-B (inline editor RHF → conform 移行) の ground truth 確定。spec の Task 1 (前提) として実施。

## RHF API 使用 file 集計

`grep -cE 'useForm\|useWatch\|useController\|useFormContext\|UseFormReturn\|UseFormSetValue\|UseFormRegister\|Control<\|FieldErrors\|UseFormGetValues\|standardSchemaResolver\|zodResolver\|FormProvider\|FieldPathByValue\|FieldValues\|useFieldArray'` で各 file の hit 数を計測。

### Hooks (4 file)

| File                                | RHF API hit 数 | 主要使用 API                                                                                                                                |
| ----------------------------------- | :------------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/usePostEditor.ts`            |       10       | `useForm` × 2 (bodyForm + settingsForm), `UseFormReturn`, `zodResolver`, `useEditorCore`                                                    |
| `hooks/useNewsEditor.ts`            |       10       | 同上 (構造同型)                                                                                                                             |
| `hooks/shared/use-editor-core.ts`   |       11       | `UseFormReturn<TFormData>`, `FieldValues`, `FieldPathByValue`, `computeIsDirty`, `createContentChangeHandler`, `createResetHandler` factory |
| `hooks/use-content-width-styles.ts` |       8        | `Control`, `useWatch`                                                                                                                       |

### Side-panel (12 file + TagInput 1 file)

| File                                  | RHF API hit 数 | 主要使用 API                                                                                     |
| ------------------------------------- | :------------: | ------------------------------------------------------------------------------------------------ |
| `side-panel/BasicInfoFields.tsx`      |       8        | `UseFormRegister`, `UseFormGetValues`, `UseFormSetValue`, `FieldErrors`                          |
| `side-panel/TitleSlugFields.tsx`      |       5        | `UseFormRegister`, `UseFormGetValues`, `UseFormSetValue`, `FieldErrors` (News 用)                |
| `side-panel/ExcerptFields.tsx`        |       3        | `UseFormRegister`, `FieldErrors`                                                                 |
| `side-panel/CategoryFields.tsx`       |       6        | `Control` (useController), `UseFormSetValue`, `FieldErrors`                                      |
| `side-panel/CategoryTagFields.tsx`    |       9        | CategoryFields + TagFields 合成                                                                  |
| `side-panel/TagFields.tsx`            |       3        | `Control`, `FieldErrors` (News tags)                                                             |
| `side-panel/PostTagFields.tsx`        |       6        | `Control`, `useWatch`, `UseFormSetValue`, `FieldErrors` (Post tags)                              |
| `side-panel/TagInput.tsx`             |     **0**      | RHF 非依存 (純粋 UI primitive、TagFields / PostTagFields から流用)                               |
| `side-panel/ImageFields.tsx`          |       6        | `Control`, `useController`, `UseFormSetValue`, `FieldErrors`                                     |
| `side-panel/LayoutFields.tsx`         |       14       | `Control<T>`, `UseFormSetValue<T>`, `Path<T>` (型 ledger §5 entry、generic invariance 境界 cast) |
| `side-panel/OGPFields.tsx`            |       4        | `UseFormRegister`, `UseFormSetValue`, `FieldErrors`                                              |
| `side-panel/SEOFields.tsx`            |       2        | `UseFormRegister`, `FieldErrors`                                                                 |
| `side-panel/UnifiedPublishFields.tsx` |       3        | `UseFormRegister`, `FieldErrors`, `Control` (Post status discriminator)                          |

### Dispatcher / config (4 file)

| File                     |     RHF API hit 数     | 主要使用 API                                                                                                                       |
| ------------------------ | :--------------------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| `SettingsDialog.tsx`     |           4            | `FieldValues` generic, `buildRenderContext`, `tv()` tabCount 2-5 別 grid                                                           |
| `content-types/types.ts` |           21           | `FieldComponentProps<T>` / `SidePanelInjectedProps<T>` / `SidePanelDefinition<TForm, TExtra>` 型 SSoT (全 12 side-panel が import) |
| `content-types/post.tsx` |           0            | (RHF 型は import するが直接 API call なし)                                                                                         |
| `content-types/news.tsx` |           0            | 同上                                                                                                                               |
| `hooks/shared/types.ts`  |           3            | `EditorCoreReturn` 型                                                                                                              |
| `types.ts` (inline 直下) | (検出済、内容調査未完) | -                                                                                                                                  |

### 合計

- **RHF 依存 file**: **20 件** (spec で 21 と推定したが TagInput.tsx は非依存、20 が ground truth)
- **追加対象 (修正必要)**: 19 file (TagInput.tsx は touchless)

## Server Action signature 一覧

| Server Action        | Path                                    | Signature                                                                 | 戻り型 |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------- | ------ |
| `createPost`         | `_shared/actions/post/mutations.ts:26`  | `(input: CreatePostInput) => Promise<MutationResult<{ id: string }>>`     | id     |
| `updatePostBody`     | `_shared/actions/post/mutations.ts:62`  | `(id: string, input: UpdatePostBodyInput) => Promise<MutationResult>`     | null   |
| `updatePostSettings` | `_shared/actions/post/mutations.ts:106` | `(id: string, input: UpdatePostSettingsInput) => Promise<MutationResult>` | null   |
| `deletePost`         | `_shared/actions/post/mutations.ts:162` | `(id: string) => Promise<MutationResult>`                                 | null   |
| `createNews`         | `_shared/actions/news.ts:57`            | `(input: CreateNewsInput) => Promise<MutationResult<{ id: string }>>`     | id     |
| `updateNewsBody`     | `_shared/actions/news.ts:88`            | `(id: string, input: UpdateNewsBodyInput) => Promise<MutationResult>`     | null   |
| `updateNewsSettings` | `_shared/actions/news.ts:130`           | `(id: string, input: UpdateNewsSettingsInput) => Promise<MutationResult>` | null   |
| `deleteNews`         | `_shared/actions/news.ts:182`           | `(id: string) => Promise<MutationResult>`                                 | null   |

**現行 signature**: `(input: T) => MutationResult` (RHF 用、callback で input を受け取る)
**Phase 3-B Task 3 移行先**: `(prev: SubmissionResult | undefined, formData: FormData) => SubmissionResult` (conform `useActionState` 用)

id 必要な update / delete は `Function.prototype.bind` で部分適用 (`updateXxx.bind(null, entity.id)`)。

## 既存 Zod schema (in-place modify 対象)

`src/app/(admin)/admin/(dashboard)/_shared/lib/validations/post.ts`:

| Schema                                 | 型                           | 用途                         | Phase 3-B Task 2 修正                                                                                                                               |
| -------------------------------------- | ---------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPostSchema`                     | server-side strict           | Server Action validate       | 維持 (Server Action 受領は object literal で OK)                                                                                                    |
| `updatePostBodySchema`                 | server-side strict           | Server Action validate       | 維持                                                                                                                                                |
| `updatePostSettingsSchema`             | server-side strict           | Server Action validate       | 維持                                                                                                                                                |
| `postBodyFormSchema`                   | RHF client (string base)     | RHF defaultValues + resolver | **in-place preprocess 化** (lexicalJsonSchema preserve, contentHtml 派生 field 追加)                                                                |
| `postSettingsFormSchema`               | RHF client (全 field string) | RHF defaultValues + resolver | **in-place preprocess 化** (Task 8.6 LocationForm pattern: `z.preprocess` で string → number / boolean coerce + datetime-local + JSON tags transit) |
| `postCategorySchema` / `postTagSchema` | server-side                  | Taxonomy editor 用           | 対象外 (本 phase scope 外)                                                                                                                          |

News 側 (`src/app/(admin)/admin/(dashboard)/_shared/lib/validations/news.ts`) も同型構造を持つ (recheck 必要)。

## 既存 unit test (drift 検出必要)

- `__tests__/unit/lib/validations/post.test.ts` (50 行+) — `createPostSchema` / `updatePostBodySchema` / `updatePostSettingsSchema` / `postBodyFormSchema` / `postSettingsFormSchema` / `postCategorySchema` / `postTagSchema` の test cover あり
- `__tests__/unit/lib/validations/news.test.ts` — 同型 (詳細未調査)

**Task 2 着手時の drift リスク**: `postSettingsFormSchema` の field 型を string → preprocess に変更すると既存 test fixture (`{ tags: "" }` 等) が drift する。Task 2 は schema 修正 + test fixture 更新を同一 commit で行うことが必須 (test-quality/unit-bun.md §fixture drift 検出 pattern A: Schema 必須化追従漏れの典型例)。

## Phase 3-B Chunk 分割推奨 (修正済 — 2026-05-17 二次 audit)

spec / `.claude/rules/server-actions/implementation/forms-and-public.md` §In-place schema preprocess pattern を再 review した結果、**Task 2 (schema preprocess) を単独 chunk で実行すると build broken になる**ことが確認された。理由: `z.preprocess` を `postBodyFormSchema` / `postSettingsFormSchema` に追加すると `z.input<typeof schema>` の field 型が `unknown` 化し、既存 `usePostEditor.ts` / `useNewsEditor.ts` の `useForm<PostBodyFormData>({ resolver: standardSchemaResolver(postBodyFormSchema) })` が型エラーで build 失敗する。

このため Task 2 は **Task 7 (dual form conform 化) と同一 commit で bundle する必要がある** (forms-and-public.md SSoT 明示)。修正後の Chunk 分割:

| Chunk | Task     | 内容                                                                                                                                                                                                                    |                   build pass                    |                       PR 数                        |
| ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------: | :------------------------------------------------: |
| 1     | Task 1   | inventory 作成 (本 doc)                                                                                                                                                                                                 |                       ✅                        |                       本 PR                        |
| 2     | Task 2-7 | post + news schema preprocess + 既存 test fixture 更新 + 6 Server Action conform 化 + content-types/types.ts + 12 side-panel + SettingsDialog + content-types/{post,news}.tsx + usePostEditor / useNewsEditor dual form | build broken 中間 commit + 最終 build pass 復帰 | 1 (build broken 中間 commit + controller 最終統合) |
| 3     | Task 8   | form.tsx 削除 + 残存 RHF audit                                                                                                                                                                                          |                       ✅                        |                         1                          |
| 4     | Task 9   | rule docs 更新                                                                                                                                                                                                          |                       ✅                        |                         1                          |
| 5     | Task 10  | Phase 3-C handoff memo + spec の Task 10 削除 (代替済)                                                                                                                                                                  |                       ✅                        |                   1 (memo only)                    |

**合計 PR 数**: 5 件 (Chunk 1-5)。

**重要 (旧 Chunk 分割からの変更)**: 旧版では Chunk 2 (Task 2 単独) / Chunk 3a (Task 3-4) / Chunk 3b (Task 5) / Chunk 3c (Task 6-7) と分割していたが、**Task 2 の preprocess 追加が RHF 側 build を即座に壊す**ため Chunk 2-3 を **Chunk 2 (Task 2-7 bundle)** に統合。次セッションでは focused session で Task 2-7 を 1 implementer に bundle dispatch (CLAUDE.md §1-commit BREAKING plan 実行時規律) するのが canonical。

## Next 着手手順

```bash
# 本 PR (Chunk 1 / inventory) merge 後
git checkout main && git pull --ff-only
git checkout -b feat/phase-3b-task-2-7-bundle

# Chunk 2 (Task 2-7 bundle) 着手: focused session で 1 implementer に bundle dispatch
# 中間 commit は build broken 状態を許容、最終 commit で build pass 復帰
# 参照 file (Task 2 起点):
# - src/app/(admin)/admin/(dashboard)/_shared/lib/validations/post.ts (preprocess 追加)
# - src/app/(admin)/admin/(dashboard)/_shared/lib/validations/news.ts (preprocess 追加)
# - __tests__/unit/lib/validations/post.test.ts (drift 同時更新)
# - __tests__/unit/lib/validations/news.test.ts (drift 同時更新)
# 参照 file (Task 3-7 cascade):
# - src/app/(admin)/admin/(dashboard)/_shared/actions/post/mutations.ts (Server Action conform 化)
# - src/app/(admin)/admin/(dashboard)/_shared/actions/news.ts (同上)
# - .../inline/content-types/types.ts (SidePanelInjectedProps を FieldMetadata ベースに)
# - .../inline/side-panel/*.tsx (12 件 bundle)
# - .../inline/SettingsDialog.tsx + content-types/{post,news}.tsx
# - .../inline/hooks/usePostEditor.ts + useNewsEditor.ts + shared/use-editor-core.ts
# 参照 rule docs:
# - .claude/rules/server-actions/implementation/forms-and-public.md §In-place schema preprocess pattern
# - .claude/rules/frontend/admin-ui/forms.md §Server Actions の認証パターン (conform canonical)

# Task 7 完了時点で必ず:
bun run validate && bun run build
# exit 0 確認後 commit + push + PR
```

## 関連 spec / handoff

- spec: `docs/superpowers/plans/2026-05-17-phase-3b-inline-editor-conform.md` (PR #113 merge 済)
- handoff memo: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_type-safety-phase-3-handoff.md`
