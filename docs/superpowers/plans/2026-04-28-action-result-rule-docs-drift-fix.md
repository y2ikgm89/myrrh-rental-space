# ActionResult / createSuccess / createFailure rule docs drift 解消 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.claude/rules/` 配下 8 ファイルの helper / 型 / import 表記を実装 (`executeAdminMutationResult` + `MutationResult<T>`) に追従させ、`createSuccess` / `createFailure` / `ActionResult` 等の架空シンボル参照を完全に解消する。

**Architecture:** 1 commit / 8 ファイル一括修正 / Pattern A-F 適用 / 5 grep verification / `src/` 実装変更ゼロ / ADR 不要。

**Tech Stack:** Markdown (rule docs only), bash grep verification, lefthook pre-commit (prettier-fix only).

**Spec:** `docs/superpowers/specs/2026-04-28-action-result-rule-docs-drift-design.md` (commits `3b02387d` + `082719ee`)

---

## File Structure

修正対象ファイル (spec § Modification Targets 参照):

| #   | File                                           | 適用 Pattern      |
| --- | ---------------------------------------------- | ----------------- |
| 1   | `.claude/rules/error-handling.md`              | A, B, C, D, E     |
| 2   | `.claude/rules/auth-patterns.md`               | A, B, D           |
| 3   | `.claude/rules/frontend/admin-ui-patterns.md`  | 節全削除 (D 関連) |
| 4   | `.claude/rules/implementation-quality.md`      | A, B, D           |
| 5   | `.claude/rules/test-quality.md`                | A, D              |
| 6   | `.claude/rules/server-actions/prohibitions.md` | A                 |
| 7   | `.claude/rules/server-actions/use-cache.md`    | A                 |
| 8   | `.claude/rules/type-safety.md`                 | F (§4 削除)       |

**Pattern 一覧** (詳細は spec 参照):

- **A**: `executeAdminMutationResult` 内の `success: (result) => createSuccess(...)` callback 削除 (実装に `success` プロパティなし)
- **B**: `createFailure("...")` → `createMutationError("...")`
- **C**: `createValidationError` → `createValidationMutationError`
- **D**: import 文を `@/admin/types/server-actions` / `@/shared/types/server-actions` (不在) → `@/shared/lib/mutation-result` / `@/admin/lib/admin-action` / `@/shared/lib/action-helpers` (実在)
- **E**: `error-handling.md` のみ — `ActionResult<TData>` 型定義節を `MutationResult<T> = T | MutationError` 節に置換
- **F**: `type-safety.md` §4「TypeScript 6.0 条件型 (`as unknown as T`)」例外節全削除 (架空型 `ActionSuccess<T>` を例に使用)

---

## Tasks

### Task 1: Baseline grep カウント (修正前の現状把握)

**Files:** None (read-only verification)

**Goal:** 修正前の forbidden symbol 出現箇所数を記録し、Task 10 の 0 件確認の根拠にする。

- [ ] **Step 1: 全 forbidden symbol を grep してファイル別カウント**

```bash
grep -rnE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/ | wc -l
```

Expected: **71 件** (現状 baseline、commit `da3e2ede` 時点)

- [ ] **Step 2: ファイル別カウントを取得**

```bash
grep -rcE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/ | grep -v ":0$"
```

Expected (順不同):

- `.claude/rules/auth-patterns.md:11`
- `.claude/rules/error-handling.md:34`
- `.claude/rules/implementation-quality.md:4`
- `.claude/rules/frontend/admin-ui-patterns.md:8`
- `.claude/rules/server-actions/use-cache.md:2`
- `.claude/rules/test-quality.md:9`
- `.claude/rules/server-actions/prohibitions.md:1`
- `.claude/rules/type-safety.md:2`

合計 71 件 / 8 ファイル。

数値が異なる場合は本 plan 開始前に他ブランチで rule docs が更新されている。Task 1 の baseline 値を実測値で記録し直して進める (Task 10 の verification は実測 baseline を使わず「forbidden パターン 0 件」で固定)。

---

### Task 2: `error-handling.md` 修正 (canonical SSoT 節を最初に確定)

**Files:**

- Modify: `.claude/rules/error-handling.md`

**Apply Patterns:** A, B, C, D, E

**Goal:** drift の中核である「`ActionResult` 型定義 + createSuccess/createFailure helper」のセクションを `MutationResult<T>` + `createMutationError` に置換。後続 Task 3-9 はこのファイルへ cross-reference する。

