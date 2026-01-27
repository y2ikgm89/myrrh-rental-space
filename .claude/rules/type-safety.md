# 型安全ルール

## 型アサーション（`as`）禁止

以下の例外を除き、型アサーションを使用しない:

- DOM要素のイベントターゲット（`event.target as HTMLElement`）
- 外部ライブラリの型要件（Prisma生成コード等）

## 代替手段

| パターン | 代替 |
|----------|------|
| `Object.keys(obj) as T[]` | `keysOf(obj)`（`@/shared/lib/serialize`） |
| `value as UnionType` | Set-based型ガード関数 |
| `{ ... } as Record<K, V>` | `satisfies`キーワード |
| `value as EnumType` | `@/shared/lib/validations/enums.ts`の型ガード |

## 例

```typescript
// NG: 型アサーション
const keys = Object.keys(config) as ConfigKey[]
const tab = params.tab as TabType

// OK: 型安全な代替
const keys = keysOf(config)
const tab = isValidTab(params.tab) ? params.tab : 'default'

// OK: satisfies
const config = {
  active: { label: '有効', variant: 'success' },
} satisfies Record<string, StatusConfig>
```

## ユーティリティ

- `keysOf()` - 型安全な Object.keys
- `createTypeGuard()` - Set-based型ガード生成
- `parseTypedValue()` - URLパラメータ検証

場所: `src/shared/lib/serialize.ts`, `src/shared/lib/validations/enums.ts`
