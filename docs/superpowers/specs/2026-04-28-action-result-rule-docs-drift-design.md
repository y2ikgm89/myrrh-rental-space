---
status: draft
priority: medium
date: 2026-04-28
type: design-spec
related:
  - memory: project_clean-break-c5-handoff.md (Finding 2)
  - rule: gotchas/deployment.md (`MutationResult<T>` は ラッパーでない 既存 learning)
---

# ActionResult / createSuccess / createFailure rule docs drift 解消

> **Snapshot: 2026-04-28** — Clean-Break Refactor C5 Phase 4 完了時に持ち越された Finding 2 を独立 plan として扱う design spec

## Summary

`.claude/rules/` 配下の 7 ファイルが、Server Action の戻り値 SSoT として `createSuccess` / `createFailure` ヘルパーと `ActionResult<TData>` ラッパー型を canonical pattern として記述しているが、`src/` 実装には一切存在せず、実装は `MutationResult<T> = T | MutationError` と `createMutationError` だけで動作している。本 spec は **rule docs を実装に追従させる方針 (Approach 1)** で drift を解消する。実装変更ゼロ、1 commit で完結。

## Why (背景・経緯)

Clean-Break Refactor C5 Phase 4 完了時 (2026-04-28、commit `da3e2ede`) に発見された rule docs 側 drift。C5 のスコープ (skills / rules / subagents / docs の公式ベストプラクティス準拠 audit) 内で発覚したが、`auth-patterns.md` / `error-handling.md` / `admin-ui-patterns.md` 等を跨ぐ helper / 型レベルの整合化作業のため、別 plan に持ち越された (`project_clean-break-c5-handoff.md` § Finding 2)。

実装側は `executeAdminMutationResult` (admin-action.ts) と `MutationResult<T>` (mutation-result.ts) で完結しており、`createSuccess` / `createFailure` / `ActionResult` / `@/admin/types/server-actions` / `@/shared/types/server-actions` のいずれも実在しない。`gotchas/deployment.md` の既存 learning「`MutationResult<T>` は `T | MutationError` で `{ data: T }` ラッパーではない」と整合する canonical 実装が、rule docs 側にだけ反映されていない。

