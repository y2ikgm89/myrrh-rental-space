# 009-delayed-improvements.md

延期されていたコード改善タスクの実装

## 完了日

2026-01-11

## 背景

前回のコードレビューで延期されていた改善タスクを、後方互換性なしでクリーンな実装として完了。

## 実装内容

### 1. StatusBadge共通化（Phase 6）

5つの重複するStatusBadgeコンポーネントを統一コンポーネントに集約。

**新規ファイル**:
- `src/components/admin/status-badges.tsx`
  - `CustomerStatusBadge` - 顧客ステータス用
  - `InquiryStatusBadge` - お問い合わせステータス用
  - `ReservationStatusBadge` - 予約ステータス用
  - `PublishStatusBadge` - 公開/下書きステータス用

**削除ファイル**:
- `src/app/admin/customers/_components/StatusBadge.tsx`
- `src/app/admin/inquiries/_components/StatusBadge.tsx`
- `src/app/admin/reservations/_components/StatusBadge.tsx`
- `src/app/admin/blog/_components/StatusBadge.tsx`
- `src/app/admin/news/_components/StatusBadge.tsx`

**更新ファイル**:
- `src/app/admin/customers/_components/CustomerTable.tsx`
- `src/app/admin/customers/[id]/_components/CustomerDetail.tsx`
- `src/app/admin/inquiries/_components/InquiryTable.tsx`
- `src/app/admin/inquiries/[id]/_components/InquiryDetail.tsx`
- `src/app/admin/reservations/_components/ReservationTable.tsx`
- `src/app/admin/reservations/[id]/_components/ReservationDetail.tsx`
- `src/app/admin/news/_components/NewsTable.tsx`
- `src/app/admin/blog/_components/BlogTable.tsx`
- `src/app/admin/page.tsx`（ローカル定義を削除し共通コンポーネント使用）

### 2. withAuth Higher Order Function（Phase 8）

Server Actions用の認証ラッパー関数を追加。

**変更ファイル**:
- `src/types/server-actions.ts` - `withAuth` HOF追加

**使用例**:
```typescript
// Before: 各アクションで個別に認証
export async function updateUser(id: string, data: UserInput) {
  try {
    await requireAdmin()
    // ... 処理
  } catch (error) {
    // ... エラーハンドリング
  }
}

// After: withAuthで統一
export const updateUser = withAuth(async (user, id: string, data: UserInput) => {
  // user は認証済み管理者
  // ... 処理
  return createSuccess('更新しました')
})
```

**注意**: 既存のServer Actionsは変更なし。新規アクションで使用可能。

### 3. 命名規則統一（Phase 10）

kebab-caseのコンポーネントファイルをPascalCaseにリネーム。

**リネームファイル**:
- `src/app/admin/login/login-form.tsx` → `LoginForm.tsx`
- `src/app/admin/users/_components/user-form.tsx` → `UserForm.tsx`
- `src/app/admin/users/_components/user-actions.tsx` → `UserActions.tsx`
- `src/components/admin/image-upload.tsx` → `ImageUpload.tsx`
- `src/components/turnstile.tsx` → `Turnstile.tsx`

**インポート更新ファイル**:
- `src/app/admin/login/page.tsx`
- `src/app/admin/users/new/page.tsx`
- `src/app/admin/users/[id]/edit/page.tsx`
- `src/app/admin/users/page.tsx`
- `src/app/admin/users/[id]/page.tsx`
- `src/app/(public)/blog/[slug]/_components/CommentForm.tsx`

### 4. 重複コード削除

- `src/components/Turnstile.tsx` から重複する `verifyTurnstileToken` 関数を削除
  - 正規の実装は `src/lib/turnstile.ts` に存在

## 延期継続タスク

### Phase 3: Server Component化

categories/navigationページはD&D機能（@dnd-kit）を使用しており、'use client'が必須のため延期継続。

技術的制約:
- `useSortable`, `useSensor` などのフックはClient Componentでのみ使用可能
- Server Componentへの変換には大幅なアーキテクチャ変更が必要

### Phase 9: エラーハンドリング統一

`withAuth` HOFで認証エラーは統一。業務ロジックのエラーハンドリングは各アクションの責務として維持。

## 今後の改善提案

1. **既存Server ActionsのwithAuth移行**: 新規アクション作成時はwithAuthを使用
2. **Badge variant意味的整合**: 各ステータスの色を意味に合わせて見直し（例: NEW=warning, RESOLVED=success）

## 検証結果

- `bun run type-check` - 成功
- `bun run lint` - 警告のみ（既存の問題）
- `bun run build` - 成功