- [ ] **Step 1: 現状の修正対象箇所を grep で特定**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/error-handling.md
```

Expected: 34 hits (Task 1 baseline)

- [ ] **Step 2: §「ActionResult 型」セクション (`### createSuccess / createFailure` 節を含む) を全置換**

`error-handling.md` の `## ActionResult 型` セクション全体 (`### createSuccess / createFailure` + 型定義 + 例コード) を以下の新セクションに置換:

````markdown
## MutationResult<T> 型

### createMutationError / isMutationError

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
````

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

`executeAdminMutationResult` は `MutationResult<TData>` を返す。`execute` の戻り値 `TData` が success path (ラッパーなし)、`DomainError` throw が `MutationError` に自動変換される (failure path)。

````

- [ ] **Step 3: §「バリデーションエラー (Zod)」の helper 名を Pattern C で統一**

```typescript
// 旧
import { createValidationError } from "@/shared/lib/action-helpers";
const parsed = postSchema.safeParse(data);
if (!parsed.success) {
  return createValidationError(parsed.error);
}

// 新
import { createValidationMutationError } from "@/shared/lib/action-helpers";
const parsed = postSchema.safeParse(data);
if (!parsed.success) {
  return createValidationMutationError(parsed.error);
}
````

- [ ] **Step 4: §「Server Actions エラーパターン」§「認証エラー (executeAdminMutationResult — 推奨パターン)」の例コードを Pattern A + B + D で書き換え**

```typescript
"use server";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";

export const createPost = async (input: CreatePostInput) => {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "create",
    execute: async () => createPostCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.POSTS);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};
```

`executeAdminMutationResult` の自動処理一覧 (テキスト) も以下に修正:

- `DomainError のキャッチ → createFailure(error.message) 変換` → `DomainError のキャッチ → MutationError ({ error: error.message, code: error.code }) に自動変換`

- [ ] **Step 5: §「データベースエラー」「ビジネスロジックエラー (早期リターン)」「ドメイン固有エラー (ReservationOverlapError)」の例コードで Pattern A + B 適用**

具体的に以下の置換を全て行う (該当箇所は grep で `createSuccess` / `createFailure` でヒット):

```typescript
// 旧
success: () => createSuccess("スペースを更新しました"),
success: () => createSuccess("公開しました"),

// 新 (Pattern A: success callback 削除)
// (削除のみ — execute の戻り値を直接 return するため)

// 旧
return createFailure(error.message);
return createFailure("予約の作成に失敗しました");
return createFailure("操作に失敗しました");

// 新 (Pattern B)
return createMutationError(error.message);
return createMutationError("予約の作成に失敗しました");
return createMutationError("操作に失敗しました");
```

- [ ] **Step 6: §「禁止事項」§4「直接オブジェクトリテラルによる ActionResult 返却禁止」を更新**

```markdown
4. **直接オブジェクトリテラルによる MutationResult 返却禁止**
   - failure path: `createMutationError()` を使用
   - success path: domain command の戻り値 `T` を直接 return (ラッパー不要)
```

- [ ] **Step 7: §「ファイル配置」表で `@/admin/lib/admin-action` / `@/shared/lib/mutation-result` のエントリ確認 (既存の表に修正不要なら skip)**

- [ ] **Step 8: 修正後 grep で 0 件確認**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/error-handling.md
```

Expected: 0 hits

---

### Task 3: `auth-patterns.md` 修正

**Files:**

- Modify: `.claude/rules/auth-patterns.md`

**Apply Patterns:** A, B, D

**Goal:** auth-patterns.md の `executeAdminMutationResult` 例コードと NG パターンを実装一致に。

- [ ] **Step 1: 修正対象を grep で特定**

```bash
grep -nE "createSuccess|createFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/auth-patterns.md
```

Expected: 11 hits

- [ ] **Step 2: §「executeAdminMutationResult (書き込み系 — 標準パターン)」の例コードを書き換え**

```typescript
// 旧
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createSuccess } from "@/admin/types/server-actions";

export const createSpace = async (input: SpaceFormData) => {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) return createValidationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "create",
    execute: async () => createSpaceCommand(parsed.data),
    success: (result) => createSuccess("作成しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};

// 新 (Pattern A + D + C)
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";

export const createSpace = async (input: SpaceFormData) => {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "create",
    execute: async () => createSpaceCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};
// 戻り型: MutationResult<{ id: string }> = { id: string } | MutationError
```

