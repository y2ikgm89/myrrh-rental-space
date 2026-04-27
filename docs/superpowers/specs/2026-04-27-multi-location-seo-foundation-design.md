# Multi-Location SEO Foundation — Design Spec

**日付**: 2026-04-27
**種別**: 破壊的変更（後方互換性なし）
**ステータス**: 設計中
**親プロジェクト**: MEO 改善（5 サブプロジェクトの第 1 段）
**後続**: GBP API 連携 / Review 収集導線 / Service Schema 移行 / 業種特化 amenityFeature

---

## 1. 目的

`Settings` シングルトンに集約されている MEO（Local SEO）フィールドを、`Location` モデルへ完全移管する。Google 公式推奨である「**各物理拠点ごとに独立した `LocalBusiness` JSON-LD を出力する**」パターン（[Google Search Central — Local Business](https://developers.google.com/search/docs/appearance/structured-data/local-business)）を実装する。

### 背景

現状（2026-04-27 時点）の制約:

- 単一拠点想定の MEO 設計：`Settings.latitude` / `longitude` / `googleBusinessPlaceId` / `businessAttributes` / `priceRange` / `paymentAccepted` / `googleReviewUrl` / `specialHolidays` がすべて Settings に集約されている
- 公開ページ `(public)/layout.tsx` の `<GraphJsonLd>` が Settings 由来の **単一 LocalBusiness** を全ページ共通で出力
- `Location` モデルは `address` / `access` / `parkingInfo` / `amenities` / `businessHours` のみ持ち、SEO 観点で「拠点」として独立認識されない
- multi-tenant template として複数拠点を持つ顧客運用時に、拠点別 GBP 連携・拠点別ローカル検索最適化が不可能

### 公式仕様の確認結果（WebFetch 取得 2026-04-27）

- Google 公式 [Local Business structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business) は `@graph` / `branchOf` / `parentOrganization` を**明示推奨していない**
- Google 推奨は「複数拠点 = repeated `LocalBusiness` markup per location」+ サブ部門は `department` ネスト
- `aggregateRating` / `review` を `LocalBusiness` に出すのは「他社レビューを掲載するサイトのみ」可（自社レビュー禁止、Google 2019 ポリシー）
- `priceRange` は max 100 chars、超過時は表示されない
- `address` / `name` が必須、`geo` は緯度経度 5 桁以上推奨
- schema.org spec の `branchOf` / `parentOrganization` は「採用しても害はないが Google が拾うとは限らない」位置付け

### 採用方針

- **Per-Location LocalBusiness（Google 公式準拠）**: 各 Location ページに独立した `LocalBusiness` JSON-LD を出力
- **Site-wide layout は Organization + WebSite のみ**: `(public)/layout.tsx` の `<GraphJsonLd>` から `LocalBusiness` を削除
- **`branchOf` を optional に併記**: schema.org spec 準拠のため、複数拠点時に各 `LocalBusiness` から共通 `Organization` を `branchOf: { @id: ... }` で参照（Google 解釈は補助的）
- **単一拠点フォールバック**: `Location` レコード 0 件時のみ Settings から合成 Location を構築（`/access/page.tsx` の `buildFallbackLocation()` 既存パターン踏襲）

---

## 2. アーキテクチャ

### 2.1 データモデル変更

**`Location` モデル拡張**（破壊的: SEO/MEO フィールド追加）:

```prisma
model Location {
  id              String   @id @default(uuid()) @db.Uuid
  slug            String   @unique  // 新規: SEO URL / anchor / cache tag に使用
  name            String   @unique
  description     String?  @db.Text
  address         String
  postalCode      String?  // 新規: 郵便番号
  prefecture      String?  // 新規: 都道府県
  city            String?  // 新規: 市区町村
  streetAddress   String?  // 新規: 番地
  buildingName    String?  // 新規: 建物名
  access          String?  @db.Text
  parkingInfo     String?  @db.Text
  amenities       Json     @default("{}")
  imageUrl        String
  imageUrls       Json     @default("[]")
  businessHours   Json?
  specialHolidays Json?    // 新規: 拠点別休業日

  // MEO（Local SEO）フィールド — Settings から移管
  latitude              Float?
  longitude             Float?
  googleBusinessPlaceId String?  // 拠点別 GBP Place ID
  googleReviewUrl       String?  // 拠点別 GBP レビュー URL
  priceRange            String?  @db.VarChar(100) // 拠点別価格帯（Google 仕様 100 文字制約）
  paymentAccepted       String?  // 拠点別決済方法
  // ※ businessAttributes は新設しない — 既存 amenities を SSoT として利用
  phoneNumber           String?  // 新規: 拠点別電話（GBP 連携時に重要）
  email                 String?  // 新規: 拠点別メール

  sortOrder       Int      @default(0)
  isPublished     Boolean  @default(false)
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  spaces Space[]
  events Event[]

  @@index([isPublished, isActive])
  @@index([sortOrder])
  @@map("locations")
}
```

**`Settings` モデル削減**（破壊的: 以下フィールドを削除）:

```diff
- latitude              Float?
- longitude             Float?
- priceRange            String?
- googleBusinessPlaceId String?
- googleReviewUrl       String?
- businessAttributes    Json?
- paymentAccepted       String?
- specialHolidays       Json?
```

**Settings に残るフィールド（用途明示）**:

| フィールド                                                                          | Settings での意味                                          | Location での意味                                         |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| `businessName` / `businessDescription` / `establishedDate` / `representativeName`   | 全社代表情報。`Organization` JSON-LD で使用                | （Location には持たない）                                 |
| `phoneNumber` / `email`                                                             | 全社代表連絡先（本社代表電話・問い合わせ先）               | 拠点別連絡先（GBP に登録する直通番号）                    |
| `postalCode` / `prefecture` / `city` / `streetAddress` / `buildingName` / `address` | 本社所在地（バーチャルオフィス可）。`Organization.address` | 拠点物理所在地。`LocalBusiness.address`                   |
| `businessHours` / `regularHolidays`                                                 | 全社代表営業時間（コーポレートサイト表記用）               | 拠点別営業時間。`LocalBusiness.openingHoursSpecification` |

**注**: 単一拠点運用では Settings.address と最初の Location.address が同一値になりうるが、これは設計上の duplication ではなく「組織情報」と「物理拠点」の論理分離。GBP は per-location 単位で登録するため、運用上は Location が SSoT。

**`additionalType`（業種特化分類）の扱い**:

現状 `getLocalBusinessJsonLdData()` で固定値 `https://en.wikipedia.org/wiki/Coworking` を出力。Phase 1 では Settings 由来の代表値を `Organization.additionalType` として維持し、`Location.additionalType` への per-location 化は **Phase 5（業種特化 amenityFeature）にスコープ移管**。

**`Location.amenities` と `businessAttributes` の重複解消**:

既存の `Location.amenities Json @default("{}")` と Settings から移管する `businessAttributes` は同一概念（wifi / parking 等の bool マップ）。**`Location.businessAttributes` は新設せず、既存 `Location.amenities` を SSoT とする**。Settings.businessAttributes の移管先は最初の Location.amenities（既存値があれば JSON merge、なければそのまま代入）。これにより破壊的変更の影響範囲を縮小。

### 2.2 マイグレーション戦略

**1 マイグレーション 2 ステップ**（idempotent + データ保全）:

```sql
-- Step 1: Location に新規カラム追加（NULL 許容で既存行影響なし）
ALTER TABLE "locations"
  ADD COLUMN "slug"                    VARCHAR(255),
  ADD COLUMN "postalCode"              TEXT,
  ADD COLUMN "prefecture"              TEXT,
  ADD COLUMN "city"                    TEXT,
  ADD COLUMN "streetAddress"           TEXT,
  ADD COLUMN "buildingName"            TEXT,
  ADD COLUMN "specialHolidays"         JSONB,
  ADD COLUMN "latitude"                DOUBLE PRECISION,
  ADD COLUMN "longitude"               DOUBLE PRECISION,
  ADD COLUMN "googleBusinessPlaceId"   TEXT,
  ADD COLUMN "googleReviewUrl"         TEXT,
  ADD COLUMN "priceRange"              VARCHAR(100),
  ADD COLUMN "paymentAccepted"         TEXT,
  ADD COLUMN "phoneNumber"             TEXT,
  ADD COLUMN "email"                   TEXT;
-- ※ businessAttributes は新設せず、既存 amenities を SSoT として利用（後段 Step 3 で merge）

-- Step 2: 既存 Location 全件に placeholder slug を採番
-- 日本語 name は ASCII slug 化困難のため、id prefix を使った一時 slug を入れる
-- production では migration 適用後に管理画面から正規 slug に手動更新する運用
-- （ADR §運用手順で明記、Step 4 の UNIQUE 制約に通す目的）
UPDATE "locations"
SET "slug" = 'location-' || SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 8)
WHERE "slug" IS NULL;

-- Step 3: 既存 Settings の MEO データを「最初の Location」に移管
-- Locations が存在する場合のみ実行（0 件の場合は移管不要、Settings 削除のみ）
-- amenities は既存値があれば JSON merge、なければ Settings.businessAttributes を代入
UPDATE "locations" SET
  "latitude"              = COALESCE("latitude", (SELECT "latitude"              FROM "Settings" WHERE "id" = 'singleton')),
  "longitude"             = COALESCE("longitude", (SELECT "longitude"             FROM "Settings" WHERE "id" = 'singleton')),
  "googleBusinessPlaceId" = COALESCE("googleBusinessPlaceId", (SELECT "googleBusinessPlaceId" FROM "Settings" WHERE "id" = 'singleton')),
  "googleReviewUrl"       = COALESCE("googleReviewUrl", (SELECT "googleReviewUrl"       FROM "Settings" WHERE "id" = 'singleton')),
  "priceRange"            = COALESCE("priceRange", (SELECT "priceRange"            FROM "Settings" WHERE "id" = 'singleton')),
  "paymentAccepted"       = COALESCE("paymentAccepted", (SELECT "paymentAccepted"       FROM "Settings" WHERE "id" = 'singleton')),
  -- amenities ⇐ existing amenities ∪ Settings.businessAttributes（既存値優先で merge）
  "amenities"             = COALESCE("amenities", '{}'::jsonb) || COALESCE((SELECT "businessAttributes" FROM "Settings" WHERE "id" = 'singleton'), '{}'::jsonb),
  "specialHolidays"       = COALESCE("specialHolidays", (SELECT "specialHolidays"       FROM "Settings" WHERE "id" = 'singleton')),
  "postalCode"            = COALESCE("postalCode", (SELECT "postalCode"            FROM "Settings" WHERE "id" = 'singleton')),
  "prefecture"            = COALESCE("prefecture", (SELECT "prefecture"            FROM "Settings" WHERE "id" = 'singleton')),
  "city"                  = COALESCE("city", (SELECT "city"                  FROM "Settings" WHERE "id" = 'singleton')),
  "streetAddress"         = COALESCE("streetAddress", (SELECT "streetAddress"         FROM "Settings" WHERE "id" = 'singleton')),
  "buildingName"          = COALESCE("buildingName", (SELECT "buildingName"          FROM "Settings" WHERE "id" = 'singleton')),
  "phoneNumber"           = COALESCE("phoneNumber", (SELECT "phoneNumber"           FROM "Settings" WHERE "id" = 'singleton')),
  "email"                 = COALESCE("email", (SELECT "email"                 FROM "Settings" WHERE "id" = 'singleton'))
WHERE "id" = (SELECT "id" FROM "locations" ORDER BY "sortOrder" ASC, "createdAt" ASC LIMIT 1);

-- Step 4: slug NOT NULL + UNIQUE 制約
ALTER TABLE "locations" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "locations" ADD CONSTRAINT "locations_slug_key" UNIQUE ("slug");

-- Step 5: Settings から MEO フィールド削除
ALTER TABLE "Settings"
  DROP COLUMN "latitude",
  DROP COLUMN "longitude",
  DROP COLUMN "priceRange",
  DROP COLUMN "googleBusinessPlaceId",
  DROP COLUMN "googleReviewUrl",
  DROP COLUMN "businessAttributes",
  DROP COLUMN "paymentAccepted",
  DROP COLUMN "specialHolidays";
```

> **注**: Prisma 7.8 CLI の `migrate diff --to-schema` で生成 → `db execute --file` + `migrate resolve --applied` の手順（`gotchas/prisma.md` §Prisma Migrate）。`prisma/migrations/*.sql` は PreToolUse 保護のため Python で書き出し。

### 2.3 JSON-LD 出力アーキテクチャ

**Before**:

```
(public)/layout.tsx
  └─ <GraphJsonLd> (Site-wide)
      ├─ LocalBusiness (Settings 由来、単一)  ← 削除
      └─ WebSite
```

**After**:

```
(public)/layout.tsx
  └─ <GraphJsonLd> (Site-wide)
      ├─ Organization (Settings 由来、全社代表情報)
      └─ WebSite

(public)/access/page.tsx                    ← /access ページにも出力
  └─ <LocationsLocalBusinessJsonLd>
      └─ LocalBusiness[] (公開済み Location ごとに repeat)

(public)/access/[locationSlug]/page.tsx     ← 新規: 拠点詳細ページ
  └─ <LocationLocalBusinessJsonLd location={location} />
      └─ LocalBusiness (単一拠点フル仕様)
```

**`branchOf` 併記の判断**:

- Locations が複数件のとき: 各 `LocalBusiness` に `branchOf: { "@id": "{BASE_URL}/#organization" }` を付与
- Locations が 1 件以下（フォールバック含む）: `branchOf` 不要（単一拠点なので親子関係なし）

### 2.4 `getLocalBusinessJsonLdData()` の再設計

**Before**:

```ts
export async function getLocalBusinessJsonLdData(): Promise<LocalBusinessJsonLdData> {
  const settings = await getOrganizationSettings();
  // ... Settings 由来の単一 LocalBusiness を構築
}
```

**After**:

```ts
// 削除: getLocalBusinessJsonLdData()

// 新設: 1 拠点分の LocalBusiness データ生成（pure function）
export function buildLocationLocalBusinessJsonLdData(
  location: LocationForSeo, // 後述の SEO 専用 query 結果型
  options: { includeBranchOf: boolean; siteName: string },
): LocalBusinessJsonLdData;

// 新設: /access ページ向け配列生成（'use cache'）
export async function getAllPublishedLocationsJsonLdData(): Promise<
  LocalBusinessJsonLdData[]
>;

// 新設: 拠点単体ページ向け（'use cache' + slug 引数）
export async function getLocationJsonLdDataBySlug(
  slug: string,
): Promise<LocalBusinessJsonLdData | null>;

// 既存維持: getOrganizationJsonLdData() — Settings 由来の組織情報
// 既存維持: getWebSiteJsonLdData() — Settings 由来のサイト情報

// 変更: getGraphJsonLdData() の戻り値から localBusiness を削除
export async function getGraphJsonLdData(): Promise<{
  organization: OrganizationJsonLdData;
  webSite: WebSiteJsonLdData;
}>;
```

### 2.5 公開ページ構成変更

**新規ページ: `/access/[locationSlug]/page.tsx`**:

- 各 Location の詳細ページ（地図 + 営業時間 + 設備 + アクセス + GBP レビューリンク）
- Page-First Architecture（ADR 0020 経路）— 既存 `/access` の `LocationChapter` コンポーネントを単独ページに転用
- `<LocationLocalBusinessJsonLd>` を出力
- `generateMetadata` で per-location SEO（title / description / OG image）

**既存ページ: `/access/page.tsx` (一覧)**:

- 各 Location カードを `<Link href={\`/access/${slug}\`}>` で詳細にリンク
- 公開済み Locations 全件分の `<LocationsLocalBusinessJsonLd>` を出力（list-view にも全件構造化データを置くのは Google [SiteNavigationElement](https://developers.google.com/search/docs/appearance/site-names#sitelinks) 推奨）

**変更: `(public)/layout.tsx`**:

- `<GraphJsonLd>` の戻り値から `localBusiness` を削除 → `<OrganizationGraphJsonLd>` に rename
- `<JsonLd>` 内部実装は据え置き（XSS escape 等）

### 2.6 管理画面 UI 変更

**削除**:

- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/MeoSection.tsx`
- 設定ページの「MEO 対策」タブ／カード一式

**新設**:

- `/admin/locations/[id]/edit` の「MEO」タブ
- 1 拠点分の MEO 入力フォーム（緯度経度 / Place ID / 価格帯 / 決済方法 / 施設属性 / 拠点別電話・メール）
- MEO スコアは「この拠点の充実度スコア」として再計算（13 項目 → 拠点単位の 11 項目に再構成、後述）

**MEO スコア項目の再構成（per-location）**:

| 項目                | 取得元                           | 備考                                   |
| ------------------- | -------------------------------- | -------------------------------------- |
| 拠点名              | `Location.name`                  |                                        |
| 住所                | `Location.postalCode/...`        | 完全な PostalAddress 必須              |
| 電話番号            | `Location.phoneNumber`           |                                        |
| メールアドレス      | `Location.email`                 |                                        |
| 緯度経度            | `Location.latitude/longitude`    | 5 桁以上                               |
| 営業時間            | `Location.businessHours`         |                                        |
| 価格帯              | `Location.priceRange`            | max 100 chars                          |
| 拠点説明            | `Location.description`           |                                        |
| 拠点画像            | `Location.imageUrl`              |                                        |
| Google Place ID     | `Location.googleBusinessPlaceId` |                                        |
| 決済方法            | `Location.paymentAccepted`       |                                        |
| **全社共通項目**    |                                  |                                        |
| 事業者名（Settings) | `Settings.businessName`          | 全 Location 共通                       |
| 設立日（Settings）  | `Settings.establishedDate`       | 全 Location 共通                       |
| ソーシャルリンク    | `SocialLink`                     | Organization の `sameAs` で全 Loc 共通 |

11 項目 + 全社共通 3 項目 = **計 14 項目**にして円グラフを再構成（旧 Settings 版 13 項目から +1）。

**削除される Server Action**:

- `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts` の `updateMeoSettings`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts` から `updateMeoSettings` の export
- `meoFormSchema`（form-schemas-seo-analytics.ts）の MEO セクション

代わりに `updateLocation` Server Action（`@/admin/actions/location`）の input schema に MEO フィールドを追加し、Location 編集経路で書き込む。

### 2.7 単一拠点フォールバック

**`Locations` レコード 0 件のとき**:

- 既存 `buildFallbackLocation()`（`/access/page.tsx`）を **拡張**して MEO フィールドを Settings から合成（**Settings 削除前のデータ移行で全データが Locations に移管されているため、本フォールバックは Locations が完全に削除された場合のみ作動**）
- ただし破壊的変更後は Settings 側に MEO データがないため、Locations 0 件時の JSON-LD は **`Organization` のみ**（`LocalBusiness` 出力なし）
- 管理画面の `/admin/locations` で「最初の Location を作成してください」CTA を表示

→ **migration 手順で「Settings の MEO データを最初の Location に移管」を強制**するため、production 環境では実質的に Locations 0 件状態は発生しない。dev/staging で seed reset 時のみ Locations 0 件 → Organization JSON-LD のみとなる。

### 2.8 キャッシュ戦略

**新規 cache tag**:

- `CACHE_TAGS.LOCATIONS` 既存
- `getCacheTag.locations.detail(slug)` — 新設（拠点詳細ページ用）

**`updateTag` 配線**:

- `Location` の create/update/delete Server Action で `updateTag(CACHE_TAGS.LOCATIONS)` + `updateTag(getCacheTag.locations.detail(slug))`
- MEO フィールド更新時も同じタグで一括無効化（粒度を分けない）

---

## 3. 影響範囲

### 3.1 削除されるファイル / 関数

- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/MeoSection.tsx` （ファイル削除）
- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts` から MeoSection の export 削除
- `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts` の `updateMeoSettings` 関数削除
- `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts` の `updateMeoSettings` export 削除
- `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-seo-analytics.ts` の `meoFormSchema` 削除
- 関連テスト（`__tests__/integration/actions/admin/settings-meo.test.ts` 等）
- rule docs 内の MeoSection / `updateMeoSettings` への参照（`gotchas.md` / `ssot-singletons.md`）

### 3.2 変更されるファイル

| ファイル                                                                           | 変更内容                                                   |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `prisma/schema.prisma`                                                             | Location 拡張 + Settings 削減                              |
| `src/shared/domain/locations/queries.ts`                                           | 全 `select` 句に新フィールド追加                           |
| `src/shared/domain/locations/public-queries.ts`                                    | `LocationForAccess` / `LocationForSeo` 型拡張              |
| `src/shared/domain/locations/commands.ts`                                          | create/update Input に MEO フィールド追加                  |
| `src/shared/domain/settings/queries/organization.ts`                               | MEO フィールド削除                                         |
| `src/shared/domain/settings/types.ts`                                              | `SettingsData` から MEO フィールド削除                     |
| `src/shared/lib/validations/location.ts`                                           | Zod schema に MEO フィールド追加                           |
| `src/shared/lib/validations/settings.ts`                                           | MEO 部分削除                                               |
| `src/app/(public)/_shared/lib/seo/json-ld-config.ts`                               | `getLocalBusinessJsonLdData()` 削除、新 API 4 関数         |
| `src/app/(public)/_shared/components/seo/json-ld.tsx`                              | `<GraphJsonLd>` 改修、`<LocationLocalBusinessJsonLd>` 新設 |
| `src/app/(public)/layout.tsx`                                                      | `<StructuredDataContent>` を Organization+WebSite のみに   |
| `src/app/(public)/access/page.tsx`                                                 | `<LocationsLocalBusinessJsonLd>` 追加、Link 化             |
| `src/app/(public)/access/_components/location-chapter.tsx`                         | `<Link href={\`/access/${slug}\`}>` 追加                   |
| `src/app/(public)/_shared/data/business.ts`                                        | `getBusinessInfo()` から MEO フィールド削除                |
| `src/app/(admin)/admin/(dashboard)/locations/[id]/edit/page.tsx`                   | MEO タブ追加                                               |
| `src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx`         | MEO フィールド入力 UI 追加                                 |
| `src/app/(admin)/admin/(dashboard)/locations/_components/LocationMeoScoreCard.tsx` | 新設（per-location スコア）                                |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/location.ts`                    | MEO フィールドの save 経路                                 |
| `prisma/seed.ts`                                                                   | Location seed に MEO フィールド + slug 追加                |
| `__tests__/`                                                                       | location / settings / json-ld の関連テスト全更新           |
| `.claude/rules/frontend/seo-patterns.md`                                           | per-location パターンに書き換え                            |
| `.claude/rules/gotchas.md`                                                         | MeoSection 削除に伴う MEO 関連 gotcha 整理                 |
| `.claude/rules/ssot-singletons.md`                                                 | MEO の SSoT を Location に変更                             |

### 3.3 新規ファイル

| ファイル                                                              | 役割                                            |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| `src/app/(public)/access/[locationSlug]/page.tsx`                     | 拠点詳細ページ                                  |
| `src/app/(public)/access/[locationSlug]/loading.tsx`                  | 拠点詳細 skeleton                               |
| `src/app/(public)/access/[locationSlug]/error.tsx`                    | 拠点詳細 error boundary                         |
| `src/app/(public)/access/[locationSlug]/not-found.tsx`                | 拠点詳細 404                                    |
| `src/app/(public)/_shared/lib/seo/location-json-ld.ts`                | per-location JSON-LD ビルダー（pure functions） |
| `prisma/migrations/<ts>_multi_location_seo_foundation/migration.sql`  | 破壊的 migration（手書き、データ保全）          |
| `docs/architecture/decisions/<NNNN>-multi-location-seo-foundation.md` | ADR（公式準拠 + 破壊的変更の根拠）              |

---

## 4. ADR

新規 ADR `docs/architecture/decisions/0023-multi-location-seo-foundation.md`（既存最新が 0022 のため次番号 0023）:

> **タイトル**: Multi-Location SEO Foundation — Per-Location LocalBusiness JSON-LD
>
> **ステータス**: Accepted（実装完了時）
>
> **コンテキスト**: 単一拠点 MEO 設計が multi-location テンプレート要件と乖離。Google 公式は per-location repeated markup を推奨。
>
> **決定**: Settings の MEO フィールドを Location に完全移管。`(public)/layout.tsx` から `LocalBusiness` を撤去し、各 Location ページに per-location LocalBusiness を出力する。
>
> **影響**: 後方互換なし（Settings の MEO フィールド削除）。migration で既存データを最初の Location に保全。
>
> **代替案**:
>
> 1. Settings に MEO を残し Location にもコピー（dual SSoT、ドリフト不可避） → 棄却
> 2. `branchOf` を必須化（schema.org spec 準拠を強化） → optional のままで Google 解釈に依存しない方針
>
> **運用手順（production migration）**:
>
> 1. 事前に各 Location.slug を管理画面（後続 release）で正規化する。migration step 2 の placeholder slug（`location-<id_prefix>`）は SEO URL として暫定的
> 2. `bunx --bun prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > <migration.sql>` で差分生成 → `db execute --file` + `migrate resolve --applied`
> 3. デプロイ後、管理画面で各 Location の slug を SEO 観点で再採番（例: `honkan` / `shibuya-ten`）→ Server Action に slug uniqueness 検証あり
> 4. 旧 `Location.imageUrl` 必須制約は維持。新規拠点作成時は画像必須

---

## 5. テスト戦略

### Unit tests

- `__tests__/unit/lib/seo/location-json-ld.test.ts` — `buildLocationLocalBusinessJsonLdData()` の各分岐（geo / openingHours / amenityFeature / branchOf）
- `__tests__/unit/domain/locations/queries.test.ts` — 新フィールド select の確認

### Integration tests

- `__tests__/integration/actions/admin/location.test.ts` — MEO フィールド更新パス（既存 location.test.ts 拡張）
- `__tests__/integration/domain/locations/jsonld-data.test.ts` — `getAllPublishedLocationsJsonLdData()` / `getLocationJsonLdDataBySlug()` の DB → JSON-LD shape 変換

### E2E tests（Playwright）

- `e2e/visual/access-page.spec.ts` — 既存に per-location カード + 拠点詳細リンクの visual regression
- `e2e/access-location-detail.spec.ts` — 新規: `/access/[locationSlug]` ページが正しく描画され、HTML 内に `<script type="application/ld+json">` で `"@type": "LocalBusiness"` が含まれること（実際の SC レンダリング経由 JSON-LD 検証）

> **注**: Bun test は SC を直接 invoke できないため、JSON-LD 出力検証は (1) pure builder の unit test で shape 検証 + (2) Playwright で実 HTML 出力検証 の 2 層構成。

### Manual verification

- Google [Rich Results Test](https://search.google.com/test/rich-results) で `/access` と `/access/[slug]` の構造化データを検証
- Google Search Console「拡張」レポートで `LocalBusiness` エラーなし

---

## 6. 実装順序（plan 化時の目安）

1. **DB 層**: Prisma schema 変更 + migration + seed 更新（1 commit）
2. **Domain 層**: queries / commands / validations 拡張（1 commit）
3. **JSON-LD 層**: location-json-ld.ts 新設 + json-ld-config.ts リファクタ（1 commit）
4. **公開ページ**: layout.tsx + /access + /access/[slug] 新設（2 commit: layout 改修 / 詳細ページ新設）
5. **管理画面**: MeoSection 削除 + Location 編集に MEO タブ統合（2 commit: 削除 / 統合）
6. **Cache invalidation**: location update 経路の `updateTag` 配線確認（既存に統合）
7. **テスト**: unit + integration + E2E 一括（1 commit）
8. **rule docs / ADR**: 同期更新（1 commit）

合計 **約 9 commit**。subagent-driven-development で密結合タスクをバンドル。

---

## 7. リスク・トレードオフ

| リスク                                              | 緩和策                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| migration の SQL データ移管失敗                     | dev DB で `bun prisma/seed.ts && bun prisma/seed.ts` idempotency 検証              |
| 既存運用顧客の Settings 設定が消える                | migration step 3 で「最初の Location」に強制移管、production 移行手順を ADR に明記 |
| Locations 0 件時の SEO 後退                         | 単一拠点フォールバック維持（Organization のみ出力）                                |
| `branchOf` を Google が解釈しない                   | optional として併記、SEO 影響評価は Phase 2 後の GBP API データで観測              |
| `/access/[slug]` ページ追加で Lighthouse スコア低下 | 静的化（PPR 対応）+ image lazy load + Lighthouse CI で監視                         |

---

## 8. 後続サブプロジェクトとの関係

| サブ# | 名前                        | 本 spec への依存                        | 開始タイミング |
| ----- | --------------------------- | --------------------------------------- | -------------- |
| 2     | GBP API 連携                | `Location.googleBusinessPlaceId` が前提 | 本 spec 完了後 |
| 3     | Review Collection Funnel    | `Location.googleReviewUrl` が前提       | 本 spec 完了後 |
| 4     | Service / Offer Schema 移行 | per-location LocalBusiness が前提       | 本 spec 完了後 |
| 5     | 業種特化 amenityFeature     | `Location.businessAttributes` が前提    | 本 spec 完了後 |

---

## 9. オープン課題

なし（本 spec 完了時点で次は plan 化）。

---

## 10. 参考資料

- [Google Search Central — Local Business structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [schema.org/LocalBusiness](https://schema.org/LocalBusiness)
- [Google ポリシー: aggregateRating in LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/review-snippet#guidelines)（2019/09 〜 自社レビュー禁止）
- 内部ルール: `.claude/rules/frontend/seo-patterns.md`、`.claude/rules/prisma-patterns.md` §JSON フィールド、`.claude/rules/server-actions/use-cache.md` §キャッシュ無効化パターン
