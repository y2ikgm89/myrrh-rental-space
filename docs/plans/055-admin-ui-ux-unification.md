# 055: 管理画面 UI/UX 統一

## 概要

管理画面全体のUI/UXパターンを統一し、一貫性のある操作性を実現。

## 完了内容

### 1. EmptyState 統一

**対象**: 空状態の表示を `EmptyState` コンポーネントに統一

- BlogTable.tsx
- NewsTable.tsx
- CustomerTable.tsx
- InquiryTable.tsx
- CommentTable.tsx
- CategoryTable.tsx
- MediaListWrapper.tsx
- LocationTable.tsx
- SpaceTable.tsx
- ReservationTable.tsx

**変更点**:

- インラインの空状態表示を `<EmptyState />` コンポーネントに置換
- `description` プロパティを追加（追加説明文に対応）
- 相対インポートを `@/admin/components/EmptyState` エイリアスに統一

### 2. LoadingState 統一

**対象**: Suspense fallback を `LoadingState` コンポーネントに統一

- reservations/page.tsx
- customers/page.tsx
- inquiries/page.tsx
- blog/page.tsx
- news/page.tsx
- blog/comments/page.tsx
- faq/page.tsx
- terms/page.tsx
- SpaceTabContent.tsx
- CategoryTabContent.tsx
- LocationTabContent.tsx
- staff/page.tsx
- audit-logs/page.tsx

**パターン**:

- フィルター: `<Suspense fallback={<LoadingState variant="inline" />}>`
- リスト: `<Suspense fallback={<LoadingState />}>`

**型修正**:

- 未使用の `'default'` variant を削除（`'table' | 'inline'` のみに）

### 3. 日付・金額フォーマット統一

**対象**: date-fns 直接使用と toLocaleString() を共有関数に統一

- staff/page.tsx → `formatDateTimeShort`, `formatDateShort`
- audit-logs/page.tsx → `formatDateTimeShort`
- pages/page.tsx → `formatDateTimeShort`
- ReservationForm.tsx → `formatCurrency`
- CustomerDetail.tsx → `formatDateShort`, `formatDateTimeShort`, `formatPrice`

**使用関数** (`@/shared/lib/utils`):

- `formatDateShort`: `2024/01/15` 形式
- `formatDateTimeShort`: `2024/01/15 14:30` 形式
- `formatDate(date, true)`: `2024年1月15日 14:30` 形式（詳細ページ用）
- `formatCurrency`: `¥12,345` 形式
- `formatPrice`: null/undefined 対応の金額フォーマット

**追加対象**（詳細ページ）:

- staff/[id]/page.tsx → `formatDate(date, true)`
- InquiryDetail.tsx → `formatDate(date, true)`

### 4. エラー表示スタイル統一

**対象**: `bg-red-50` を `bg-destructive/10` に統一

- error.tsx
- LoginForm.tsx
- SetupForm.tsx

**変更点**:

- `bg-red-50` → `bg-destructive/10`
- `border-red-200` → `border-destructive/50`
- `text-red-600` → `text-destructive`

### 5. StatusBanner 統一

**対象**: 設定セクションの接続状態バナーを共有コンポーネントに統一

- GoogleCalendarSection.tsx
- StripeSection.tsx
- TwoWaySyncSection.tsx
- GoogleMapsSection.tsx
- ResendSection.tsx
- TurnstileSection.tsx

**変更点**:

- 各セクションの重複定義を削除
- `settings/_components/shared/StatusBanner.tsx` を使用
- エラー状態で `bg-destructive/10` を使用

## 影響範囲

- `src/app/(admin)/admin/` 配下の約30ファイル
- 既存機能への影響なし（表示のみの変更）
- ビルド・型チェック・Lint すべて成功

## 関連ファイル

- `_shared/components/EmptyState.tsx` - 空状態コンポーネント
- `_shared/components/LoadingState.tsx` - ローディングコンポーネント
- `_shared/components/editor/inline/side-panel/BlogPublishFields.tsx` - ブログ記事公開フィールド（新規作成）
- `@/shared/lib/utils.ts` - フォーマット関数群
- `settings/_components/shared/StatusBanner.tsx` - ステータスバナー