- [ ] **Step 3: §「EDITOR ロール用リソース単位アクセス制御」の例コードで Pattern A 適用**

```typescript
// 旧
return executeAdminMutationResult({
  resource: "page",
  action: "update",
  resourceId: id,
  checkResourceAccess: true,
  execute: async (user) => updatePageCommand(id, parsed.data),
  success: (result) => createSuccess("更新しました", result),
});

// 新
return executeAdminMutationResult({
  resource: "page",
  action: "update",
  resourceId: id,
  checkResourceAccess: true,
  execute: async (user) => updatePageCommand(id, parsed.data),
});
```

- [ ] **Step 4: §「NG パターン」の `createFailure("権限がありません")` を Pattern B で置換**

```typescript
// 旧
if (session?.user.role !== "SUPER_ADMIN")
  return createFailure("権限がありません");

// 新
if (session?.user.role !== "SUPER_ADMIN")
  return createMutationError("権限がありません");
```

- [ ] **Step 5: §「Server Actions (cache() 不使用)」の `createFailure` import + 呼び出しを Pattern B + D で置換**

```typescript
// 旧
import { createFailure } from "@/shared/types/server-actions";

export async function myAction() {
  const session = await getAdminSession();
  const user = getAdminSessionUser(session);
  if (!user) {
    return createFailure("ログインが必要です");
  }
}

// 新
import { createMutationError } from "@/shared/lib/mutation-result";

export async function myAction() {
  const session = await getAdminSession();
  const user = getAdminSessionUser(session);
  if (!user) {
    return createMutationError("ログインが必要です");
  }
}
```

- [ ] **Step 6: §「`/admin/api/(auth)/login` の Server Action」等の残箇所も同パターンで一括修正**

`grep -nE "createSuccess|createFailure" .claude/rules/auth-patterns.md` で残箇所確認し、全て Pattern A + B 適用。

- [ ] **Step 7: 修正後 grep で 0 件確認**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/auth-patterns.md
```

Expected: 0 hits

---

### Task 4: `frontend/admin-ui-patterns.md` 修正 (節全削除)

**Files:**

- Modify: `.claude/rules/frontend/admin-ui-patterns.md`

**Apply Patterns:** D (節全削除)

**Goal:** 「Server Actions の型インポート」節は `@/admin/types/server-actions` パスが不在のため節そのものが dead doc。節全体を削除。

- [ ] **Step 1: 修正対象を grep で特定**

```bash
grep -nE "createSuccess|createFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/frontend/admin-ui-patterns.md
```

Expected: 8 hits (全て「Server Actions の型インポート」節および「禁止事項 #5」内)

- [ ] **Step 2: 「Server Actions の型インポート」節全体を削除**

以下のセクションを完全削除 (見出しから次の `---` または次の `##` まで):

````markdown
## Server Actions の型インポート

管理画面内の**全ファイル**（Server Actions・`'use client'` コンポーネント・hooks・型定義ファイルを問わず）は `@/admin/types/server-actions` から import する:

```typescript
// OK: 管理画面専用（Server Actions・'use client' コンポーネント・hooks すべて共通）
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/admin/types/server-actions";

// NG: 共有型を直接 import（管理画面内では禁止）
import { createSuccess, createFailure } from "@/shared/types/server-actions";
```
````

`@/admin/types/server-actions` は `@/shared/types/server-actions` の re-export に加え、`AuditUser` 型も提供する。

---

````

- [ ] **Step 3: §「禁止事項」#5「`@/shared/types/server-actions` を管理画面で直接使用禁止 — `@/admin/types/server-actions` 経由」を削除**

