# 043: スペースの場所・用途カテゴリー機能

## 概要

スペース管理に「場所（Location）」と「用途カテゴリー（SpaceCategory）」の2つの分類軸を追加する。

**目的**:

- 複数の建物・店舗を持つ事業者に対応
- 用途（会議室、スタジオ、セミナー室など）での分類
- 公開サイトでの絞り込み・グループ表示

## データ構造

### Location（場所/建物）

物理的な場所を表現。住所・アクセス情報・建物画像を持つ。

```prisma
model Location {
  id            String   @id @default(uuid())
  name          String   // 例: 本館、渋谷店
  description   String?  @db.Text
  address       String   // 住所
  access        String?  @db.Text // アクセス情報
  imageUrl      String   // 建物画像（必須）
  imageUrls     Json     @default("[]") // 追加画像
  businessHours Json?    // 営業時間
  sortOrder     Int      @default(0)
  isPublished   Boolean  @default(false)
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  spaces Space[]

  @@index([isPublished, isActive])
  @@map("locations")
}
```

### SpaceCategory（用途カテゴリー）

スペースの種類を分類するタグ的な役割。

```prisma
model SpaceCategory {
  id          String   @id @default(uuid())
  name        String   // 例: 会議室、スタジオ、セミナー室
  description String?  @db.Text
  icon        String?  // アイコン名（任意）
  color       String?  // テーマカラー（任意）
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  spaces Space[]

  @@map("space_categories")
}
```

### Space（既存モデル拡張）

```prisma
model Space {
  // 既存フィールド...

  // 新規追加
  locationId  String?
  categoryId  String?

  // Relations
  location Location?      @relation(fields: [locationId], references: [id], onDelete: SetNull)
  category SpaceCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  @@index([locationId])
  @@index([categoryId])
}
```

## UI設計

### 管理画面

#### スペース管理

- スペースフォームに「場所」「用途」の選択フィールド追加
- スペース一覧に場所・用途でのフィルター追加
- 場所・用途列を一覧テーブルに追加

#### 場所管理（新規ページ）

- `/admin/locations` - 場所一覧・CRUD
- 場所ごとのスペース数表示
- 並び替え（D&D）
- 公開/非公開切り替え

#### 用途カテゴリー管理（新規ページ）

- `/admin/space-categories` - カテゴリー一覧・CRUD
- アイコン・色選択UI
- 並び替え（D&D）

### 公開サイト

#### スペース一覧ページ

- 場所でグループ表示（オプション）
- 用途でフィルター
- 場所でフィルター

```
▼ 本館（渋谷区〇〇）
  [会議室] 会議室A - 10名収容
  [会議室] 会議室B - 6名収容
  [スタジオ] 撮影スタジオ

▼ 別館（渋谷区△△）
  [セミナー室] セミナーホール - 50名収容
```

#### 場所詳細ページ（オプション）

- `/locations/[id]` - 場所の詳細 + 所属スペース一覧
- 地図表示（Google Maps連携）

---

## 実装フェーズ

### Phase 1: DBスキーマ・Server Actions ✅

- [x] Prismaスキーマ更新（Location, SpaceCategory, Space拡張）
- [x] マイグレーション実行
- [x] Zodバリデーションスキーマ作成
- [x] Location Server Actions（CRUD）
- [x] SpaceCategory Server Actions（CRUD）
- [x] Space Server Actions更新（locationId, categoryId対応）
- [x] 権限設定（permissions.ts）

### Phase 2: 管理画面UI - Location ✅

- [x] `/admin/locations` ページ作成
- [x] LocationForm コンポーネント
- [x] LocationTable コンポーネント
- [x] 並び替え（D&D）対応
- [x] 公開/非公開スイッチ
- [x] サイドバーにメニュー追加

### Phase 3: 管理画面UI - SpaceCategory ✅

- [x] `/admin/space-categories` ページ作成
- [x] SpaceCategoryForm コンポーネント
- [x] SpaceCategoryTable コンポーネント
- [x] アイコン・色選択UI
- [x] 並び替え（D&D）対応
- [x] サイドバーにメニュー追加

### Phase 4: Space管理への統合 ✅

- [x] SpaceForm に場所・用途選択追加
- [ ] SpaceTable に場所・用途列追加（Phase 5で公開サイト優先）
- [ ] SpaceFilters に場所・用途フィルター追加（将来対応）
- [x] スペース詳細ページに場所・用途表示

### Phase 5: 公開サイト対応 ✅

- [ ] スペース一覧ページの場所グループ表示（将来オプション）
- [ ] 用途フィルター追加（将来オプション）
- [ ] 場所フィルター追加（将来オプション）
- [ ] 場所詳細ページ作成（将来オプション）
- [x] スペース詳細ページにカテゴリータグ表示
- [x] スペース詳細ページに施設（場所）情報表示

### Phase 6: 検証・ドキュメント ✅

- [x] type-check / lint / build
- [x] 既存テスト通過確認（406 pass, 0 fail）
- [x] テスト修正（defaultSpaceFormValues に locationId/categoryId 追加）
- [x] ドキュメント更新

---

## 既存データの扱い

- `locationId`, `categoryId` はオプショナル（nullable）
- 既存スペースはそのまま動作（カテゴリーなし）
- 管理者が任意で分類可能

## 影響範囲

### 新規ファイル

- `src/admin/lib/validations/location.ts`
- `src/admin/lib/validations/space-category.ts`
- `src/admin/actions/location.ts`
- `src/admin/actions/space-category.ts`
- `src/app/(admin)/admin/(dashboard)/locations/**`
- `src/app/(admin)/admin/(dashboard)/space-categories/**`
- `src/app/(public)/locations/[id]/page.tsx`（オプション）

### 変更ファイル

- `prisma/schema.prisma`
- `src/admin/lib/permissions.ts`
- `src/admin/lib/validations/space.ts`
- `src/admin/actions/space.ts`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/**`
- `src/app/(public)/spaces/**`
- `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx`

---

## 備考

- 場所の画像は必須（建物の外観など）
- 用途カテゴリーのアイコン・色は任意
- 将来的にホームページセクションで「場所別スペース一覧」を追加可能
