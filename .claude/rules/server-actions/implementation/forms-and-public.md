---
description: FormData useActionState (DnD / useFieldArray 例外) + MutationResult 型 + 公開データ取得 ('use cache' + safeFetch + toPlainObject) + Server Action redirect typedRoutes cast
paths:
  - src/**/_actions/**
  - src/**/actions/**
  - src/**/queries/**
  - src/app/api/**
---

# FormData / MutationResult / 公開データ / redirect cast

> 複雑管理フォームの `useActionState` + `FormData` codec / `isMutationError` 判定 / `'use cache'` + `safeFetch` + `toPlainObject` 公開取得 / Server Action `redirect()` の `typedRoutes` cast。

## 複雑な管理フォームと `FormData`（`useActionState`）

- **既定**: クライアントは `useFormAction` 経由でオブジェクトを渡し、Server Action が `zod.safeParse` してから `executeAdminMutationResult` する。
- **例外**（DnD・`useFieldArray`・メディアピッカー等）: `.claude/rules/frontend/admin-ui-patterns.md` の「useFormAction 非適用の例外」に従う。クライアントで検証済みペイロードを **`FormData`** に載せ、**`useActionState(fn, initialState)`** の `fn(prev, formData)` で受け取り、共有コーデックでオブジェクト化して **同一の Zod スキーマでサーバー再検証**したうえで、既存の `createX` / `updateX`（`executeAdminMutationResult`）を呼ぶ。
- **参照実装**: `submitSpaceFormAction`（`@/admin/actions/space-form-submit`）、`space-form-data-codec.ts`、`SpaceEditForm.tsx`。

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
