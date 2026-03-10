# 管理画面 UI/UX 改善計画

> 作成日: 2026-01-28
> ステータス: **完了** ✅ (frontend-design再検討済み)

## 概要

管理画面全体のUI/UXを段階的に改善する。
shadcn/uiベースを維持しつつ、Minimalism & Swiss Styleで統一感のあるデザインに刷新。

## 要件

| 項目         | 内容                           |
| ------------ | ------------------------------ |
| スタイル     | Minimalism & Swiss Style       |
| カラー       | Trust Blue パレット            |
| モバイル     | スマホ対応必須（レスポンシブ） |
| ダークモード | ライトモードのみ               |
| 進め方       | 段階的に少しずつ               |

## デザインシステム

### カラーパレット

| 役割       | Hex       | Tailwind      | CSS変数                    |
| ---------- | --------- | ------------- | -------------------------- |
| Primary    | `#2563EB` | `blue-600`    | `--color-primary`          |
| Secondary  | `#3B82F6` | `blue-500`    | `--color-secondary`        |
| CTA/成功   | `#10B981` | `emerald-500` | `--color-success`          |
| 警告       | `#F59E0B` | `amber-500`   | `--color-warning`          |
| 危険       | `#EF4444` | `red-500`     | `--color-destructive`      |
| Background | `#F8FAFC` | `slate-50`    | `--color-background`       |
| Text       | `#1E293B` | `slate-800`   | `--color-foreground`       |
| Muted Text | `#64748B` | `slate-500`   | `--color-muted-foreground` |
| Border     | `#E2E8F0` | `slate-200`   | `--color-border`           |
| Card BG    | `#FFFFFF` | `white`       | `--color-card`             |

### タイポグラフィ

- フォント: Noto Sans JP（既存維持）
- 見出し: font-semibold
- 本文: font-normal

### スペーシング

- カード間: gap-4 (16px)
- セクション間: space-y-6 (24px)
- コンテナpadding: p-4 md:p-6

### トランジション

- デフォルト: transition-colors duration-200
- ホバー: opacity変更 or 背景色変更
- レイアウトシフトなし

## 改善フェーズ

### Phase 1: 共通コンポーネント（基盤） ✅

1. **カラーシステム更新**
   - [x] globals.css のCSS変数をTrust Blueパレットに更新
   - [x] 既存コンポーネントへの影響確認

2. **Buttonコンポーネント**
   - [x] cursor-pointer追加
   - [x] duration-200追加
   - [x] focus-visible:ring-2追加

3. **Cardコンポーネント**
   - [x] シャドウ: shadow-sm
   - [x] ボーダー半径: rounded-lg

4. **Tableコンポーネント**
   - [x] ヘッダー: bg-muted/50
   - [x] ホバー行: duration-200追加

5. **Inputコンポーネント**
   - [x] フォーカス: ring-2
   - [x] duration-200追加
   - [x] bg-white追加

### Phase 2: レイアウト ✅

1. **サイドバー**
   - [x] アクティブ状態: bg-primary text-white
   - [x] ホバー: bg-slate-800
   - [x] ダークテーマ維持（slate-900）

2. **ヘッダー**
   - [x] text-foreground / muted-foreground使用
   - [x] duration-200追加

3. **メインコンテンツ**
   - [x] bg-background追加

### Phase 3: フォーム要素 ✅

1. **Select**
   - [x] cursor-pointer追加
   - [x] duration-200追加
   - [x] bg-white追加

2. **Textarea**
   - [x] ring-2
   - [x] duration-200
   - [x] bg-white

3. **Checkbox**
   - [x] cursor-pointer
   - [x] duration-200

4. **Switch**
   - [x] duration-200

5. **Badge/Dialog/DropdownMenu/Tabs**
   - [x] duration-200統一
   - [x] cursor-pointer適切に追加

### Phase 4: モバイル最適化 ✅

1. **タッチターゲット**
   - [x] ボタン: min-h-10（モバイル）→ min-h-9（デスクトップ）
   - [x] Pagination: 最小幅72px、スタック表示

2. **ページヘッダー**
   - [x] 予約ページ: flex-col gap-4 sm:flex-row
   - [x] ニュースページ: 同上
   - [x] 顧客ページ: 同上
   - [x] 投稿ページ: 同上
   - [x] スタッフページ: 同上

3. **フィルターフォーム**
   - [x] スタッフページ: flex-col→flex-row切り替え
   - [x] 入力幅: w-full sm:max-w-sm

4. **グリッドレイアウト**
   - [x] 統計カード: grid-cols-2 lg:grid-cols-4

## 品質チェックリスト

- [x] cursor-pointer on all clickable
- [x] transition-colors duration-200
- [x] レスポンシブ対応
- [x] type-check通過
- [x] lint通過

## 変更ファイル一覧

### 共通コンポーネント

- `src/app/globals.css` - Trust Blueカラーパレット
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/button.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/card.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/table.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/input.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/select.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/textarea.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/checkbox.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/switch.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/badge.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/dialog.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/dropdown-menu.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/tabs.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/Pagination.tsx`

### レイアウト

- `src/app/(admin)/admin/(dashboard)/_components/ResponsiveSidebar.tsx`
- `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx`
- `src/app/(admin)/admin/(dashboard)/_components/MainContent.tsx`

### ページ

- `src/app/(admin)/admin/(dashboard)/reservations/page.tsx`
- `src/app/(admin)/admin/(dashboard)/news/page.tsx`
- `src/app/(admin)/admin/(dashboard)/customers/page.tsx`
- `src/app/(admin)/admin/(dashboard)/posts/page.tsx`
- `src/app/(admin)/admin/(dashboard)/staff/page.tsx`

## 参考

- `.claude/rules/ui-ux-patterns.md`
- `.claude/skills/ui-ux-pro-max/SKILL.md`
- `.claude/rules/tailwind-patterns.md`
