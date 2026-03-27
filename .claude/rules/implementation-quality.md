---
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# 実装品質ルール

## 禁止事項

### 1. 形骸化実装禁止

```typescript
// NG: 空の関数
async function syncCalendar() {
  // TODO: implement
}

// NG: エラー握りつぶし
try {
  await save(data);
} catch {
  /* ignore */
}

// NG: 常に成功を返す
export async function deleteItem(id: string) {
  return { success: true }; // 実際の削除処理がない
}

// OK: executeAdminMutationResult パターンで完全な実装
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
```

### 2. 過剰な抽象化禁止

```typescript
// NG: 1回しか使わないユーティリティ
function formatSingleDate(date: Date): string {
  return date.toLocaleDateString("ja-JP");
}

// NG: 将来の拡張のための過剰設計
// 理由: 使われないインターフェースはメンテナンスコストだけが増大する
interface PluginSystem {
  register(plugin: Plugin): void;
  unregister(name: string): void;
  // ... 使われないインターフェース
}

// OK: 必要最小限。同じパターンが3箇所以上で出現してから抽象化を検討
const formatted = date.toLocaleDateString("ja-JP");
```

### 3. 後方互換ハック禁止

```typescript
// NG: 未使用変数のリネーム
const _oldFunction = () => {}; // 削除すべき

// NG: 削除コメント
// removed: export function legacyHelper() { ... }

// NG: 不要な re-export
export type { OldType as NewType }; // 型エイリアスは不要（prisma-patterns.md 参照）

// OK: 不要なコードは完全削除。参照元も更新
// 削除前: export function legacyHelper() { ... }
// 削除後: ファイルを削除し、参照元で直接実装を使用
```

### 4. デッドコード禁止

```typescript
// NG: 到達不能コード
function getValue(type: 'a' | 'b') {
  if (type === 'a') return 1
  if (type === 'b') return 2
  return 0  // 到達不能

// NG: 使われないインポート
import { unused } from '@/shared/lib/utils'

// OK: 使われないコードは削除
function getValue(type: 'a' | 'b') {
  if (type === 'a') return 1
  return 2  // type === 'b' のみ残り得る
}
```

### 5. ドメインコマンドの共通ロジックはヘルパー関数に抽出

重複チェック・顧客統計更新・ペイロード構築など、複数コマンドで共有するロジックはヘルパー関数に抽出する:

```typescript
// NG: 同じ統計更新ロジックが create/update/cancel に散在
await tx.customer.update({
  where: { id: customerId },
  data: {
    totalReservations: { increment: 1 },
    lastReservationAt: new Date(),
  },
});

// OK: ヘルパー関数に抽出
await updateCustomerStats(tx, customerId, "increment");
```

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

// OK: logError で構造化ログ + createFailure で返す
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
```

## Server Action 実装パターン

→ `error-handling.md` の `executeAdminMutationResult` パターンを参照。
