---
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# コード品質ルール

> 形骸化実装・過剰抽象化・後方互換ハック・デッドコードの禁止と最小実装の原則。
> ドメイン Gotchas（外部 API / cache / framework 固有）は path-scoped rule に分散済み（→ `api-routes.md` / `auth-patterns.md` / `resend-patterns.md` / `external-api-retry-patterns.md` / `ical-patterns.md` / `prisma-patterns.md` / `react/gotchas.md` / `server-actions/use-cache.md` / `tailwind-patterns/*` / `frontend/project-design-config.md`）。

## 必須事項

### 1. コードを書く前に読む

- 変更対象ファイルと関連ファイルを必ず確認
- 既存パターン・命名規則に従う
- 同じ責務の既存実装がないか確認（重複実装を防ぐ）

### 2. 変更は最小限に

- 要求された変更のみ実装
- 「ついでに」のリファクタリング・コメント追加・型注釈追加をしない
- 変更していないコードに docstring やコメントを追加しない

### 3. 検証を行う

- `bun run type-check` でコンパイル確認
- `bun run lint` でリント確認
- `bun run validate` で両方を並列実行
- コミット前は `bun run validate && bun run build`

### 4. エラーハンドリング

```typescript
// NG: エラーを無視
try {
  await action();
} catch {}

// NG: console.log だけ
try {
  await action();
} catch (e) {
  console.log(e);
}

// OK: logError で構造化ログ + createMutationError で返す
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

## Server Action 実装パターン

→ `error-handling.md` の `executeAdminMutationResult` パターンを参照。
