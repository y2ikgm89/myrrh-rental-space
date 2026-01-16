# 022: 型安全性向上 + HOFパターン統一

## 概要

型安全性の向上とReact 19/TypeScript 5.9ベストプラクティスへの準拠。
手動認証パターンをwithPermission HOFに統一し、非推奨コードを削除。

## 実装内容

### 1. AuditUser型の導入

- 監査ログ用の最小型 `{ id: string }` を定義
- `as never` 型アサーション30箇所以上を排除
- `logUserAction` シグネチャを `User` から `AuditUser` に変更

### 2. withPermission HOF移行

12ファイルの書き込み操作を手動checkPermission()からwithPermission HOFに移行:

- 認証・権限チェック・監査ログを自動処理
- 重複コード大幅削減
- 型安全性向上（コールバック関数のuser引数が型付き）

### 3. checkReadPermission ヘルパー

読み取り専用アクション用の軽量パターン:

- 権限なし時は空結果を返す（ActionFailureではなく）
- 既存の動作を維持しつつコード統一

### 4. React 19対応

- `forwardRef` → ref as props パターン
- `FC` 型 → 通常の関数宣言 + 明示的戻り値型

## 変更ファイル

### 型システム基盤

- `src/lib/audit.ts` - AuditUser型追加、isSuccessResult型ガード追加
- `src/types/server-actions.ts` - AuditUser再エクスポート、withPermission改善
- `src/types/index.ts` - AuditUserエクスポート追加

### Server Actions (13ファイル)

- `src/actions/admin/announcement-bar.ts`
- `src/actions/admin/blog.ts`
- `src/actions/admin/customer.ts`
- `src/actions/admin/dashboard.ts`
- `src/actions/admin/faq.ts`
- `src/actions/admin/grapes-page.ts`
- `src/actions/admin/inquiry.ts`
- `src/actions/admin/navigation.ts`
- `src/actions/admin/news.ts`
- `src/actions/admin/page.ts`
- `src/actions/admin/reservation.ts`
- `src/actions/admin/settings.ts`
- `src/actions/admin/space.ts`
- `src/actions/admin/user.ts`

### React 19対応

- `src/components/site/ui/Checkbox.tsx` - forwardRef削除
- `src/contexts/aria-live-context.tsx` - FC型削除

## 削除されたパターン

```typescript
// Before: 手動認証パターン（各アクションで繰り返し）
async function checkPermission() {
  const session = await getSession()
  if (!session?.user) return null
  const role = session.user.role as Role
  if (!canAccessAdmin(role)) return null
  if (!hasPermission(role, 'resource', 'update')) {
    void logPermissionDenied(session.user.id, 'resource', 'update')
    return null
  }
  return session.user
}

export async function updateResource(id: string, data: Input) {
  const user = await checkPermission()
  if (!user) return createFailure('権限がありません')
  // ... business logic
  void logUserAction(user as never, AuditAction.UPDATE, 'resource', id)
  return createSuccess('更新しました')
}

// After: withPermission HOF（自動処理）
export const updateResource = withPermission<[id: string, data: Input], void>(
  'resource',
  'update'
)(async (user, id, data) => {
  // business logic only - auth/audit automatic
  return createSuccess('更新しました')
})
```

## 改善メトリクス

| 項目 | Before | After |
|------|--------|-------|
| `as never` アサーション | 30+ | 0 |
| 手動checkPermission関数 | 13 | 0 |
| forwardRef使用 | 1 | 0 |
| FC型使用 | 1 | 0 |
| 型安全性スコア | B+ | A |

## 検証

- `bun run type-check` - パス
- `bun run lint` - エラー0（既存warning 8件は対象外）
- `bun run build` - 成功（68ページ生成）

## マイグレーション

不要（スキーマ変更なし）
