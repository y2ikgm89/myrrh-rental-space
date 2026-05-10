---
description: Prisma 7 mapped enum の使い方・型ガード SSoT・SelectItem 値・拡張時チェックリスト
paths:
  - src/shared/lib/validations/enums.ts
  - src/shared/lib/validations/enums/**
  - src/shared/generated/prisma/**
  - src/**/actions/**/*.ts
  - src/**/queries/**/*.ts
  - src/shared/domain/**/*.ts
---

# Prisma Enum パターン

> Prisma 7 mapped enum (`@map`) は TS 側で `as const` オブジェクトとして生成される。型ガード・デフォルト値・直接使用パターンの SSoT。

## 1. Prisma enum 定数を使用（文字列リテラル禁止）

Prisma 7 の `@map` enum は TypeScript 側で `as const` オブジェクトとして生成される。
**文字列リテラルではなく enum 定数を使用すること**:

```typescript
import { DiscountType, CalendarSyncMethod } from '@/shared/generated/prisma/client'

// NG: 文字列リテラル比較
if (space.discountType === 'none') { ... }
const defaultValue = 'polling'

// OK: Prisma enum 定数
if (space.discountType === DiscountType.none) { ... }
const defaultValue = CalendarSyncMethod.polling
```

**注意**: `@map` enum の TS 値はスキーマメンバー名（例: `post_name`）。DB マッピング値（例: `post-name`）ではない。

**Prisma 7 既知バグ（v7.2.0〜）**: mapped enum 値を Prisma Client 操作に渡すとランタイムエラーが発生する場合がある（[#28591](https://github.com/prisma/prisma/issues/28591)）。修正が出るまでは本コードベースの既存パターンに従い、enum 定数を使用し続ける。

## 2. 型ガードは enums.ts に集約（Single Source of Truth）

全 Prisma enum の型ガード（`isValid*`）とデフォルト値取得（`getValid*`）は `enums.ts` に一元化。
**ローカルファイルに型ガードを定義しない**:

```typescript
// NG: ローカルファイルに型ガードを定義
const VALID_TYPES = new Set<string>(Object.values(DiscountType))
function isDiscountType(value: unknown): value is DiscountType { ... }

// OK: enums.ts から import
import { isValidDiscountType, getValidDiscountType } from '@/shared/lib/validations/enums'

// 使用例（SelectionBox / Select の onChange）
onChange={(value) => {
  if (isValidDiscountType(value)) setDiscountType(value)
}}

// 使用例（デフォルト値付きパース — DB 値やフォーム初期値に最適）
const type = getValidDiscountType(rawValue)                       // デフォルト: DiscountType.none
const type = getValidDiscountType(rawValue, DiscountType.percentage)  // カスタムデフォルト
```

内部実装（参考）— `Set` による O(1) ルックアップ:

```typescript
// enums.ts 内部（編集禁止。パターン参照のみ）
const VALID_DISCOUNT_TYPES = new Set<string>(Object.values(DiscountType));

export function isValidDiscountType(value: unknown): value is DiscountType {
  return typeof value === "string" && VALID_DISCOUNT_TYPES.has(value);
}
```

## 3. Prisma enum を直接使用（型エイリアス不要）

型エイリアスによる間接参照は不要。Prisma enum を直接使用する:

```typescript
// NG: 型エイリアス（削除済み。追加禁止）
export type SpaceDiscountType = DiscountType;

// OK: Prisma enum を直接使用
import { DiscountType } from "@/shared/generated/prisma/client";
type Foo = { discountType: DiscountType };
```

## 4. SelectItem 値に enum 定数を使用

```tsx
// NG:
<SelectItem value="polling">ポーリング</SelectItem>

// OK:
<SelectItem value={CalendarSyncMethod.polling}>ポーリング</SelectItem>
```

## 5. 禁止事項（enum 関連）

| 禁止                                                               | 代替                                              |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| `'none'`, `'polling'` 等の文字列リテラル比較                       | `DiscountType.none`, `CalendarSyncMethod.polling` |
| `new Set(['none', 'percentage', 'fixed'])`                         | `enums.ts` の `isValid*` / `getValid*` を使用     |
| `export type Foo = 'a' \| 'b'`（Prisma enum と同じ値）             | Prisma enum を直接使用                            |
| `.default('none')` （Zod スキーマ）                                | `.default(DiscountType.none)`                     |
| ローカルファイルに `isValid*` / `new Set(Object.values(...))` 定義 | `enums.ts` から import                            |
| `export type Foo = PrismaEnum`（不要な型エイリアス）               | Prisma enum を直接使用                            |
| `z.nativeEnum(DiscountType)` （Zod 4 非推奨）                      | `z.enum(DiscountType)`                            |

## 6. 配置規則（enum 関連）

| ファイル                            | 内容                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `@/shared/generated/prisma/client`  | Prisma 生成 enum 定数（自動生成、編集禁止）                                                      |
| `@/shared/lib/validations/enums.ts` | 全 enum の型ガード（`isValid*`）、デフォルト値取得（`getValid*`）、re-export、フィルターヘルパー |
| 各ドメインファイル                  | enum 定数の import のみ。型ガードは `enums.ts` から import                                       |

## 7. Enum 拡張時のチェックリスト

新しい enum 値を追加した場合、以下を **すべて** 確認すること:

- Badge コンポーネント（ステータス表示）
- Filter / Select の選択肢
- Calendar 色マッピング
- Zod schema（`z.enum()`）
- 統計クエリ（`count({ where: { status } })`）
- カレンダー同期ロジック
- `prisma/seed.ts`

## 8. Customer / Inquiry フィールド追加時のチェックリスト

モデルにフィールドを追加した場合、以下を **すべて** 確認すること:

- `types.ts`（型定義）
- `queries.ts`（全 `select` 句）
- `customer-queries.ts`（顧客マイページ用 `select` 句 — 一覧用 `LIST_SELECT` と詳細用 `DETAIL_SELECT` の両方）
- 管理画面 Form / Detail / Table コンポーネント
- マイページ詳細・一覧コンポーネント（props 型の同期）
- メール `types` / テンプレート
- `prisma/seed.ts`
- テスト
- カレンダー同期（予約関連のみ）
- ドメインコマンドの `CUSTOMER_SELECT` 定数
