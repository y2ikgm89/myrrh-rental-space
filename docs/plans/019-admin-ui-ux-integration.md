# 019: Admin UI/UX統合

## 概要

管理画面のレスポンシブ対応、SidePanel汎用化、ダッシュボードグラフ追加を実装。モバイル/タブレット対応、統計可視化を強化。

## 実装内容

### Phase 1: レスポンシブ対応

- 管理画面サイドバーの折りたたみ機能（モバイル: hidden、タブレット: collapsed、デスクトップ: expanded）
- モバイル時オーバーレイ表示（ESCキー・外側クリックで閉じる）
- TopBar追加（モバイルでハンバーガーメニュー表示）
- AdminLayoutContext（サイドバー状態管理）

### Phase 2: GenericSidePanel

- BlogSidePanel/NewsSidePanel統合の汎用コンポーネント設計
- タブ切り替え対応
- 型安全なジェネリクス設計

### Phase 3: ダッシュボード改善

- Recharts導入（予約数・売上推移グラフ）
- 直近30日の日別集計
- 双軸グラフ（左: 予約数、右: 売上）
- Suspense境界でプログレッシブレンダリング

## 新規ファイル

- `src/types/admin-layout.ts` - レスポンシブレイアウト型定義
- `src/contexts/admin-layout-context.tsx` - サイドバー状態管理Context
- `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx` - ナビゲーション項目定義
- `src/app/(admin)/admin/(dashboard)/_components/ResponsiveSidebar.tsx` - レスポンシブサイドバー
- `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx` - モバイルヘッダー
- `src/app/(admin)/admin/(dashboard)/_components/UserInfo.tsx` - ユーザー情報コンポーネント
- `src/types/editor-panel.ts` - 汎用パネル型定義
- `src/components/admin/editor/shared/GenericSidePanel.tsx` - 統合サイドパネル
- `src/components/admin/editor/shared/fields/PublishFieldsGeneric.tsx` - 汎用公開設定フィールド
- `src/app/(admin)/admin/(dashboard)/_components/charts/ReservationChart.tsx` - 予約・売上グラフ
- `src/app/(admin)/admin/(dashboard)/_components/charts/index.ts` - エクスポート
- `src/app/(admin)/admin/(dashboard)/_components/DashboardChartSection.tsx` - グラフセクション

## 変更ファイル

- `src/app/(admin)/admin/(dashboard)/layout.tsx` - レスポンシブレイアウト実装
- `src/actions/admin/dashboard.ts` - `getReservationChartData()` 追加、`ChartDataPoint` 型追加
- `src/app/(admin)/admin/(dashboard)/page.tsx` - DashboardChartSection追加

## 削除ファイル

なし

## 検証

- [x] type-check通過
- [x] lint通過
- [x] build成功

## マイグレーション

不要

## 環境変数

なし

## 今後の予定

- Blog/News GrapesJS移行（別計画として実施）
