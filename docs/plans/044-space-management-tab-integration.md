# 044: スペース管理タブ統合 - UI/UX改善

## 概要

スペース管理・場所管理・カテゴリー管理の3つの独立ページを、1つのスペース管理ページ内に3タブとして統合する。

**現状の問題点**:

- サイドバーに「スペース管理」「場所管理」「カテゴリー管理」が別々に存在
- 関連機能の関係性が見えにくい
- 初心者が迷いやすい構造
- 操作時に複数ページ間を行き来する必要がある

**改善後**:

```
サイドバー:
  スペース管理 ← これ1つに統合

スペース管理ページ:
  [スペース] [場所] [カテゴリー]  ← 3タブ
    ↓
  選択したタブのコンテンツを表示
```

## 設計方針

### 1. タブ統合パターン（設定ページと同じ方式）

既存の `SettingsTabs` コンポーネントのパターンを踏襲:

- nuqs でURL状態管理（`?tab=spaces|locations|categories`）
- Radix UI Tabs ベース
- Server Component + Client Component の組み合わせ

### 2. ルーティング変更

**変更前**:

```
/admin/spaces           → スペース一覧
/admin/spaces/new       → スペース新規作成
/admin/spaces/[id]      → スペース詳細
/admin/spaces/[id]/edit → スペース編集
/admin/locations        → 場所一覧
/admin/locations/new    → 場所新規作成
/admin/locations/[id]   → 場所詳細
/admin/space-categories → カテゴリー一覧
```

**変更後**:

```
/admin/spaces?tab=spaces     → スペース一覧（デフォルト）
/admin/spaces?tab=locations  → 場所一覧
/admin/spaces?tab=categories → カテゴリー一覧
/admin/spaces/new            → スペース新規作成（変更なし）
/admin/spaces/[id]           → スペース詳細（変更なし）
/admin/locations/new         → 場所新規作成（リダイレクト追加）
/admin/locations/[id]        → 場所詳細（そのまま維持）
/admin/space-categories      → リダイレクト → /admin/spaces?tab=categories
```

### 3. コンポーネント構成

```
spaces/
├── page.tsx                 # タブ統合ページ（Server Component）
├── _components/
│   ├── SpaceManagementTabs.tsx  # 新規: タブコントローラー
│   ├── SpaceTabContent.tsx      # 新規: スペースタブ
│   ├── LocationTabContent.tsx   # 新規: 場所タブ
│   ├── CategoryTabContent.tsx   # 新規: カテゴリータブ
│   ├── SpaceTable.tsx           # 既存
│   ├── SpaceFilters.tsx         # 既存
│   └── ...
```

---

## 実装フェーズ

### Phase 1: タブ統合コンポーネント作成 ✅

- [x] `SpaceManagementTabs.tsx` 作成（nuqs + Tabs）
- [x] `SpaceTabContent.tsx` 作成（既存 SpaceTable/Filters を移動）
- [x] `LocationTabContent.tsx` 作成（既存 LocationTable/Filters を移動）
- [x] `CategoryTabContent.tsx` 作成（既存 CategoryTable/Filters を移動）

### Phase 2: ページ統合 ✅

- [x] `spaces/page.tsx` をタブ統合ページに更新
- [x] 各タブのデータ取得ロジックを統合
- [x] URL パラメータ（`?tab=xxx`）によるタブ切り替え

### Phase 3: サイドバー・リダイレクト ✅

- [x] サイドバーから「場所管理」「カテゴリー管理」を削除
- [x] `/admin/locations` → `/admin/spaces?tab=locations` リダイレクト
- [x] `/admin/space-categories` → `/admin/spaces?tab=categories` リダイレクト
- [x] 詳細ページ（`/locations/[id]`）はそのまま維持

### Phase 4: 検証 ✅

- [x] type-check / lint / build
- [x] 各タブの表示確認
- [x] 新規作成・編集・削除の動作確認
- [x] リダイレクトの動作確認

---

## 影響範囲

### 変更ファイル

- `src/app/(admin)/admin/(dashboard)/spaces/page.tsx` - タブ統合
- `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx` - 項目削除
- `src/app/(admin)/admin/(dashboard)/locations/page.tsx` - リダイレクト化
- `src/app/(admin)/admin/(dashboard)/space-categories/page.tsx` - リダイレクト化

### 新規ファイル

- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceManagementTabs.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceTabContent.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/LocationTabContent.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/CategoryTabContent.tsx`

### 維持するファイル

- `src/app/(admin)/admin/(dashboard)/locations/[id]/` - 詳細・編集ページ
- `src/app/(admin)/admin/(dashboard)/locations/new/page.tsx` - 新規作成
- 各テーブル・フォームコンポーネント

---

## UI/UX改善効果

| 項目             | Before           | After            |
| ---------------- | ---------------- | ---------------- |
| サイドバー項目数 | 16項目           | 14項目（-2）     |
| 関連機能の距離   | 3つの別ページ    | 1ページ3タブ     |
| 操作ステップ     | ページ遷移が必要 | タブ切り替えのみ |
| 視認性           | 関連性が見えない | タブで明確       |

---

## 備考

- 設定ページと同じタブパターンを採用（一貫性）
- 詳細ページ・編集ページは独立ルートを維持（URL共有可能）
- タブ状態はURLに保存（ブラウザバック対応）
