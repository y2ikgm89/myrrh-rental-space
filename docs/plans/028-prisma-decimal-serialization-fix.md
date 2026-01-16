# 028: Prisma Decimal シリアライゼーション修正

## 概要

`SpaceListSection.tsx` で発生していた Prisma Decimal 型のシリアライゼーションエラーを修正。

## 背景

### エラー内容
```
Only plain objects can be passed to Client Components from Server Components. Decimal objects are not supported.
```

### 原因
- `prisma.space.findMany()` が返す `Space` オブジェクトに Prisma Decimal 型のフィールドが含まれていた
- 該当フィールド: `area`, `hourlyPrice`, `dailyPrice`
- Prisma の `Decimal` 型は `decimal.js` ライブラリのオブジェクトで、JSON シリアライズ不可

## 実施内容

### 変更ファイル
- `src/components/site/sections/SpaceListSection.tsx`

### 変更内容

#### 1. SerializedSpace 型の定義
```typescript
type SerializedSpace = Omit<Space, 'area' | 'hourlyPrice' | 'dailyPrice'> & {
  area: number | null
  hourlyPrice: number
  dailyPrice: number | null
}
```

#### 2. getSpaces 関数での変換処理追加
```typescript
async function getSpaces(
  maxItems: number,
  showOnlyPublished: boolean
): Promise<SerializedSpace[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag('spaces')

  try {
    const spaces = await prisma.space.findMany({...})

    // Prisma Decimal → number 変換（シリアライズ可能にする）
    return spaces.map((space) => ({
      ...space,
      area: space.area?.toNumber() ?? null,
      hourlyPrice: space.hourlyPrice.toNumber(),
      dailyPrice: space.dailyPrice?.toNumber() ?? null,
    }))
  } catch {
    return []
  }
}
```

#### 3. SpaceCardProps の型更新
```typescript
interface SpaceCardProps {
  space: SerializedSpace  // Space → SerializedSpace
}
```

## 既存パターンとの整合性

本修正は `src/actions/admin/space.ts` で確立されている変換パターンに準拠:

```typescript
// src/actions/admin/space.ts:100-109
const formattedSpaces: SpaceWithStats[] = spaces.map((s) => ({
  ...s,
  area: s.area ? Number(s.area) : null,
  hourlyPrice: Number(s.hourlyPrice),
  dailyPrice: s.dailyPrice ? Number(s.dailyPrice) : null,
  // ...
}))
```

## テスト結果

- [x] SpaceListSection.tsx の型チェック成功
- [x] lint 成功
- [ ] build（既存の isSystemPage 関連エラーにより未完了 - 本修正とは無関係）

## 注意事項

今後 Prisma Decimal 型を使用するコードを追加する際は、同様のパターンで変換が必要:

```typescript
// 必須パターン
{
  area: decimal.area?.toNumber() ?? null,      // Decimal? → number | null
  hourlyPrice: decimal.hourlyPrice.toNumber(), // Decimal → number
  dailyPrice: decimal.dailyPrice?.toNumber() ?? null, // Decimal? → number | null
}
```
