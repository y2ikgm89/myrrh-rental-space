# Plan 051: ヘッダー/フッター ブランディング統合

## 概要

サイト設定のサイト名・ロゴが公開ページと管理画面のヘッダー・フッターに反映されるよう統合。
シンプルな2択トグル（ロゴ使用 ON/OFF）で制御。

## 現状の問題

| コンポーネント   | 状態 | 詳細                                       |
| ---------------- | ---- | ------------------------------------------ |
| Settings モデル  | ✅   | `siteName`, `headerLogoUrl` フィールド存在 |
| 設定 UI          | ⚠️   | 両フィールド設定可能だが切り替え機能なし   |
| 公開ヘッダー     | ❌   | `siteName` のみ表示、ロゴ未使用            |
| 公開フッター     | ⚠️   | `siteName` のみ表示、ロゴなし              |
| 管理画面ヘッダー | ❌   | ハードコード、設定未反映                   |

## UI/UX 設計方針

**根拠**: [Uxcel Header Design Best Practices](https://uxcel.com/blog/header-design-examples)

### シンプルな2択設計

| 設定                             | 動作                                            |
| -------------------------------- | ----------------------------------------------- |
| **ロゴを使用: ON**（デフォルト） | ロゴ URL があればロゴ表示、なければテキスト表示 |
| **ロゴを使用: OFF**              | 常にサイト名テキスト表示                        |

### 表示ロジック

```
useLogo = true (デフォルト)
  ├── headerLogoUrl あり → ロゴ表示（読込失敗時はテキスト）
  └── headerLogoUrl なし → サイト名テキスト表示

useLogo = false
  └── 常にサイト名テキスト表示
```

**シンプルさのメリット**:

- 設定で迷わない（ON/OFF の2択）
- コード分岐が少ない
- フォールバックが自然（ロゴなければテキスト）

---

## フェーズ構成

### Phase 1: DB スキーマ拡張 `cc:DONE`

- [x] `useHeaderLogo` フィールド追加（Boolean, default: true）
- [x] `useFooterLogo` フィールド追加（Boolean, default: true）
- [x] `footerLogoUrl` フィールド追加（String?）
- [x] マイグレーション実行

### Phase 2: 設定 UI 拡張 `cc:DONE`

- [x] BasicInfoSection にトグルスイッチ追加
  - 「ヘッダーでロゴを使用」（デフォルト ON）
  - 「フッターでロゴを使用」（デフォルト ON）
- [x] フッターロゴ URL 入力欄追加
- [x] 設定保存時のバリデーション更新

### Phase 3: 公開ページヘッダー改修 `cc:DONE`

- [x] Header.tsx で `useHeaderLogo` + `headerLogoUrl` 取得
- [x] 表示ロジック実装（HeaderBranding コンポーネント）
- [x] ロゴ読み込みエラー時のフォールバック（`onError` でテキスト表示）
- [x] Next.js Image 最適化（width/height 指定、priority 属性）
- [x] アクセシビリティ対応（alt 属性にサイト名）

### Phase 4: 公開ページフッター改修 `cc:DONE`

- [x] Footer.tsx で `useFooterLogo` + `footerLogoUrl` 取得
- [x] ロゴ/テキストの表示ロジック（FooterBranding コンポーネント）
- [x] レスポンシブ対応（モバイルでのサイズ調整）

### Phase 5: 管理画面ヘッダー改修 `cc:DONE`

- [x] TopBar.tsx にブランディング追加
- [x] ロゴ/テキストの動的取得（公開ページと同じ設定を使用）
- [x] レイアウトから設定を Props で渡す構成

### Phase 6: 検証 `cc:DONE`

- [x] type-check / lint / build
- [x] ロゴ ON/OFF 切り替え動作確認
- [x] ロゴ読み込み失敗時のフォールバック確認

---

## 変更ファイル

| ファイル                                                                 | 変更内容                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------ |
| `prisma/schema.prisma`                                                   | `useHeaderLogo`, `useFooterLogo`, `footerLogoUrl` 追加 |
| `prisma/migrations/20260119005448_add_logo_display_settings/`            | マイグレーション                                       |
| `src/app/(admin)/.../settings/_components/sections/BasicInfoSection.tsx` | トグルスイッチ UI                                      |
| `src/app/(public)/_shared/components/layouts/Header.tsx`                 | ロゴ/テキスト表示ロジック                              |
| `src/app/(public)/_shared/components/layouts/HeaderBranding.tsx`         | 新規（Client Component）                               |
| `src/app/(public)/_shared/components/layouts/Footer.tsx`                 | フッターロゴ対応                                       |
| `src/app/(public)/_shared/components/layouts/FooterBranding.tsx`         | 新規（Client Component）                               |
| `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx`               | ブランディング追加                                     |
| `src/app/(admin)/admin/(dashboard)/layout.tsx`                           | 設定取得・Props渡し                                    |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings.ts`          | 新フィールド対応                                       |

---

## 技術詳細

### Settings モデル拡張

```prisma
model Settings {
  // 既存
  siteName        String?
  headerLogoUrl   String?

  // 新規追加
  useHeaderLogo   Boolean @default(true)
  useFooterLogo   Boolean @default(true)
  footerLogoUrl   String?
}
```

### 表示コンポーネント設計

```tsx
// Header.tsx の表示ロジック
function BrandingDisplay({ settings }: { settings: Settings }) {
  const { useHeaderLogo, headerLogoUrl, siteName } = settings;
  const [logoError, setLogoError] = useState(false);

  const displayName = siteName || "Site Name";

  // テキスト表示の条件: ロゴ無効 or ロゴURL無し or ロゴ読込失敗
  if (!useHeaderLogo || !headerLogoUrl || logoError) {
    return <span className="text-xl font-bold">{displayName}</span>;
  }

  // ロゴ表示
  return (
    <Image
      src={headerLogoUrl}
      alt={displayName}
      width={140}
      height={40}
      onError={() => setLogoError(true)}
      priority
    />
  );
}
```

### 設定 UI コンポーネント

```tsx
// BasicInfoSection.tsx のトグル部分
<div className="flex items-center justify-between">
  <Label htmlFor="useHeaderLogo">ヘッダーでロゴを使用</Label>
  <Switch
    id="useHeaderLogo"
    checked={formData.useHeaderLogo}
    onCheckedChange={(checked) =>
      setFormData((prev) => ({ ...prev, useHeaderLogo: checked }))
    }
  />
</div>
```

---

## マイグレーション

```bash
bunx prisma migrate dev --name add_logo_display_settings
```

---

## 後方互換性

**なし（クリーン実装）**

- 新規フィールドはデフォルト値で初期化
- 既存の `headerLogoUrl` フィールドは変更なし
- 既存設定はそのまま動作（デフォルト `useHeaderLogo: true` でロゴ優先）