**ADR 不要**: 実装は変更しないため public API breaking なし。rule docs 内部 drift の解消は ADR 対象外 (CLAUDE.md §公式 API 準拠の原則 #4「`@theme` / SSoT / ルール docs の整合を同一コミットで保つ」と整合)。

## Scope

### In Scope

- 7 rule docs ファイルの helper / 型 / import 表記を実装 (`MutationResult<T>` / `createMutationError` / `executeAdminMutationResult`) と一致化
- 5 置換パターン (Pattern A-E、後述) を適用
- `error-handling.md` の型定義節 (`ActionSuccess` / `ActionFailure` / `ActionResult`) を `MutationResult<T>` / `MutationError` に置換

### Out of Scope

| 項目                                                                                       | 理由                                                           |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `src/` の実装変更                                                                          | 実装が canonical、drift 解消は rule docs 側のみで完結          |
| `usePublicForm` / `executeAdminAction` 等の hook 側パターン                                | 既存 learning (`gotchas/deployment.md`) と整合済               |
| `MutationResult<T = null>` の `T = null` ジェネリクス設計議論                              | 実装の設計判断、Finding 2 の対象外                             |
| 例コードに散在する `executeAdminMutationResult` 戻り型注釈の網羅追加                       | 必要箇所のみ最小限。例コード簡潔性優先                         |
| ADR 0019 (`fireAndForget` 監査ログ実行順序契約) の見直し                                   | 既存 ADR は実装と整合済み、Finding 2 とは独立                  |
| `error-handling.md` § 一時的障害のリトライ (`withRetry`) など Server Action 戻り値以外の節 | drift なし                                                     |
| AGENTS.md / docs/architecture / docs/guides 配下の整合検証                                 | rule docs 内部 drift 解消が今回 scope。docs 側は別 plan で扱う |

## Implementation Approach

**Approach 1: Full rewrite to `executeAdminMutationResult` + `MutationResult<T>`** を採用。

代替案 (Approach 2 の two-phase / Approach 3 の SSoT 集約) は brainstorming 段階で却下:

- Approach 2: 中間 commit に意味のある checkpoint なし (helper と型は不可分)
- Approach 3: 構造変更が大きすぎて Finding 2 のスコープを超え、別 plan ("rule docs SSoT 集約") に切り出すべき

1 commit で全 7 ファイル一括修正。中間 drift 状態を作らない。

## Modification Targets (7 files)

| File                                           | 主な修正                                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/rules/error-handling.md`              | `ActionResult` 型定義節を削除し `MutationResult<T>` 節に置換。例コード書き換え (`createSuccess` / `createFailure` → 直接 return / `createMutationError`) |
| `.claude/rules/auth-patterns.md`               | 例コード書き換え (`success:` callback 削除、`createSuccess` / `createFailure` 削除、import パス修正)                                                     |
| `.claude/rules/frontend/admin-ui-patterns.md`  | "Server Actions の型インポート" 節を全削除 (`@/admin/types/server-actions` パス不在のため節そのものが dead doc)                                          |
| `.claude/rules/implementation-quality.md`      | 例コード書き換え (`createSuccess` / `createFailure` 置換)                                                                                                |
| `.claude/rules/test-quality.md`                | 例コード書き換え (`createSuccess` 推論サンプルを `MutationResult<T>` に変更)                                                                             |
| `.claude/rules/server-actions/prohibitions.md` | 例コード 1 箇所書き換え                                                                                                                                  |
| `.claude/rules/server-actions/use-cache.md`    | 例コード 2 箇所書き換え                                                                                                                                  |

## Replacement Patterns

### Pattern A — `executeAdminMutationResult` 内の `success:` callback 削除

実装の `ExecuteAdminMutationResultOptions<TData>` 型に `success` プロパティは存在しない。`execute` の戻り値 `T` が直接 `MutationResult<T>` の success パスとして返される。

```typescript
// 旧 (架空)
return executeAdminMutationResult({
  resource: "post",
  action: "create",
  execute: async () => createPostCommand(parsed.data),
  success: (result) => createSuccess("投稿を作成しました", result), // 削除
  afterSuccess: () => updateTag(CACHE_TAGS.POSTS),
});

// 新 (実装一致)
return executeAdminMutationResult({
  resource: "post",
  action: "create",
  execute: async () => createPostCommand(parsed.data),
  afterSuccess: () => updateTag(CACHE_TAGS.POSTS),
  resolveAuditResourceId: (data) => data.id,
});
// 戻り型: MutationResult<{ id: string }> = { id: string } | MutationError
```

### Pattern B — failure helper 置換

```typescript
// 旧
return createFailure("削除に失敗しました");
return createFailure("入力内容に誤りがあります", { email: ["..."] });

// 新
return createMutationError("削除に失敗しました");
return createMutationError("入力内容に誤りがあります", { email: ["..."] });
```

### Pattern C — Validation helper 表記統一

```typescript
// 旧 (rule docs 表記)
import { createValidationError } from "@/shared/lib/action-helpers";

// 新 (実装一致)
import { createValidationMutationError } from "@/shared/lib/action-helpers";
```

### Pattern D — Import パス修正

```typescript
// 旧 (不在パス)
import { createSuccess, createFailure } from "@/admin/types/server-actions";
import { createSuccess, createFailure } from "@/shared/types/server-actions";

// 新 (実在パス)
import { createMutationError } from "@/shared/lib/mutation-result";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
```

### Pattern E — 型定義節の置換 (`error-handling.md` のみ)

```typescript
// 旧 (架空)
type ActionSuccess<TData = void> = {
  readonly success: true;
  readonly message: string;
} & (TData extends void ? {} : { readonly data: TData });

type ActionFailure = {
  readonly success: false;
  readonly error: string;
  readonly fieldErrors?: Record<string, string[]>;
};

type ActionResult<TData = void> = ActionSuccess<TData> | ActionFailure;

// 新 (実装一致)
type MutationError = {
  readonly error: string;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
};

type MutationResult<T = null> = T | MutationError;

function createMutationError(
  error: string,
  fieldErrors?: Record<string, string[]>,
  code?: string,
): MutationError;

function isMutationError(result: unknown): result is MutationError;
```

## Canonical API Reference (実装 SSoT)

実装ファイル一覧と公開 API。後続 plan / implementer はこの表を ground truth として参照する。

| Symbol                              | Path                           | Signature / Type                                                                                                                                        |
| ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MutationResult<T = null>`          | `@/shared/lib/mutation-result` | `T \| MutationError`                                                                                                                                    |
| `MutationError`                     | `@/shared/lib/mutation-result` | `{ error: string; code?: string; fieldErrors?: Record<string, string[]> }`                                                                              |
| `createMutationError`               | `@/shared/lib/mutation-result` | `(error: string, fieldErrors?: Record<string, string[]>, code?: string) => MutationError`                                                               |
| `isMutationError`                   | `@/shared/lib/mutation-result` | `(result: unknown) => result is MutationError`                                                                                                          |
| `createValidationMutationError`     | `@/shared/lib/action-helpers`  | `(zodError: ZodError) => MutationError`                                                                                                                 |
| `executeAdminMutationResult<TData>` | `@/admin/lib/admin-action`     | `(options: { resource, action, execute, afterSuccess?, resolveAuditResourceId?, resourceId?, checkResourceAccess? }) => Promise<MutationResult<TData>>` |

**execute 関数の契約**: `execute: (user: AdminUser) => Promise<TData>` で `TData` を直接返す。success message ラッパー不要。failure は `DomainError` を throw すれば `executeAdminMutationResult` が自動で `MutationError` に変換。

## Verification

修正完了後、以下の grep ground truth コマンドが全て期待値を返すことを必須とする。

```bash
# 1. 不在 helper / 不在型の参照ゼロ確認
grep -rnE "createSuccess|createFailure|ActionResult|ActionSuccess|ActionFailure" .claude/rules/
# 期待: 0 件

# 2. 不在 import パスゼロ確認
grep -rnE "@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/
# 期待: 0 件

# 3. 表記揺れ解消確認
grep -rnE "createValidationError\b" .claude/rules/
# 期待: 0 件 (canonical は createValidationMutationError)

grep -rnE "createValidationMutationError" .claude/rules/
# 期待: 1 件以上 (canonical 参照)

# 4. 新 canonical helper / 型がある程度ヒット (sanity check)
grep -rnE "createMutationError|MutationResult<|isMutationError" .claude/rules/
# 期待: ヒットあり

grep -rnE "@/admin/lib/admin-action|@/shared/lib/mutation-result" .claude/rules/
# 期待: ヒットあり

# 5. 実装側に新規シンボルが追加されていない確認 (実装変更ゼロ)
git diff --stat src/
# 期待: 0 ファイル変更
```

`bun run validate` への影響なし (rule docs は型 / lint 対象外)。

## Risk

| Risk                                                                             | 対処                                                                                                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rule docs 修正中に「`success:` callback が機能しているように見える例」を見落とす | 全 7 ファイル grep 後、修正対象数を事前カウントしてチェックリスト化                                                                                           |
| 例コードの戻り型注釈が型推論と乖離                                               | `MutationResult<{ id: string }>` 等の型注釈は最小限に絞る (例コード簡潔性優先)                                                                                |
| `createValidationError` → `createValidationMutationError` への置換漏れ           | grep ground truth で全置換確認 (Verification §3)                                                                                                              |
| 例コード簡潔化で読み手が `executeAdminMutationResult` の使い方を理解しにくくなる | `error-handling.md` § Server Action エラーパターン を canonical 例として残し、他ファイルから cross-reference する形を維持 (Approach 3 の構造化までは行わない) |
| 後方互換破壊と判定されるか                                                       | rule docs のみ修正は ADR 不要。実装は変更ゼロのため public API breaking なし                                                                                  |

## Phase / Commit Plan

C5 パターン (1 plan / 1 セッション規律)。phase 分割 **不要**。

```
1 commit: docs(rules): createSuccess/createFailure drift を MutationResult/createMutationError に統一
```

drift は不可分のため中間状態を作らない。

## Related

- C5 handoff: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-c5-handoff.md` § Finding 2
- 既存 learning: `.claude/rules/gotchas/deployment.md` § `MutationResult<T>` は `T | MutationError` で `{ data: T }` ラッパーではない
- 関連 ADR: なし (内部 drift 解消は ADR 対象外)
- 実装ファイル:
  - `src/shared/lib/mutation-result.ts` (`MutationResult<T>` / `MutationError` / `createMutationError` / `isMutationError`)
  - `src/shared/lib/action-helpers.ts` (`createValidationMutationError`)
  - `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts` (`executeAdminMutationResult`)
