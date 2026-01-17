# 041-admin-cleanup-refactoring.md

管理画面クリーンアップ＆フルリファクタリング

## 概要

プロジェクト全体を分析し、まとまりがない部分・不足している部分を洗い出し、
2025-2026年のベストプラクティスに準拠したクリーンな実装へリファクタリング。

**参照**:
- [Admin Dashboard UI/UX Best Practices 2025](https://medium.com/@CarlosSmith24/admin-dashboard-ui-ux-best-practices-for-2025-8bdc6090c57d)
- [SaaS Dashboard UX Guidelines](https://arounda.agency/blog/saas-dashboard-ux-trends-guidelines-and-fundamentals)
- [Vercel Admin Dashboard Template](https://vercel.com/templates/next.js/admin-dashboard)
- [Next.js Learn Dashboard](https://nextjs.org/learn)

**原則**: 後方互換性なし、クリーン実装優先

---

## フェーズ構成

### Phase 1: Critical修正（サイドバー・廃止コンポーネント削除） `cc:TODO`

#### 1-1. サイドバーに欠落メニュー追加

- [ ] `sidebar-items.tsx` にユーザー管理追加（Users, Shield）
- [ ] `sidebar-items.tsx` に監査ログ追加（FileText, ClipboardList）
- [ ] メニュー順序の見直し（論理的グルーピング）

**変更ファイル**:
- `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx`

#### 1-2. 廃止予定コンポーネント削除

- [ ] `BlogForm.tsx` 削除（@deprecated, BlogInlineEditorに統合済み）
- [ ] `NewsForm.tsx` 削除（@deprecated, NewsInlineEditorに統合済み）
- [ ] `AnnouncementBarCarouselSection.tsx` 削除（@deprecated, 管理画面に統合済み）
- [ ] 関連するimport/exportの整理

**削除ファイル**:
- `src/app/(admin)/admin/(dashboard)/blog/_components/BlogForm.tsx`
- `src/app/(admin)/admin/(dashboard)/news/_components/NewsForm.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/AnnouncementBarCarouselSection.tsx`

#### 1-3. リダイレクトページの整理

- [ ] `/settings/navigation/` のリダイレクト動作確認
- [ ] `/settings/announcement-bar/` のリダイレクト動作確認
- [ ] 不要な_componentsフォルダがあれば削除

**確認ファイル**:
- `src/app/(admin)/admin/(dashboard)/settings/navigation/page.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/announcement-bar/page.tsx`

---

### Phase 2: 未使用ディレクトリ・コード削除 `cc:TODO`

#### 2-1. 未使用ディレクトリ削除

- [ ] `src/components/admin/features/` 削除（.gitkeepのみ）
- [ ] `src/components/admin/forms/` 削除（.gitkeepのみ）
- [ ] `src/components/admin/layouts/` 削除（.gitkeepのみ）

#### 2-2. 旧設定タブコンポーネント整理

- [ ] `settings/_components/tabs/` の使用状況確認
- [ ] 未使用タブファイルがあれば削除

---

### Phase 3: 命名規則統一 `cc:TODO`

#### 3-1. フィルターコンポーネント命名統一

- [ ] `blog-filters.tsx` → `BlogFilters.tsx`（PascalCase統一）
- [ ] `blog-pagination.tsx` → `BlogPagination.tsx`
- [ ] 他のkebab-caseファイルをPascalCaseに統一

**対象ファイル調査**:
- `src/app/(public)/blog/_components/`
- `src/app/(public)/spaces/_components/`
- `src/app/(public)/news/_components/`

#### 3-2. インポートパス更新

- [ ] リネームしたファイルのimportを全て更新
- [ ] index.ts のexportを更新

---

### Phase 4: テーブルコンポーネント統一 `cc:TODO`

#### 4-1. 汎用DataTableコンポーネント作成

現状: SpaceTable, BlogTable, NewsTable, CustomerTable, ReservationTable, InquiryTable等が個別実装

- [ ] `src/components/admin/ui/DataTable.tsx` 作成
  - 共通カラム定義インターフェース
  - 共通操作ボタンスロット
  - 共通フォーマット関数
- [ ] tanstack/react-table パターン検討（既存確認）

**設計**:
```typescript
interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  actions?: (row: T) => ReactNode
  filters?: ReactNode
  pagination?: PaginationProps
}
```

#### 4-2. 既存テーブルのマイグレーション

- [ ] SpaceTable → DataTable使用に移行
- [ ] BlogTable → DataTable使用に移行
- [ ] 他テーブル順次移行

**優先順位**: 複雑度の低いものから

---

### Phase 5: 設定セクション整理 `cc:TODO`

#### 5-1. 設定セクションの重複確認

- [ ] `settings/_components/sections/` の全ファイル一覧
- [ ] 類似機能のセクションを特定
- [ ] 統合可能なものをリストアップ

#### 5-2. 設定セクションの統合

- [ ] 基本情報系セクションの統合検討
- [ ] API設定系セクションの統合検討

---

### Phase 6: 公開ページ統一 `cc:TODO`

#### 6-1. Paginationコンポーネント統一

現状:
- `blog-pagination.tsx`
- `Pagination.tsx` (spaces)
- `NewsPagination.tsx`
- `components/admin/ui/Pagination.tsx`

- [ ] 公開用汎用Paginationコンポーネント作成
- [ ] nuqs統合パターン統一
- [ ] 既存ページをマイグレーション

#### 6-2. Filtersコンポーネント統一

- [ ] フィルター共通パターンの抽出
- [ ] 汎用FilterWrapperの検討

---

### Phase 7: 検証 `cc:TODO`

- [ ] type-check / lint / build 検証
- [ ] 全管理画面ページの動作確認
- [ ] サイドバーナビゲーション確認
- [ ] 設定ページタブ切り替え確認

---

## 技術的考慮事項

### 1. 後方互換性なし

- 不要なコードは完全削除（`// removed` コメント不要）
- 未使用の`_vars`リネームやre-export禁止
- 古いAPIのラッパー/シム作成禁止

### 2. ベストプラクティス準拠

- [Vercel Admin Dashboard](https://vercel.com/templates/next.js/admin-dashboard) パターン
- コロケーション: 各機能がroute folder内に独自コンポーネント
- Server Actions: データ変更はServer Actionsで統一

### 3. 2025-2026トレンド対応（将来検討）

- ダークモード（今回はスコープ外）
- カスタマイズ可能ウィジェット（今回はスコープ外）
- AI駆動インサイト（今回はスコープ外）

---

## 変更ファイル（予定）

### 削除

| ファイル | 理由 |
|---------|------|
| `blog/_components/BlogForm.tsx` | @deprecated |
| `news/_components/NewsForm.tsx` | @deprecated |
| `settings/_components/sections/AnnouncementBarCarouselSection.tsx` | @deprecated |
| `components/admin/features/.gitkeep` | 未使用 |
| `components/admin/forms/.gitkeep` | 未使用 |
| `components/admin/layouts/.gitkeep` | 未使用 |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `_components/sidebar-items.tsx` | ユーザー管理・監査ログ追加 |
| 各フィルター/ページネーションファイル | 命名統一 |

### 新規

| ファイル | 目的 |
|---------|------|
| `components/admin/ui/DataTable.tsx` | 汎用テーブル |
| `components/site/ui/Pagination.tsx` | 公開用汎用ページネーション |

---

## マイグレーション

不要（スキーマ変更なし）

---

## 成果物

- サイドバー完全化（全機能へのアクセス）
- 廃止コンポーネント削除（コードベース軽量化）
- 命名規則統一（保守性向上）
- テーブルコンポーネント統一（DRY原則）
- 設定セクション整理（一貫性向上）
- 公開ページ統一（開発予測可能性向上）
