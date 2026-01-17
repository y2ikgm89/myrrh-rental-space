# 040-system-features-tab-integration.md

システム管理の関連機能をサイト設定にタブ統合

## 概要

039で追加したシステム管理ページの「関連機能」リンクカードを廃止し、
ナビゲーション・お知らせバーはサイト設定にタブ統合、監査ログはリンクカードとして配置。

**背景**:
- リンクカード形式は一貫性がなく、わかりにくい
- ナビゲーション・お知らせバーはサイト設定に属するのが自然
- 監査ログは独立した機能として別ページへのリンクが適切

## 変更内容

### Before（現状）

**システム管理** (`/settings/system`)
- タブ: メンテナンス / Cookie / 権限
- リンクカード: ナビゲーション / お知らせバー / 監査ログ

**サイト設定** (`/settings/site`)
- タブ: 一般 / SEO / レイアウト

### After（変更後）

**システム管理** (`/settings/system`)
- タブ: メンテナンス / Cookie / 権限
- リンクカードなし（削除）

**サイト設定** (`/settings/site`)
- タブ: 一般 / SEO / レイアウト / ナビゲーション / お知らせバー（5タブ）
- リンクカード: 監査ログ

## フェーズ構成

### Phase 1: サイト設定にタブ追加 `cc:DONE`

- [x] `/settings/site/page.tsx` に2タブ追加
  - ナビゲーション: NavigationManager コンポーネント使用
  - お知らせバー: AnnouncementBarManager コンポーネント使用
- [x] 必要なデータ取得を追加（navigation items, announcement bars）
- [x] 監査ログへのリンクカード追加

### Phase 2: システム管理からリンクカード削除 `cc:DONE`

- [x] `/settings/system/page.tsx` からリンクカードセクション削除
- [x] LinkCardコンポーネント削除（不要になった場合）

### Phase 3: 旧ページのリダイレクト `cc:DONE`

- [x] `/settings/navigation` → `/settings/site?tab=navigation` リダイレクト
- [x] `/settings/announcement-bar` → `/settings/site?tab=announcement-bar` リダイレクト

### Phase 4: 検証 `cc:DONE`

- [x] type-check / lint / build 検証
- [ ] 動作確認（タブ切り替え、URL同期、設定保存）

## 技術的考慮事項

### 1. コンポーネント再利用

既存のコンポーネントをそのまま使用：
- `NavigationManager` - ナビゲーション管理UI
- `AnnouncementBarManager` - お知らせバー管理UI

### 2. データ取得

サイト設定ページで追加データ取得が必要：
```typescript
const [settings, desktopItems, mobileItems, footerItems, socialLinks, announcementBars, carouselSettings] =
  await Promise.all([
    getSettings(),
    getNavigationItems('HEADER_DESKTOP'),
    getNavigationItems('HEADER_MOBILE'),
    getNavigationItems('FOOTER'),
    getSocialLinks(),
    getAnnouncementBars(),
    getAnnouncementBarCarouselSettings(),
  ])
```

### 3. URL状態管理

nuqs でタブ状態をURLに同期（既存のSettingsTabsを使用）：
- `?tab=general` → 一般タブ
- `?tab=seo` → SEOタブ
- `?tab=layout` → レイアウトタブ
- `?tab=navigation` → ナビゲーションタブ（新規）
- `?tab=announcement-bar` → お知らせバータブ（新規）

## 変更ファイル

- `src/app/(admin)/admin/(dashboard)/settings/site/page.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/system/page.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/navigation/page.tsx` → リダイレクト化
- `src/app/(admin)/admin/(dashboard)/settings/announcement-bar/page.tsx` → リダイレクト化

## マイグレーション

不要（スキーマ変更なし）

## 成果物

- サイト設定: 5タブ + 監査ログリンクカード
- システム管理: 3タブのみ（リンクカード削除）
- 旧ページからの自動リダイレクト
