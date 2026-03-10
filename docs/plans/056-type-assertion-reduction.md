# 056: 型アサーション削減

## 概要

型アサーション（`as`）を公式ベストプラクティスに基づき削減し、コンパイル時の型安全性を強化。

## 実施内容

### Phase 3: 基盤ユーティリティ

| 対象                      | 手法                             | 削減数 |
| ------------------------- | -------------------------------- | ------ |
| `Object.keys() as Type[]` | `keysOf<T>()` / `entriesOf<T>()` | 12     |
| `filter(Boolean) as T[]`  | `filterTruthy<T>()`              | 2      |
| DOM属性パース             | `parseEnumAttribute()`           | 4      |
| PageData型                | Prisma生成型re-export            | 4      |

### Phase 4: 型ガード・Zod活用

| 対象               | 手法                       | 削減数 |
| ------------------ | -------------------------- | ------ |
| BlockType          | `isBlockType()` 型述語関数 | 1      |
| PostListWidgetType | `parseEnumAttribute()`     | 2      |
| 認証型ガード       | `Record<string, unknown>`  | 2      |
| Role enum          | `z.nativeEnum(Role)`       | -      |

## 新規ユーティリティ

```typescript
// src/shared/lib/serialize.ts

// オブジェクトキーを型安全に取得
export function keysOf<T extends object>(obj: T): (keyof T)[];

// オブジェクトエントリを型安全に取得
export function entriesOf<T extends object>(obj: T): [keyof T, T[keyof T]][];

// filter(Boolean)の型安全版
export function filterTruthy<T>(
  arr: readonly (T | false | null | undefined)[],
): T[];

// DOM属性を型安全にパース
export function parseEnumAttribute<T extends string>(
  value: string | null,
  allowedValues: readonly T[],
  defaultValue: T,
): T;
```

## 型定義パターン

```typescript
// const配列から型を派生
export const BLOCK_TYPES = ['paragraph', 'h1', 'h2', ...] as const
export type BlockType = (typeof BLOCK_TYPES)[number]

// 型ガード関数
export function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value)
}
```

## 結果

- **84箇所 → 57箇所（-27箇所、32%削減）**
- 残り57箇所の内訳:
  - importエイリアス: 5件（型アサーションではない）
  - Prisma生成コード: 2件（自動生成）
  - DOM API必須: 18件（event.target, getElementById等）
  - JSON/unknown: 10件（実行時データ）
  - ライブラリ制約: 8件（React Hook Form等）
  - その他正当な理由: 14件

## 変更ファイル一覧

### ユーティリティ

- `src/shared/lib/serialize.ts`

### 型定義

- `src/shared/lib/validations/page.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/types.ts`

### Lexicalエディタ

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/ButtonNode.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/DividerNode.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/CalloutNode.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/PostListWidgetNode.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/PostListWidgetComponent.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/PostListWidgetPlugin.tsx`

### Server Actions

- `src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts`

### 認証・フォーム

- `src/shared/lib/auth.ts`
- `src/app/(admin)/admin/(dashboard)/staff/_components/UserForm.tsx`

### その他

- `src/app/(public)/_shared/components/sections/SectionRenderer.tsx`