該当行を削除し、後続の禁止事項番号を繰り上げ (#5 → #6 → #5 化、以降全て -1)。

- [ ] **Step 4: 修正後 grep で 0 件確認**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/frontend/admin-ui-patterns.md
````

Expected: 0 hits

---

### Task 5: `implementation-quality.md` 修正

**Files:**

- Modify: `.claude/rules/implementation-quality.md`

**Apply Patterns:** A, B

**Goal:** 例コードで Pattern A + B 適用。

- [ ] **Step 1: 修正対象を grep で特定**

```bash
grep -nE "createSuccess|createFailure" .claude/rules/implementation-quality.md
```

Expected: 4 hits

- [ ] **Step 2: §1「形骸化実装禁止」の OK 例コードを書き換え**

```typescript
// 旧
export async function deleteItem(id: string) {
  return executeAdminMutationResult({
    resource: "item",
    action: "delete",
    execute: async () => {
      const item = await prisma.item.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!item) return createFailure("アイテムが見つかりません");

      await prisma.item.delete({ where: { id } });
      updateTag(CACHE_TAGS.ITEMS);
      return createSuccess("削除しました");
    },
  });
}

// 新 (Pattern A + B)
export async function deleteItem(id: string) {
  return executeAdminMutationResult({
    resource: "item",
    action: "delete",
    resourceId: id,
    execute: async () => {
      const item = await prisma.item.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!item) throw new DomainError("アイテムが見つかりません", "NOT_FOUND");

      await prisma.item.delete({ where: { id } });
      return { id };
    },
    afterSuccess: () => updateTag(CACHE_TAGS.ITEMS),
  });
}
```

(備考: `if (!item) return createFailure(...)` パターンは `executeAdminMutationResult` 内部の `execute` callback では `DomainError` throw が canonical。`createMutationError` は callback 外の Server Action 直接 return 用。)

- [ ] **Step 3: §「必須事項」§4「エラーハンドリング」の例コードを Pattern B で書き換え**

```typescript
// 旧
import { logError, ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";

try {
  await action();
} catch (error) {
  logError(error, {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: "deleteItem" },
  });
  return createFailure("操作に失敗しました");
}

// 新
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { createMutationError } from "@/shared/lib/mutation-result";

try {
  await action();
} catch (error) {
  logError(error, {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: "deleteItem" },
  });
  return createMutationError("操作に失敗しました");
}
```

- [ ] **Step 4: 修正後 grep で 0 件確認**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/implementation-quality.md
```

Expected: 0 hits

---

### Task 6: `test-quality.md` 修正

**Files:**

- Modify: `.claude/rules/test-quality.md`

**Apply Patterns:** A, D

**Goal:** 「`createSuccess` 推論サンプル」を `MutationResult<T>` の推論サンプルに置換。

- [ ] **Step 1: 修正対象を grep で特定**

```bash
grep -nE "createSuccess|ActionSuccess" .claude/rules/test-quality.md
```

Expected: 9 hits (全て `createSuccess` の推論サンプル + ActionSuccess 関連)

- [ ] **Step 2: §「型推論」関連節 (test-quality.md:253 周辺) の例コードを置換**

```typescript
// 旧
return createSuccess({ name }); // 型が推論されない場合あり
return createSuccess({ name });
const success = createSuccess(); // ActionSuccess<void>

// 新 (Pattern A + D)
return { name }; // execute callback の戻り値、型は MutationResult<{ name: string }> に統合
return { name };
return null; // void success path: MutationResult<null> = null | MutationError
```

具体的な周辺文脈は `Read` で取得して文意を保ったまま書き換える。`MutationResult<T = null>` のデフォルトジェネリクスにより `null` が success path の sentinel になることを明示。

- [ ] **Step 3: 修正後 grep で 0 件確認**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/test-quality.md
```

Expected: 0 hits

---

### Task 7: `server-actions/prohibitions.md` 修正

**Files:**

- Modify: `.claude/rules/server-actions/prohibitions.md`

**Apply Patterns:** A

**Goal:** 例コード 1 箇所書き換え。

- [ ] **Step 1: 修正対象を grep で特定**

```bash
grep -nE "createSuccess|createFailure" .claude/rules/server-actions/prohibitions.md
```

Expected: 1 hit (line 77 周辺)

- [ ] **Step 2: 該当例コードを Pattern A で書き換え**

```typescript
// 旧
return createSuccess("削除しました");

// 新 (success path は T を直接 return; 削除なら null = MutationResult<null> default)
return null;
```

または文脈次第で `return { id }` 等の意味のある戻り値に置換。`Read` で周辺文脈確認後に判断。

- [ ] **Step 3: 修正後 grep で 0 件確認**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/server-actions/prohibitions.md
```

Expected: 0 hits

---

### Task 8: `server-actions/use-cache.md` 修正

**Files:**

- Modify: `.claude/rules/server-actions/use-cache.md`

**Apply Patterns:** A

**Goal:** 例コード 2 箇所書き換え。

- [ ] **Step 1: 修正対象を grep で特定**

```bash
grep -nE "createSuccess|createFailure" .claude/rules/server-actions/use-cache.md
```

Expected: 2 hits (line 142, 153 周辺)

- [ ] **Step 2: 該当例コードを Pattern A で書き換え**

```typescript
// 旧 (line 142 周辺)
return createSuccess("投稿を作成しました", { id: post.id });

// 新
return { id: post.id };

// 旧 (line 153 周辺)
return createSuccess("投稿を削除しました");

// 新
return null;
```

- [ ] **Step 3: 修正後 grep で 0 件確認**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/server-actions/use-cache.md
```

Expected: 0 hits

---

### Task 9: `type-safety.md` Pattern F 適用 (§4 削除)

**Files:**

- Modify: `.claude/rules/type-safety.md`

**Apply Patterns:** F

**Goal:** §4「TypeScript 6.0 条件型 (`as unknown as T`)」例外節 (架空型 `ActionSuccess<T>` 使用) を全削除。

- [ ] **Step 1: 修正対象を grep で特定**

```bash
grep -nE "ActionSuccess" .claude/rules/type-safety.md
```

Expected: 2 hits (line 209, 210)

- [ ] **Step 2: §4 例外節全体を削除**

`type-safety.md` の以下のブロック (line 205-211) を完全削除:

````markdown
**4. TypeScript 6.0 条件型（`as unknown as T`）**

```typescript
// OK: 条件型を含む型への代入（TS 6.0 で厳格化）
// ActionSuccess<T> は条件型のため直接 as では不可、二段階キャストが必要
return result as unknown as ActionSuccess<T>;
```
````

````

削除後、後続の `**5. keysOf / entriesOf / omitUndefined**` の番号は据え置き (`5.` のまま、grep 互換性のため番号変更しない)。

- [ ] **Step 3: §4 削除に伴う他節からの cross-reference 確認**

`grep -n "§4\|例外 4" .claude/rules/type-safety.md` で削除節への参照がないことを確認。あれば該当文も同時更新。

Expected: 0 cross-references

- [ ] **Step 4: 修正後 grep で 0 件確認**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/type-safety.md
````

Expected: 0 hits

---

### Task 10: 全体 Verification (drift 解消の grep ground truth 検証)

**Files:** None (read-only verification)

**Goal:** spec § Verification の 5 grep コマンドで drift 解消を確定。

- [ ] **Step 1: forbidden symbol 0 件確認**

```bash
grep -rnE "createSuccess|createFailure|ActionResult|ActionSuccess|ActionFailure" .claude/rules/
```

Expected: **0 hits**

- [ ] **Step 2: forbidden import パス 0 件確認**

```bash
grep -rnE "@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/
```

Expected: **0 hits**

- [ ] **Step 3: 表記揺れ解消確認**

```bash
grep -rnE "createValidationError\b" .claude/rules/
```

Expected: **0 hits** (canonical は `createValidationMutationError`)

```bash
grep -rnE "createValidationMutationError" .claude/rules/
```

Expected: **1 件以上** (canonical 参照)

- [ ] **Step 4: 新 canonical helper / 型がヒットすることを sanity check**

```bash
grep -rnE "createMutationError|MutationResult<|isMutationError" .claude/rules/
```

Expected: ヒットあり (具体的件数は問わない、`error-handling.md` の MutationResult<T> 節 + 各ファイルの例コードで複数ヒット想定)

```bash
grep -rnE "@/admin/lib/admin-action|@/shared/lib/mutation-result" .claude/rules/
```

Expected: ヒットあり

- [ ] **Step 5: 実装側に新規シンボルが追加されていない確認 (実装変更ゼロ)**

```bash
git diff --stat src/
```

Expected: **0 files changed**

- [ ] **Step 6: 全体差分の sanity check**

```bash
git diff --stat .claude/rules/
```

Expected: 8 ファイル変更 (Modification Targets と一致)

```bash
git status --short
```

Expected: 8 ファイルすべてが ` M` (modified) 状態、`??` (untracked) や `D` (deleted) なし

---

### Task 11: Commit (1 commit で全 8 ファイル)

**Files:** None (commit only)

**Goal:** drift 解消を 1 commit に集約。中間 drift 状態を作らない。

- [ ] **Step 1: 修正対象 8 ファイルのみを stage (他の untracked / modified 混入を防ぐ)**

```bash
git add .claude/rules/error-handling.md .claude/rules/auth-patterns.md .claude/rules/frontend/admin-ui-patterns.md .claude/rules/implementation-quality.md .claude/rules/test-quality.md .claude/rules/server-actions/prohibitions.md .claude/rules/server-actions/use-cache.md .claude/rules/type-safety.md
```

- [ ] **Step 2: stage 内容の最終確認**

```bash
git diff --cached --stat
```

Expected: 8 ファイル変更、`src/` / `package.json` / `bun.lock` / `prisma/migrations/` 不在。

- [ ] **Step 3: commit (Conventional Commits 形式、lefthook commit-msg hook が type を強制)**

```bash
git commit -m "$(cat <<'EOF'
docs(rules): createSuccess/createFailure drift を MutationResult/createMutationError に統一

.claude/rules/ 配下 8 ファイルが Server Action 戻り値 SSoT として
記述していた createSuccess / createFailure / ActionResult<TData> /
@/admin/types/server-actions パス等は src/ 実装に存在せず、実装は
MutationResult<T> = T | MutationError と createMutationError で
完結していた。rule docs を実装に追従させ、Pattern A-F に基づき
8 ファイル一括修正。実装変更ゼロ、ADR 不要。

Spec: docs/superpowers/specs/2026-04-28-action-result-rule-docs-drift-design.md
Closes: Clean-Break Refactor C5 Phase 4 Finding 2 持ち越し
EOF
)"
```

Expected: lefthook prettier-fix / protected-files / conventional-commits パス、commit 成功。

- [ ] **Step 4: commit 後の最終確認**

```bash
git log --oneline -1
```

Expected: commit message が `docs(rules): createSuccess/createFailure drift を ...` で始まる、SHA が記録される。

```bash
git diff HEAD~1 --stat
```

Expected: 8 ファイル変更、insertions / deletions 数が rule docs 修正規模 (推定 200-300 行) と整合。

- [ ] **Step 5: handoff memory の Finding 2 を完了マーク**

`~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-c5-handoff.md` の `## 持ち越し: Finding 2` セクションに完了注記を追加:

```markdown
### 持ち越し: Finding 2 (createSuccess / createFailure drift)

✅ **Completed: 2026-04-28** — `docs/superpowers/plans/2026-04-28-action-result-rule-docs-drift-fix.md` で解消、commit `<新規 SHA>`。Approach 1 (rule docs を実装に追従) で 8 ファイル一括修正、実装変更ゼロ、ADR 不要。

(以下、既存内容を保持)
```

---

## Self-Review

**1. Spec coverage:**

- Spec § Modification Targets の 8 ファイル全て → Task 2-9 でカバー ✅
- Spec § Replacement Patterns A-F → Task 内で全パターン適用 ✅
- Spec § Verification の 5 grep cmd → Task 10 Step 1-5 でカバー ✅
- Spec § Phase / Commit Plan (1 commit) → Task 11 で実装 ✅

**2. Placeholder scan:** TBD / TODO / "implement later" / "Similar to Task N" なし ✅

**3. Type consistency:**

- `createMutationError` / `createValidationMutationError` / `MutationResult<T>` / `MutationError` / `executeAdminMutationResult` / `isMutationError` の名称が全 Task で一貫 ✅
- import パス (`@/shared/lib/mutation-result` / `@/admin/lib/admin-action` / `@/shared/lib/action-helpers`) が全 Task で一貫 ✅

**4. 中間 type-check 状態:** rule docs のみ修正のため type-check / lint への影響ゼロ。中間 commit 不要 (1 commit で完結)。

---

## Execution Notes

### Subagent dispatch 時の注意

- **git 全面禁止** (add / commit / push / reset / checkout / restore / stash) — controller 側で Task 11 の commit を実行
- **import alias 3 系統** — `@/admin/*` / `@/public/*` / `@/shared/*` (rule docs 内の例コードで使用、subagent が誤った prefix を付けないよう注意)
- **Plan deviation policy** — Pattern A-F 以外の追加修正が必要な場合は justified deviation として報告 (例: 周辺文脈で意味が通らない置換は Read で確認後判断)
- **Bundle 推奨** — Task 2-9 は密結合 (同一 commit に集約) のため 1 implementer に bundle dispatch。Task 10-11 は controller 実行 (verification + commit)

### Risk

- rule docs の例コードは長文の場合があり、Edit tool の `old_string` 完全一致が失敗するリスクあり (linter / prettier 整形差分)。失敗時は Read 再取得 + より長い context window で再 Edit。
- `type-safety.md` §4 削除時の前後 blank line 数 (markdown 整形) は prettier-fix が自動調整するため Step 2 は厳密な空白指定不要。

### Out of scope の再確認 (spec § Out of Scope と一致)

- `src/` 実装変更なし
- ADR 採番なし
- AGENTS.md / docs/architecture / docs/guides 配下は別 plan
