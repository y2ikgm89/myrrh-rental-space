---
description: Server Action ファイルの export 契約（async 関数のみ可）+ Reader 関数は Route Handler canonical
paths:
  - src/**/_actions/**
  - src/**/actions/**
  - src/app/(admin)/admin/api/**
---

# Server Action — Export 契約 / Reader 関数

> Next.js 16.2 公式仕様 / Turbopack silent bug 対応

## `"use server"` ファイルの export 契約（Next.js 16 公式仕様）

ファイルレベル `"use server"` ディレクティブを持つファイルは **async 関数のみ** export 可能（[公式](https://nextjs.org/docs/app/api-reference/directives/use-server)）。Turbopack の server-actions bundler は型・非関数識別子を runtime 参照として残し `ReferenceError: X is not defined` を引き起こす。

**許可される export**:

- `export async function foo() {}`
- `export const foo = async () => {}`

**禁止される export**（型も含む — Turbopack は `verbatimModuleSyntax` 下でも誤変換する）:

- `export type { X } from "..."` / `export type X = ...` / `export interface X {}`
- `export const X = { ... }`（非 async 値）・`export class X {}`・`export function X() {}`（非 async）
- `export default <非 async>`

**型・定数の退避先**: co-located な `<file>-types.ts` に分離し、server-actions ファイルと consumers の両方がそこから import する(`page-section-types.ts` / `space-form-submit-types.ts` が参照実装)。内部のみで使う `type` は export せずローカル宣言のみ。

**検出 grep**:

```bash
for f in $(grep -rl '^"use server"' src/ --include="*.ts"); do
  grep -nE "^export (type|interface|class |let |var )" "$f"
  grep -nE "^export const [A-Za-z_]+" "$f" | grep -v "= async"
done
```

**consumer 側逆方向 grep**（UI / Client Component が `"use server"` ファイルから型を import していないか検出。`TS2305 has no exported member` の典型原因）:

```bash
for f in $(grep -rl '^"use server"' src/ --include="*.ts"); do
  modpath=$(echo "$f" | sed 's|^src/|@/|; s|\.ts$||')
  grep -rnE "^\s*type [A-Z][A-Za-z]+,?\s*$" src/ --include="*.tsx" --include="*.ts" | grep "from \"$modpath\""
done
```

**型 SSoT の選択**: 型は ① domain 層（`@/shared/domain/**/types.ts`）② co-located `<action>-types.ts` のどちらかに置く。UI / Client Component は **action ファイルから `type X` を import しない**。

---

## Reader 関数は Route Handler が canonical（Server Action 読み取り禁止）

Next.js 16 公式 [backend-for-frontend ガイド](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/backend-for-frontend.mdx) は `'use server'` を **form / mutation 用途**、リーダー（公開 fetch も含む）は **Route Handler `route.ts`** と明示している。プロジェクトでも Server Action で read-only 関数を export する形は非推奨（Server Action は RPC endpoint を生成するため、認証ヘルパーの選択肢が狭まり `"use server"` ファイル export 制約にも巻き込まれる）。

### canonical Route Handler（管理画面 reader 用）

```typescript
// src/app/(admin)/admin/api/block-templates/route.ts
import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { getBlockTemplates } from "@/shared/domain/block-template/queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  getRouteErrorStatus,
  jsonError,
  jsonSuccess,
} from "@/shared/lib/route-responses";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await checkPermission(
      "blockTemplate",
      "read",
      request.headers,
    );
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    return jsonSuccess(await getBlockTemplates());
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminBlockTemplatesGet" },
    });

    return jsonError("Internal server error", 500);
  }
}
```

### 契約の要点

| 項目                   | 契約                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 認証                   | `checkAdminAuth(request.headers)` (→ 401) または `checkPermission(resource, action, request.headers)` (→ 403)。`request.headers` を**第 3 引数**で渡す（Server Actions と異なり `headers()` が使えない） |
| 副作用なし admin fetch | `checkAdminAuth` 止まりで OK。特定 resource に紐づく read は `checkPermission(resource, "read", ...)`                                                                                                    |
| バリデーション         | 認証後に zod `safeParse`。失敗時は `jsonValidationError`                                                                                                                                                 |
| Response               | `NextResponse.json(data)` / `jsonError(msg, status)` / `jsonValidationError(zodError, msg)`                                                                                                              |
| 外部 fetch timeout     | `AbortSignal.timeout(10000)` 必須（`ogp/route.ts` 参照実装）                                                                                                                                             |
| Client consumer        | `fetchAdminJson<T>("/admin/api/...", { signal: abortController.signal, cache: "no-store" })` — AbortController で unmount cleanup（`StyleSelector.tsx` 参照実装）                                        |
| エラー時 UX            | SWR 的に silent fail ではなく `setLoadError(err.message)` で表示。`AbortError` は無視                                                                                                                    |

### 参照実装（3 経路）

- `src/app/(admin)/admin/api/ogp/route.ts` — POST + SSRF guard + external fetch + timeout
- `src/app/(admin)/admin/api/block-templates/route.ts` — GET + permission + try/catch + unstable_rethrow
- `src/app/(admin)/admin/api/notifications/unread-count/route.ts` — GET + 軽量 count

### 禁止パターン

```typescript
// NG: read-only 関数を "use server" で export（Next.js 公式外 + Server Action RPC 化）
"use server";
export async function fetchOgpPreview(url: string) {
  /* ... */
}

// NG: mutation だけど Route Handler で書く
// → mutation は Server Action + executeAdminMutationResult を使う
```

### いつ Server Action を使うか

`'use server'` は次の用途に限定:

- フォーム送信（`<form action={...}>`）
- `useFormAction` / `useActionState` 経由の mutation
- Client Component からの mutation 呼び出し（RPC）
- キャッシュ無効化を伴う write 操作（`updateTag` は Server Action 内のみ可能）

読み取り操作で「server-side state（DB / cookie / headers）を読むだけ」なら Route Handler。

### 移行メモ

`fetch-ogp.ts` / `notification-polling.ts` の reader 経路を `"use server"` から Route Handler に移行済み（旧 `section-styles/queries.ts` は Style Library 廃止と共に削除）。新規 reader は最初から Route Handler で書く。
