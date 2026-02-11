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
| `value as 'a' \| 'b' \| 'c'`（Select onChange等） | Set-based型ガード + if文 |

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

### Select / SelectionBox の onChange 型絞り込み

UIコンポーネントの `onChange` は `string` を返すため、型アサーションではなく `enums.ts` の型ガードで絞り込む:

```typescript
import { isValidDiscountType, getValidDiscountType } from '@/shared/lib/validations/enums'

// NG: 型アサーション
onValueChange={(value) => setType(value as DiscountType)}

// OK: isValid* 型ガード
onValueChange={(value) => { if (isValidDiscountType(value)) setType(value) }}

// OK: getValid* デフォルト値付き（DB値やフォーム初期値のパースに最適）
const taxRate = getValidTaxRateType(settings.taxRateType)  // デフォルト: standard

// OK: enum型をonValueChangeの型引数に使用（Prisma enumと一致する場合）
onValueChange={(value: CalendarSyncMethod) => setMethod(value)}
```

## ユーティリティ

- `keysOf()` - 型安全な Object.keys（`@/shared/lib/serialize.ts`）
- `isValid*()` - Prisma enum型ガード（`@/shared/lib/validations/enums.ts`）
- `getValid*()` - デフォルト値付きenum取得（`@/shared/lib/validations/enums.ts`）

場所: `src/shared/lib/serialize.ts`, `src/shared/lib/validations/enums.ts`
