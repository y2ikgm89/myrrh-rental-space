# 010-withauth-badge-improvements.md

withAuth HOF完全移行 + Badge variant意味的整合

## 完了日

2026-01-11

## 背景

前回のコードレビューで指摘された2つの改善点を実装:
1. withAuth HOFが未使用 → 全mutation関数に適用
2. Badge variantの意味的不整合 → セマンティックな色に修正

## 実装内容

### 1. withAuth HOF完全移行（69関数）

全Server Actions mutation関数をwithAuth HOFパターンに移行。

**変更パターン**:
```typescript
// Before
export async function createX(data: XInput): Promise<ActionResult<T>> {
  try {
    await requireAdmin()
    // business logic
    return createSuccess('message')
  } catch (error) {
    console.error('error:', error)
    return createFailure('message')
  }
}

// After
export const createX = withAuth(async (_user, data: XInput) => {
  // business logic (no try-catch for auth)
  return createSuccess('message')
})
```

**対象ファイル（11ファイル）**:

| ファイル | 移行関数数 |
|---------|-----------|
| blog.ts | 8 |
| settings.ts | 14 |
| api-keys.ts | 11 |
| navigation.ts | 8 |
| space.ts | 4 |
| user.ts | 4 |
| news.ts | 4 |
| customer.ts | 3 |
| reservation.ts | 3 |
| inquiry.ts | 2 |
| announcement-bar.ts | 4 (+auth()→withAuth統一) |
| **合計** | **65+4=69** |

**メリット**:
- 認証ボイラープレート削除（try-catch + requireAdmin()）
- 統一されたエラーハンドリング
- userコンテキストへのアクセス
- 型推論が維持される

### 2. Badge variant意味的整合

ステータスの意味に合わせて色を修正。

**変更内容**:

| ステータス型 | ステータス | Before | After | 理由 |
|-------------|----------|--------|-------|------|
| **InquiryStatus** | NEW | destructive (赤) | warning (黄) | 新規は「要対応」であり「エラー」ではない |
| **InquiryStatus** | IN_PROGRESS | default (青) | pending (青) | 明示的な「処理中」バリアント |
| **InquiryStatus** | RESOLVED | secondary (灰) | success (緑) | 解決は「成功」 |
| **CustomerStatus** | NEW | default (青) | warning (黄) | 新規顧客は「注目」 |
| **CustomerStatus** | REGULAR | secondary (灰) | success (緑) | リピーターは「価値ある」 |
| **PublishStatus** | published | default (青) | success (緑) | 公開中は「アクティブ」 |

### 3. 重複コード削除

- `CustomerDetail.tsx`のインラインreservationStatusLabels定義を削除
- 共通の`ReservationStatusBadge`コンポーネントを使用

## 変更ファイル

### Server Actions（11ファイル）
- `src/actions/admin/blog.ts`
- `src/actions/admin/settings.ts`
- `src/actions/admin/api-keys.ts`
- `src/actions/admin/navigation.ts`
- `src/actions/admin/space.ts`
- `src/actions/admin/user.ts`
- `src/actions/admin/news.ts`
- `src/actions/admin/customer.ts`
- `src/actions/admin/reservation.ts`
- `src/actions/admin/inquiry.ts`
- `src/actions/admin/announcement-bar.ts`

### コンポーネント（2ファイル）
- `src/components/admin/status-badges.tsx`
- `src/app/admin/customers/[id]/_components/CustomerDetail.tsx`

## 検証結果

- `bun run type-check` - 成功
- `bun run lint` - 警告のみ（既存のReact Hook Form互換性警告）
- `bun run build` - 成功

## 注意事項

### Query関数は対象外
`getX`, `listX`などの読み取り専用関数は従来のrequireAdmin()パターンを維持。
理由: withAuthはActionResult<T>を返すmutation関数向けに設計されている。

### announcement-bar.tsの認証統一
auth()直接呼び出しからwithAuth HOFに移行。
これにより認証パターンがプロジェクト全体で統一された。
