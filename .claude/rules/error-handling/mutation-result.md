---
description: MutationResult<T> 型と createMutationError / isMutationError ヘルパー、バリデーションエラー (Zod)
paths:
  - src/shared/lib/mutation-result*
  - src/shared/lib/action-helpers*
  - src/**/actions/**
  - src/**/mutations.ts
---

# MutationResult<T> 型

> Server Action の戻り値型 + createMutationError / isMutationError ヘルパー + Zod バリデーションエラー。

## createMutationError / isMutationError

`@/shared/lib/mutation-result` のヘルパーを必ず使用する。直接オブジェクトリテラルを返却しない:

```typescript
import {
  createMutationError,
  isMutationError,
  type MutationResult,
  type MutationError,
} from "@/shared/lib/mutation-result";

// NG: オブジェクトリテラル直接返却
return { error: "エラー" };
return { error: "...", fieldErrors: { ... } };

// OK: ヘルパー使用 (failure path)
return createMutationError("エラーが発生しました");
return createMutationError("入力内容に誤りがあります", { email: ["無効なメール"] }); // fieldErrors付き

// OK: success path は T を直接返す (ラッパー不要)
return { id: post.id };
```

型定義:

```typescript
// 失敗
type MutationError = {
  readonly error: string;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
};

// 統合 (success: T | failure: MutationError)
type MutationResult<T = null> = T | MutationError;

// 判定
function isMutationError(result: unknown): result is MutationError;
```

`executeAdminMutationResult` は `MutationResult<TData>` を返す。`execute` の戻り値 `TData` が success path（ラッパーなし）、`DomainError` throw が `MutationError` に自動変換される（failure path）。

## バリデーションエラー（Zod）

`@/shared/lib/action-helpers` の `createValidationMutationError` を使用:

```typescript
import { createValidationMutationError } from "@/shared/lib/action-helpers";

const parsed = postSchema.safeParse(data);
if (!parsed.success) {
  return createValidationMutationError(parsed.error);
  // => { error: '入力内容に誤りがあります', code: 'VALIDATION', fieldErrors: { title: ['...'] } }
}
```
