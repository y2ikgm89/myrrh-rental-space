---
description: FormData useActionState (DnD / useFieldArray 例外) + MutationResult 型 + 公開データ取得 ('use cache' + safeFetch + toPlainObject) + Server Action redirect typedRoutes cast
paths:
  - src/**/_actions/**
  - src/**/actions/**
  - src/**/queries/**
  - src/app/api/**
---

# FormData / MutationResult / 公開データ / redirect cast

> conform `useActionState` + `parseWithZod` canonical / 複雑フォームの FormData codec (Task 7 移行中) / `isMutationError` 判定 / `'use cache'` + `safeFetch` + `toPlainObject` 公開取得 / Server Action `redirect()` の `typedRoutes` cast。

## 管理フォームの canonical (conform)

- **canonical** (Phase 1 Task 4-8 進行中、8.1-8.3 完了): React 19 `useActionState(fn, undefined)` + conform `useForm` (`@conform-to/react`) + `parseWithZod` (`@conform-to/zod/v4`) + `executeConformMutation` SSoT helper (`@/shared/lib/forms/conform-action`)。Server Action は `(prev, formData) => SubmissionResult` signature、id 必要時は `Function.prototype.bind` で部分適用 (`updateX.bind(null, entity.id)`)。動的配列は `form.insert.getButtonProps` / `form.remove.getButtonProps` + `getFieldList()` + per-item `getFieldset()` (DiscountSection PR #84 で確立、RHF `useFieldArray` 等価機能)。
- **`useFormAction` (RHF) は legacy** — 新規利用禁止 (Task 8 で `react-hook-form` / `@hookform/resolvers` を `package.json` から削除予定)。既存 RHF 残存 form の編集時は同 commit 内で conform に置換する。
- **`useActionState` + `FormData` codec (RHF + 手動 codec hybrid)**: `SpaceEditForm` のような DnD・`useFieldArray`・メディアピッカーを伴う複雑 form の Phase 1 Task 8 移行**中間状態**。最終形は conform `form.insert/remove/reorder` API + dnd-kit + MediaPicker bridge (useInputControl) で完全 conform 化。新規同種 form を作る場合は中間状態を踏襲せず最初から conform で書く（Task 8 で codify される pattern に従う）。
- **PortableTextSpan[] hidden input transit (Pattern B、Task 8.1-8.2 で確立)**: Dialog form 内の rich-text label / message は `useState<PortableTextSpan[]>` で local 管理 + `<input type="hidden" value={JSON.stringify(spans)} />` で送信、schema 内で `z.string().transform((v, ctx) => JSON.parse(v) → portableTextSpan[] parse).pipe(...)` で server-side validate。`useInputControl` 経由の bridge より simple で contenteditable cursor 問題回避。参照実装: `BarFormDialog` (PR #90) / `NavigationFormDialog` (PR #91) + `bar-form-schema.ts` / `nav-form-schema.ts`。
- **Lexical Editor hidden input transit (Task 8.3 で確立)**: 大型 page 遷移 form 内の Lexical contentJson は `useState<string>` で local 管理 + `<input type="hidden" value={contentJson} />` で送信。`contentHtml` は `renderEditorStateJsonToHtmlClient(contentJson)` を毎 render で**派生計算** (React Compiler が自動メモ化、`useMemo` / `flushSync` 不要、batching 問題回避)。参照実装: `TermsForm` (PR #92) + `terms-form-schema.ts`。
- **参照実装**: settings sections (PR #61 9 件 / #62 medium 7 件 / #74-83 / #84-87 残 4 件 で 17/17 完了) — `MaintenanceSection` / `CustomerForm` / `CustomerEditForm` / `CouponForm` / `PageSeoForm` / `UserForm` / `InviteForm` / `DiscountSection` (useFieldArray→`form.insert/remove`) / `StripeSection` (masked input + cross-field refine 統合) / `GoogleCalendarSection` (4 Switch + composite reminder mode)。Dialog 内 conform Variant A (PR #64 create/edit 分離 / PR #88 create/edit 統合 + mount-on-open + `bind` 部分適用): `space-categories/_components/CategoryForm.tsx` + `CreateCategoryDialog.tsx` / `CategoryActionCell.tsx` / `posts/taxonomy/_components/CategoryManager.tsx` / `TagManager.tsx`。Phase 1 Task 8.1 (PR #90) `BarFormDialog` (AnnouncementBar、PortableTextSpan[] Pattern B + datetime-local) / Task 8.2 (PR #91) `NavigationFormDialog` + `SocialLinkFormDialog` (Navigation、PortableTextSpan[] Pattern B + parent-child Select + Switch) / Task 8.3 (PR #92) `TermsForm` (Page 遷移 form、Lexical contentJson + contentHtml 派生計算 + Switch 5 件 + Select)。AdminDetailLayout 編集ページ dual-impl (PR #68): `posts/taxonomy/_components/TaxonomyEditor.tsx`（`CategoryEditorImpl` / `TagEditorImpl` を別 `useActionState` で持つ self-contained edit form、共通 OGP preview は内部 subcomponent、新 Server Action signature `updatePostCategoryAction` / `updatePostTagAction` を `bind` 部分適用、legacy `(input)` 版は dialog form 互換のため並列維持）。中間状態 (RHF + FormData): `submitSpaceFormAction` (`@/admin/actions/space-form-submit`)、`space-form-data-codec.ts`、`SpaceEditForm.tsx`（Task 8.7 で完全 conform 化予定）。

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
