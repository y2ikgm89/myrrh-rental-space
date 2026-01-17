# 039-settings-category-tabs.md

設定カテゴリページへのタブUI追加

## 概要

038で作成したカテゴリカード方式の詳細ページに、タブUIを追加する。
現状のスクロール式（全セクション縦並び）をタブ切り替え式に変更。

**背景**:
- 各カテゴリページに3〜4つのセクションがあり、スクロールが長い
- タブ切り替えのほうが見通しが良く、操作性が向上

**参考**: WordPress設定画面、Notion設定画面

## タブ構成

| カテゴリ | タブ構成 | 備考 |
|----------|----------|------|
| **site** | 一般 / SEO / レイアウト | 3タブ |
| **business** | 事業者情報 / 営業時間 / 予約 | 3タブ |
| **notify** | メール / 通知 / 決済 | 3タブ |
| **api** | Resend / Turnstile / Google Maps / カスタム | 4タブ |
| **system** | メンテナンス / Cookie / 権限 | 3タブ + 下部にリンクカード |

## フェーズ構成

### Phase 1: 共通タブコンポーネント作成 `cc:DONE`

- [x] `_components/SettingsTabs.tsx` - 汎用タブナビゲーションコンポーネント
  - Radix UI Tabs ベース
  - nuqs でURL状態管理（`?tab=xxx`）
  - Server/Client 分離パターン

### Phase 2: 各カテゴリページにタブ適用 `cc:DONE`

- [x] `/settings/site/page.tsx` - 一般 / SEO / レイアウト
- [x] `/settings/business/page.tsx` - 事業者情報 / 営業時間 / 予約
- [x] `/settings/notify/page.tsx` - メール / 通知 / 決済
- [x] `/settings/api/page.tsx` - Resend / Turnstile / Google Maps / カスタム
- [x] `/settings/system/page.tsx` - メンテナンス / Cookie / 権限 + リンクカード

### Phase 3: 検証 `cc:DONE`

- [x] type-check / lint / build 検証
- [x] 動作確認（タブ切り替え、URL同期、設定保存）

## 技術的考慮事項

### 1. Server/Client 分離

```
page.tsx (Server Component)
  └── データ取得（getSettings等）
  └── SettingsLayout
        └── SettingsTabsClient (Client Component)
              └── Tabs + TabsContent
                    └── 各Section（Server Componentとして分離）
```

### 2. URL状態管理

nuqs を使用してタブ状態をURLに同期：
- `?tab=general` → 一般タブ
- `?tab=seo` → SEOタブ
- リロード時も同じタブを維持

### 3. PPR対応

- 各タブのコンテンツはSuspenseでラップ
- タブ切り替え時は即座にUI更新、データは遅延ロード

## 新ファイル

- `src/app/(admin)/admin/(dashboard)/settings/_components/SettingsTabs.tsx`

## 変更ファイル

- `src/app/(admin)/admin/(dashboard)/settings/site/page.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/business/page.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/notify/page.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/api/page.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/system/page.tsx`

## マイグレーション

不要（スキーマ変更なし）

## 成果物

- 全5カテゴリページにタブUI追加
- URL状態同期
- 後方互換性なし（クリーン実装）
