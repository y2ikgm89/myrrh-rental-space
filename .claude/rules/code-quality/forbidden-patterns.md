---
description: コード品質 — 禁止事項 (形骸化実装 / 過剰抽象 / 後方互換ハック / デッドコード / ドメインコマンド共通ロジック helper / SSoT 違反 sign)
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# Code Quality 禁止事項

> 形骸化実装 / 過剰抽象化 / 後方互換ハック / デッドコード / 共通ロジック helper / SSoT 違反 sign（Dead column / 改行 split / Twin queries drift）。

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

### 6. SSoT 違反 sign（コードスメル検出）

以下の sign は構造的問題の表れ。新規コードに持ち込まない / 検出時はリファクタを優先する:

#### Dead column sign

- **検出**: フォームヒントに「上記の項目から自動生成されません」「手動で入力してください」
- **構造**: 構造化フィールド（`postalCode` + `prefecture` + `city` 等）が既にあるのに display 用カラム（`Settings.address` 等）を並走
- **対処**: 構造化フィールドから派生関数（`formatXxxAddress(entity)`）に一本化し、display 用カラムを destructive migration で削除
- **業界標準**: Stripe / Shopify / Google Address Validation API
- **実例**: `Settings.address` 削除（migration `20260501033054_drop_settings_address`）

#### 改行 split sign

- **検出**: 公開側で `value.split("\n")` / `\r\n+` 等の改行 split 配列展開している `String? @db.Text` カラム
- **構造**: 入力が `Textarea`（改行区切り plain text）/ 公開描画が配列の semantic gap
- **対処**: データ層を `Json @default("[]")` 配列化 + useFieldArray + dnd-kit 入力 UI に揃える
- **業界標準**: Eventbrite / connpass の構造化アクセス入力、shadcn / Linear / Stripe Dashboard の構造化リスト編集
- **実例**: `Location.access String?` → `Location.accessLines Jsonb` 配列化（migration `20260501040959_location_access_to_jsonb_array`）+ `LocationForm.tsx` に `AccessLinesField` 導入

#### Twin queries drift sign

- **検出**: 同 model に対する複数の `'use cache'` / 公開 fetch helper があり、片方のみ publication filter 持ち
- **silent leak**: `getPublicPage(slug)` が `where: { isPublished: true, isActive: true }` を持つのに `getPageSeo(slug)` が `{ slug }` だけ → draft 本文は 404 でも metadata（OGP / `<meta>` tag）は公開ページに流出
- **対処**: 全 helper に同 filter を伝播。新規 SEO/metadata query 追加時は対応する content query の `where` を grep + 同期
- **実例**: 2026-05-07 修正、`isPublished: true, isActive: true` を `getPageSeo` に追加
