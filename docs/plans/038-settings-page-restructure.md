# 038-settings-page-restructure.md

設定ページのカテゴリカード方式へのリストラクチャ

## 概要

現在のタブベース設定ページ（10タブ + 3ボタン）を、カテゴリカード方式（iOS設定/WordPress風）に再構築する。

**背景**:
- タブが10個で多すぎる（7項目超えるとスケールしない）
- 右上ボタン（権限マトリクス、監査ログ、お知らせバー）が独立している
- Master-Detail調査の結果、カテゴリカード→詳細ページ方式を採用

**参考**: [SaaSFrame Settings Examples](https://www.saasframe.io/categories/settings)

## カテゴリ構成

| カテゴリ | パス | 含む設定 |
|----------|------|----------|
| **サイト設定** | `/settings/site` | 一般、SEO、レイアウト |
| **ビジネス設定** | `/settings/business` | 事業者情報、営業時間、予約 |
| **通知・決済** | `/settings/notify` | メール、決済（Stripe） |
| **外部連携** | `/settings/api` | APIキー（Resend、Turnstile、Google等） |
| **システム管理** | `/settings/system` | システム、ナビゲーション、お知らせバー、権限、監査ログ |

## フェーズ構成

### Phase 1: 新ページ構造作成 `cc:DONE`

- [x] `/settings/page.tsx` - カード一覧トップページ（5カテゴリカード）
- [x] `/settings/site/page.tsx` - サイト設定ページ（GeneralTab + SeoTab + LayoutTab統合）
- [x] `/settings/business/page.tsx` - ビジネス設定ページ（BusinessTab + BookingTab統合）
- [x] `/settings/notify/page.tsx` - 通知・決済ページ（EmailTab + PaymentTab統合）
- [x] `/settings/api/page.tsx` - 外部連携ページ（ApiKeysTab移行）
- [x] `/settings/system/page.tsx` - システム管理ページ（SystemTab + 権限統合、ナビ/お知らせバー/監査ログはリンクカード）

### Phase 2: 共通コンポーネント作成 `cc:DONE`

- [x] `SettingsCard.tsx` - カード一覧用カードコンポーネント（アイコン、タイトル、説明、リンク）
- [x] `SettingsLayout.tsx` - 各設定ページ共通レイアウト（パンくず、戻るボタン）
- [x] `SettingsSection.tsx` - セクション区切りコンポーネント（既存Sectionの統合・調整）

### Phase 3: 既存タブコンポーネント移行 `cc:DONE`

- [x] 各タブコンポーネントを対応するページにインポート
- [x] タブ間でのデータ共有（settings: SettingsData）を維持
- [x] URLパラメータ（?section=xxx）でセクション内スクロールサポート（オプション）→ 不要と判断

### Phase 4: 旧構造削除 `cc:DONE`

- [x] `SettingsPageClient.tsx` 削除（空ファイルに置換、手動削除推奨）
- [x] `SettingsTabs.tsx` 削除（空ファイルに置換、手動削除推奨）
- [x] `_components/tabs/` → `_components/homepage/` にリネーム（HomepageTab/SectionEditorのみ保持）
- [x] 旧 `/settings/permissions` 削除（`/settings/system` に統合）
- [x] `/settings/navigation` と `/settings/announcement-bar` は独立ページとして維持（systemからリンクカード）

### Phase 5: クリーンアップ・検証 `cc:DONE`

- [x] type-check / lint / build 検証
- [x] 孤立ファイル削除（一部手動削除推奨）

## 新ディレクトリ構造

```
src/app/(admin)/admin/(dashboard)/settings/
├── page.tsx                    # カード一覧（トップ）
├── _components/
│   ├── SettingsCard.tsx        # カードコンポーネント
│   ├── SettingsLayout.tsx      # 共通レイアウト
│   ├── homepage/               # ホームページ編集用
│   │   ├── HomepageTab.tsx
│   │   └── SectionEditor.tsx
│   ├── sections/               # 既存セクション（再利用）
│   │   ├── BasicInfoSection.tsx
│   │   ├── ContactInfoSection.tsx
│   │   ├── ...
│   │   └── index.ts
│   └── index.ts
├── site/
│   └── page.tsx                # サイト設定
├── business/
│   └── page.tsx                # ビジネス設定
├── notify/
│   └── page.tsx                # 通知・決済
├── api/
│   └── page.tsx                # 外部連携
├── system/
│   └── page.tsx                # システム管理
├── navigation/
│   └── page.tsx                # ナビゲーション管理（独立）
└── announcement-bar/
    └── page.tsx                # お知らせバー管理（独立）
```

## 手動削除推奨ファイル

以下のファイルは空ファイルに置換されていますが、手動で削除することを推奨します：

- `src/app/(admin)/admin/(dashboard)/settings/_components/SettingsPageClient.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/_components/SettingsTabs.tsx`

## 技術的考慮事項

1. **データフェッチ**: 各ページで必要な設定のみをフェッチ（現在は全設定一括取得）
2. **nuqs削除**: タブ切り替えがなくなるためURL状態管理は不要
3. **ナビゲーション管理**: 独立ページとして維持（systemからリンクカード）
4. **権限マトリクス**: 静的表示なのでセクションとしてsystemに統合
5. **監査ログ**: 一覧+フィルター+ページネーションがあるため、リンクカードとして残す（別ページ維持）

## マイグレーション

不要（スキーマ変更なし）

## 成果物

- 5カテゴリのカード一覧トップページ
- 各カテゴリの独立した設定ページ
- 後方互換性なし（クリーン実装）
