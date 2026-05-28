---
description: FormData useActionState (DnD form.reorder / useState array transit 2 パターン) + MutationResult 型 + 公開データ取得 ('use cache' + safeFetch + toPlainObject) + Server Action redirect typedRoutes cast
paths:
  - src/**/_actions/**
  - src/**/actions/**
  - src/**/queries/**
  - src/app/api/**
---

# FormData / MutationResult / 公開データ / redirect cast

> conform `useActionState` + `parseWithZod` canonical (Phase 1 全完了) / `isMutationError` 判定 / `'use cache'` + `safeFetch` + `toPlainObject` 公開取得 / Server Action `redirect()` の `typedRoutes` cast。

## 管理フォームの canonical (conform)

- **canonical**: React 19 `useActionState(fn, undefined)` + conform `useForm` (`@conform-to/react`) + `parseWithZod` (`@conform-to/zod/v4`) + `executeConformMutation` SSoT helper (`@/shared/lib/forms/conform-action`)。Server Action は `(prev, formData) => SubmissionResult` signature、id 必要時は `Function.prototype.bind` で部分適用 (`updateX.bind(null, entity.id)`)。動的配列は ① **`form.insert/remove/reorder` + `getFieldList()` + per-item `getFieldset()`** (DiscountSection で確立、LocationForm canonical で dnd-kit + `form.reorder({ name, from, to })` 完成) または ② **`useState<{key, ...}[]>` + 安定 key + hidden input append + schema preprocess** (SpaceEditForm canonical) のいずれかを採用。React Hook Form は `package.json` から完全削除済、新規利用不可。
- **Page 遷移 form の成功時遷移は server-side `redirect(toAppRoute(...))`** (Task 8.4-8.7 canonical) — `executeConformMutation` 内 closure で `createdId` / `success` flag を capture → `executeConformMutation` の戻り値前に `redirect(toAppRoute(\`/admin/.../${createdId}\`))`を呼ぶ。client 側`router.push`/`useEffect`toast + push は不要 (TermsForm Pattern より simple)。失敗時は`submission.reply()`(handler 内で`{ok: false, error}` 返却) で field-level errors を form に反映。`redirect`は`next/navigation`由来で thrown`NEXT_REDIRECT` を Next.js が処理、`as Route<string>`cast を集約する`toAppRoute()` SSoT helper (`@/shared/lib/routes/to-app-route`) 経由で typedRoutes 境界を 1 箇所に閉じ込める。
- **In-place schema preprocess pattern (LocationForm 確立、SpaceEditForm 水平展開)**: canonical schema (`@/shared/lib/validations/<entity>.ts` または `_shared/lib/validations/<entity>.ts`) を in-place 修正で FormData transit (conform) と object literal (test fixture) の両方を許容する。preprocess は typed value pass-through で no-op、string 入力時のみ coerce。backward compat を破壊しない。**number**: `z.preprocess((v) => v === "" || v == null ? null : typeof v === "number" ? v : Number(v), z.union([z.null(), z.number().min().max()])).optional()` / **boolean**: `z.preprocess((v) => v === "on" || v === true, z.boolean()).default(false)` / **pass-through JSON object** (UI 編集なし複雑 nested): `z.preprocess((v) => typeof v === "string" ? (v === "" || v === "null" ? null : (() => { try { return JSON.parse(v); } catch { return null; } })()) : v, businessHoursWeekSchema.nullable().optional())` / **Record\<string, boolean\>**: `z.record(z.string(), z.preprocess((v) => v === "on" || v === true, z.boolean())).default({})` / **JSON-encoded object array** (facilities pattern、各 entry が hidden input の JSON 文字列として送信): `z.preprocess((v) => Array.isArray(v) ? v.map(item => typeof item === "string" ? (() => { try { return JSON.parse(item); } catch { return null; } })() : item).filter(Boolean) : v, facilitiesSchema)` / **string array** (imageUrls pattern、同名 hidden input の `getAll()` で `string[]` 化): `z.preprocess((v) => Array.isArray(v) ? v.filter(s => typeof s === "string" && s.length > 0) : v, z.array(z.string().url()).max(N))`。参照実装: `@/shared/lib/validations/location.ts` / `@/admin/lib/validations/space.ts`。
- **conform fields の sub-component 流用 type SSoT (Task 8.5 EventForm 確立)**: 5+ tab panels / 子 component に conform `fields` を分配する場合、`Required<{[K in keyof z.input<typeof schema>]: FieldMetadata<schema[K], schema, string[]>}>` 型 alias を別 file (`<entity>-form-fields-types.ts`) に export し、各 sub-component で `{ fields: EntityFormFields }` props 受領。`Required<>` で optional modifier `?` を strip して `fields.x.errors` が `string[] | undefined` を返す TS 推論を維持 (`-?` mapped modifier)。Conform 0.10+ `FieldMetadata<TInput, TSchema, TError>` の 3-arg generic を type SSoT で集約。参照実装: `events/_components/event-form-fields-types.ts`。**例外**: Task 8.7 SpaceEditForm のように 5+ tabs を **monolithic 単一 file** に集約する場合 (tab を `<TabsContent>` 内 inline 配置、prop drilling なし)、別 file の fields type alias は不要 (parent component 内で `fields.x` を直接参照、React Compiler が中規模 component のメモ化を自動処理)。
- **React Hook Form は `package.json` から完全削除済** — `useFormAction` / `useForm` from `react-hook-form` / `useFieldArray` / `useWatch` / `useController` / `standardSchemaResolver` / `zodResolver` 等の RHF API 経路は新規利用不可。inline editor (Posts / News) の本文も useState + 設定は conform `useForm` の dual pattern (`usePostEditor` / `useNewsEditor` 参照)。
- **動的配列 + 複雑 widget 連携の `useState` array transit pattern (Task 8.7 SpaceEditForm 確立)**: imageUrls (`string[]` MediaPicker + dnd-kit) / facilities (`{name, iconName}[]` IconPickerField) のような **conform schema 上は flat array だが UI 連携が複雑** な動的配列は、`useState<{key, url}[]>` / `useState<{key, name, iconName}[]>` で local 管理 + `crypto.randomUUID()` 安定 key + hidden input append (`{items.map(item => <input type="hidden" name={fields.x.name} value={...} />)}`) + schema preprocess で FormData → 配列復元する。**`form.insert/remove/reorder` との使い分け基準**: ① UI が単純な Input + Button のみ → conform `form.insert/remove/reorder` (LocationForm canonical) ② MediaPicker / IconPickerField / Lexical 等の external state 連携 + dnd-kit reorder → useState array transit (SpaceEditForm canonical)。dnd-kit reorder は `setImageUrls(prev => { const next = [...prev]; const [moved] = next.splice(oldIndex, 1); next.splice(newIndex, 0, moved); return next; })` の splice pattern。
- **PortableTextSpan[] hidden input transit (Pattern B、Task 8.1-8.2 で確立)**: Dialog form 内の rich-text label / message は `useState<PortableTextSpan[]>` で local 管理 + `<input type="hidden" value={JSON.stringify(spans)} />` で送信、schema 内で `z.string().transform((v, ctx) => JSON.parse(v) → portableTextSpan[] parse).pipe(...)` で server-side validate。`useInputControl` 経由の bridge より simple で contenteditable cursor 問題回避。参照実装: `BarFormDialog` (PR #90) / `NavigationFormDialog` (PR #91) + `bar-form-schema.ts` / `nav-form-schema.ts`。
- **Lexical Editor hidden input transit (Task 8.3 で確立、Task 8.7 で水平展開)**: 大型 page 遷移 form 内の Lexical contentJson は `useState<string>` で local 管理 + `<input type="hidden" value={contentJson} />` で送信。`contentHtml` は `renderEditorStateJsonToHtmlClient(contentJson)` を毎 render で**派生計算** (React Compiler が自動メモ化、`useMemo` / `flushSync` 不要、batching 問題回避)。参照実装: `TermsForm` (PR #92) + `terms-form-schema.ts` / `SpaceEditForm` (PR #98) + `spaceFormSchema`。
- **MEO score / live preview reactive (Task 8.6 LocationForm 確立)**: RHF `useWatch` ベースの reactive sub-card 表示を conform に置換する場合、parent form で `useState<string>` 集約 + hidden input transit pattern と組合せ、sub-card には `values: MeoScoreValues` 等の derived props を `useState` から組み立てて渡す。`useWatch` は撤廃、sub-card は pure component に。React Compiler が parent の derived 計算を自動メモ化、`useMemo` 不要。参照実装: `locations/_components/LocationMeoScoreCard.tsx` (props 受領のみ) + `LocationForm.tsx` (`meoValues` 組み立て)。
- **参照実装**: settings sections 17/17 完了 (PR #61-87)。Dialog 内 conform Variant A (PR #64 create/edit 分離 / PR #88 create/edit 統合 + mount-on-open + `bind` 部分適用): `space-categories/_components/CategoryForm.tsx` + `CreateCategoryDialog.tsx` / `CategoryActionCell.tsx` / `posts/taxonomy/_components/CategoryManager.tsx` / `TagManager.tsx`。Phase 1 Task 8.1 (PR #90) `BarFormDialog` (AnnouncementBar、PortableTextSpan[] Pattern B + datetime-local) / Task 8.2 (PR #91) `NavigationFormDialog` + `SocialLinkFormDialog` (Navigation、PortableTextSpan[] Pattern B + parent-child Select + Switch) / Task 8.3 (PR #92) `TermsForm` (Page 遷移 form、Lexical contentJson + contentHtml 派生計算 + Switch 5 件 + Select) / Task 8.4 (PR #94) `ReservationForm` + `ReservationEditForm` (mode discriminator + nested customerData + cross-field refine + server-side redirect) / Task 8.5 (PR #95) `EventForm` + 子 4 component (interdependent state parent 集約 + conform fields type SSoT + Tabs + datetime-local 複数) / Task 8.6 (PR #96) `LocationForm` + `LocationMeoScoreCard` (1127 行 + in-place schema preprocess + `form.reorder` dnd-kit + JSON pass-through + 11-field MEO reactive + 設備 `form.insert/remove`) / **Task 8.7 (PR #98) `SpaceEditForm` (5 tab monolithic 1700 行 + useState array transit + dnd-kit splice reorder + JSON-encoded facilities + Lexical 派生計算 + 完全 inline SEO/OGP + Tabs nuqs persistence、Phase 1 最後の hybrid 解消)**。AdminDetailLayout 編集ページ dual-impl (PR #68): `posts/taxonomy/_components/TaxonomyEditor.tsx`（`CategoryEditorImpl` / `TagEditorImpl` を別 `useActionState` で持つ self-contained edit form、共通 OGP preview は内部 subcomponent、新 Server Action signature `updatePostCategoryAction` / `updatePostTagAction` を `bind` 部分適用、legacy `(input)` 版は dialog form 互換のため並列維持）。

## MutationResult 型と isMutationError

```typescript
import type { MutationResult } from "@/shared/lib/mutation-result";
import { isMutationError } from "@/shared/lib/mutation-result";

// 成功（データあり）— execute の戻り値がそのまま data になる
// { data: { id: "post-1" } }

// 失敗（エラーメッセージ）
// { error: "投稿が見つかりません" }

// 失敗（フィールドエラー付き — バリデーション）
// { error: "入力内容に誤りがあります", fieldErrors: { title: ["タイトルは必須です"] } }

// Zod バリデーションエラー → MutationResult 変換
import { createValidationMutationError } from "@/shared/lib/action-helpers";
const parsed = schema.safeParse(input);
if (!parsed.success) return createValidationMutationError(parsed.error);

// Client Component での判定
const result = await someAction(input);
if (isMutationError(result)) {
  // result.error, result.fieldErrors
} else {
  // result.data
}
```

## 公開データ取得パターン（'use cache' + safeFetch + toPlainObject）

認証不要の公開データ取得関数では `safeFetch` + `toPlainObject` を使用:

```typescript
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/lib/prisma";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import { safeFetch, ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { toPlainObject } from "@/shared/lib/serialize";

export async function getPublicBusinessSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS, CACHE_TAGS.SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: { businessName: true, phoneNumber: true, email: true },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicBusinessSettings",
  });

  // React 19: Prisma の Symbol プロパティを除去してシリアライズ可能にする
  return toPlainObject(result);
}
```

**なぜ `safeFetch` を使うか**: エラー時に `fallback` を返し、ページ全体のクラッシュを防ぐ。`logger.error` で記録しつつユーザーへのエラー表示を最小化。

**`safeFetch` の結果は必ず `toPlainObject()` でラップしてから返す**。`return safeFetch({...})` と直接返すと `Promise<Prisma結果>` がそのまま漏れ出す（サイレントバグ）:

```typescript
// NG: await せず直接 return（Prisma Symbol プロパティが残り React 19 シリアライゼーションエラー）
async function getSettings() {
  'use cache'
  return safeFetch({ fetch: () => prisma.settings.findUnique({ ... }), fallback: null, ... })
}

// OK: await + toPlainObject でプレーンオブジェクト化
async function getSettings() {
  'use cache'
  const result = await safeFetch({ fetch: () => prisma.settings.findUnique({ ... }), fallback: null, ... })
  return toPlainObject(result)
}
```

## Server Action redirect の typedRoutes cast

Next.js 16 `typedRoutes: true` 環境で外部 OAuth URL（Google / Meta / Instagram 等が返す動的 URL）を `redirect()` に渡す場合、`redirect(url as Route<string>)` の library boundary cast が必要（`router.push` `ClickableTableRow` パターンと同列の例外）。

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-business-profile.ts
"use server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getGbpAuthorizeUrl } from "@/shared/lib/google-business-profile";

export async function initiateGbpAuth() {
  // ... auth/permission check
  const url = await getGbpAuthorizeUrl();
  // OAuth provider が返す動的 URL は string 型のため Route<string> へ cast
  redirect(url as Route<string>);
}
```

**ルール**:

- `import type { Route } from "next"` は型のみ import で `"use server"` ファイル制約と非衝突（async 関数のみ export 規律を破らない）
- consumer 側では cast 不要（library boundary を 1 箇所に閉じ込める）
- 内部 app route は `toAppRoute()` (`@/shared/lib/typed-routes`) で narrow するのが canonical、cast を使うのは外部 OAuth / 完全動的 URL のみ

参照実装: `actions/settings/google-business-profile.ts` の `initiateGbpAuth` / Instagram OAuth callback handler
