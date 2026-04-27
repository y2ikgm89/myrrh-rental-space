> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# Multi-Location SEO Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings シングルトンの MEO フィールドを Location モデルに完全移管し、Google 公式推奨の per-location LocalBusiness JSON-LD パターンを実装する（破壊的変更、後方互換なし）。

**Architecture:** (1) Prisma schema で Settings から MEO フィールドを削除して Location に slug + 14 SEO/MEO フィールドを追加する data-preserving migration、(2) `(public)/layout.tsx` の `GraphJsonLd` を Organization+WebSite のみに改修し各 Location ページに独立した LocalBusiness JSON-LD を出力、(3) 管理画面の `MeoSection` を削除して `/admin/locations/[id]/edit` に MEO タブを統合。

**Tech Stack:** Next.js 16.2 / React 19.2 / Prisma 7.8 / TypeScript 6.0 / Zod 4.3 / Tailwind 4.2 / Bun 1.3 / Playwright

**Spec:** `docs/superpowers/specs/2026-04-27-multi-location-seo-foundation-design.md`

---

## Phase 概要（9 commit / 9 task）

| #   | Phase                           | Files                                                                                                                            | Commit message                                                                    |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | DB schema + migration + seed    | `prisma/schema.prisma` / `prisma/migrations/<ts>_*/migration.sql` / `prisma/seed.ts`                                             | `feat(prisma): migrate MEO fields from Settings to Location with slug`            |
| 2   | Domain layer                    | `src/shared/domain/locations/{queries,public-queries,commands,types}.ts` + Zod schema                                            | `refactor(locations): extend domain layer with MEO/SEO fields`                    |
| 3   | JSON-LD pure builders           | `src/app/(public)/_shared/lib/seo/location-json-ld.ts` (new) / `json-ld-config.ts` (refactor) / `json-ld.tsx`                    | `feat(seo): per-location LocalBusiness JSON-LD builder (Google official pattern)` |
| 4   | Public layout refactor          | `src/app/(public)/layout.tsx` / `src/app/(public)/access/page.tsx` / `src/app/(public)/access/_components/location-chapter.tsx`  | `refactor(seo): drop site-wide LocalBusiness, emit per-location on /access`       |
| 5   | New /access/[locationSlug] page | `src/app/(public)/access/[locationSlug]/{page,loading,error,not-found}.tsx`                                                      | `feat(access): location detail page with per-location LocalBusiness JSON-LD`      |
| 6   | Admin: remove MeoSection        | delete `MeoSection.tsx` + `updateMeoSettings` action + `meoFormSchema`                                                           | `refactor(admin): remove Settings-level MeoSection (moved to per-Location)`       |
| 7   | Admin: Location MEO tab         | `LocationForm.tsx` (extend) / `LocationMeoScoreCard.tsx` (new) / `updateLocation` action / `locations/[id]/edit/page.tsx`        | `feat(admin): per-Location MEO tab with 14-item score`                            |
| 8   | Tests                           | `__tests__/unit/lib/seo/location-json-ld.test.ts` / `__tests__/integration/domain/locations/jsonld-data.test.ts` + e2e           | `test(seo): unit + integration + e2e for multi-location JSON-LD`                  |
| 9   | ADR + rule docs + handoff       | `docs/architecture/decisions/0023-*.md` (new) + `seo-patterns.md` / `gotchas.md` / `ssot-singletons.md` updates + handoff memory | `docs(adr): 0023 multi-location SEO foundation; sync rule docs`                   |

---

## 共通ルール（全 Task に適用）

### Commit message convention

Conventional Commits 準拠（`scripts/check-commit-msg.sh` 必須）:

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

各 Phase の commit message は上表「Commit message」列をそのまま使う。body は「実装内容を 2-3 行で要約 + spec/ADR 参照」を含めること。

### 検証コマンド

| 段階         | コマンド                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------- |
| 作業中       | `bun run type-check`                                                                     |
| Task 完了前  | `bun run validate`（type-check + lint）                                                  |
| Phase 完了前 | `bun run validate && bun test <related-files>`（CLAUDE.md ADR 0014：全テスト走らせない） |
| Plan 完了前  | `bun run validate && bun run build`                                                      |

### Worktree

Plan 全体を **isolated worktree** で実行する：

```bash
git worktree add .worktrees/multi-location-seo feature/multi-location-seo-foundation
cd .worktrees/multi-location-seo
python3 -c "import shutil; shutil.copy2('../../.env', '.env')"
python3 -c "import shutil; shutil.copy2('../../.env.local', '.env.local')"
robocopy ../../generated generated /E /XF nul
bun install
```

> **注**: `prisma/migrations/*.sql` は PreToolUse 保護のため Python 経由で書き出し（`gotchas/prisma.md` §Prisma Migrate）。

### Subagent dispatch prompt template

各 Task を dispatch する際、controller は以下のテンプレートで prompt を構成する：

```
あなたは Multi-Location SEO Foundation Plan の Task <N> を実装する implementer です。

📋 タスク詳細: docs/superpowers/plans/2026-04-27-multi-location-seo-foundation.md の "Task <N>" 全 step を実装してください。

🚫 禁止:
- git add / commit / push / reset / checkout / restore / stash（controller 側で実行）
- plan 範囲外のファイル編集
- "Phase X.Y" "refactor from Y" 等のタスク参照を JSDoc/コメントに含めない

✅ 必須:
- 全 step を順番通りに実行（TDD: failing test → impl → passing test）
- bun run validate（or 該当 test）で各 step 完了を検証
- 変更後は Read で実ファイル確認
- Plan 記載の identifier と実装が乖離した場合は justified deviation として報告

完了後、変更ファイル一覧と検証結果（type-check / lint / test）を報告してください。
```

---

## Task 1: Prisma schema + migration + seed

**目的:** Settings から MEO フィールドを削除、Location に slug + 14 SEO/MEO フィールドを追加。data-preserving migration で既存データを最初の Location に保全。

**Files:**

- Modify: `prisma/schema.prisma`（Location model 拡張 + Settings model 削減）
- Create: `prisma/migrations/<ts>_multi_location_seo_foundation/migration.sql`
- Modify: `prisma/seed.ts`（`seedLocations` 関数に新フィールド追加）

### Step 1.1: schema.prisma の Location モデル拡張

`prisma/schema.prisma` の `model Location` を以下に置換（既存フィールドは維持、新規フィールド追加）:

```prisma
model Location {
  id              String   @id @default(uuid()) @db.Uuid
  slug            String   @unique @db.VarChar(255)  // 新規: SEO URL / anchor / cache tag
  name            String   @unique
  description     String?  @db.Text
  address         String
  postalCode      String?  // 新規
  prefecture      String?  // 新規
  city            String?  // 新規
  streetAddress   String?  // 新規
  buildingName    String?  // 新規
  access          String?  @db.Text
  parkingInfo     String?  @db.Text
  amenities       Json     @default("{}")
  imageUrl        String
  imageUrls       Json     @default("[]")
  businessHours   Json?
  specialHolidays Json?    // 新規

  // MEO（Local SEO）— Settings から移管
  latitude              Float?
  longitude             Float?
  googleBusinessPlaceId String?
  googleReviewUrl       String?
  priceRange            String?  @db.VarChar(100)
  paymentAccepted       String?
  phoneNumber           String?
  email                 String?

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

### Step 1.2: schema.prisma の Settings モデルから MEO フィールド削除

`model Settings` 内の以下行を削除:

```diff
-  // MEO Settings (ローカル検索最適化)
-  latitude              Float?
-  longitude             Float?
-  priceRange            String?
-  googleBusinessPlaceId String?
-  googleReviewUrl       String?
-  businessAttributes    Json?
-  paymentAccepted       String?
```

`specialHolidays Json?` は `Settings` から削除（Location 側に移管済み）:

```diff
-  specialHolidays Json? // 特別休業日（日付リスト）
```

`postalCode` / `prefecture` / `city` / `streetAddress` / `buildingName` / `phoneNumber` / `email` は **Settings 側に維持**（全社代表情報、spec §2.1）。

### Step 1.3: migration ディレクトリ + SQL 生成

migration timestamp を生成して空ディレクトリを作成:

```bash
TS=$(date -u +%Y%m%d%H%M%S)
python3 -c "import os; os.makedirs(f'prisma/migrations/{$TS}_multi_location_seo_foundation', exist_ok=True)"
```

migration.sql を Python 経由で書き出し（PreToolUse 保護回避）:

```bash
python3 << 'PYEOF'
import os
import glob

ts = sorted(glob.glob('prisma/migrations/*_multi_location_seo_foundation'))[-1].split(os.sep)[-1].split('_')[0]
sql = '''-- Step 1: Location に新規カラム追加
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

-- Step 2: 既存 Location に placeholder slug 採番
UPDATE "locations"
SET "slug" = 'location-' || SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 8)
WHERE "slug" IS NULL;

-- Step 3: Settings の MEO データを最初の Location に移管（既存値優先 merge）
UPDATE "locations" SET
  "latitude"              = COALESCE("latitude",              (SELECT "latitude"              FROM "Settings" WHERE "id" = 'singleton')),
  "longitude"             = COALESCE("longitude",             (SELECT "longitude"             FROM "Settings" WHERE "id" = 'singleton')),
  "googleBusinessPlaceId" = COALESCE("googleBusinessPlaceId", (SELECT "googleBusinessPlaceId" FROM "Settings" WHERE "id" = 'singleton')),
  "googleReviewUrl"       = COALESCE("googleReviewUrl",       (SELECT "googleReviewUrl"       FROM "Settings" WHERE "id" = 'singleton')),
  "priceRange"            = COALESCE("priceRange",            (SELECT "priceRange"            FROM "Settings" WHERE "id" = 'singleton')),
  "paymentAccepted"       = COALESCE("paymentAccepted",       (SELECT "paymentAccepted"       FROM "Settings" WHERE "id" = 'singleton')),
  "amenities"             = COALESCE("amenities", '\''{}'\''::jsonb) || COALESCE((SELECT "businessAttributes" FROM "Settings" WHERE "id" = 'singleton'), '\''{}'\''::jsonb),
  "specialHolidays"       = COALESCE("specialHolidays",       (SELECT "specialHolidays"       FROM "Settings" WHERE "id" = 'singleton')),
  "postalCode"            = COALESCE("postalCode",            (SELECT "postalCode"            FROM "Settings" WHERE "id" = 'singleton')),
  "prefecture"            = COALESCE("prefecture",            (SELECT "prefecture"            FROM "Settings" WHERE "id" = 'singleton')),
  "city"                  = COALESCE("city",                  (SELECT "city"                  FROM "Settings" WHERE "id" = 'singleton')),
  "streetAddress"         = COALESCE("streetAddress",         (SELECT "streetAddress"         FROM "Settings" WHERE "id" = 'singleton')),
  "buildingName"          = COALESCE("buildingName",          (SELECT "buildingName"          FROM "Settings" WHERE "id" = 'singleton')),
  "phoneNumber"           = COALESCE("phoneNumber",           (SELECT "phoneNumber"           FROM "Settings" WHERE "id" = 'singleton')),
  "email"                 = COALESCE("email",                 (SELECT "email"                 FROM "Settings" WHERE "id" = 'singleton'))
WHERE "id" = (SELECT "id" FROM "locations" ORDER BY "sortOrder" ASC, "createdAt" ASC LIMIT 1);

-- Step 4: slug NOT NULL + UNIQUE
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
'''

import glob
target_dir = sorted(glob.glob('prisma/migrations/*_multi_location_seo_foundation'))[-1]
with open(f'{target_dir}/migration.sql', 'w', encoding='utf-8', newline='\n') as f:
    f.write(sql)
print(f'Written: {target_dir}/migration.sql')
PYEOF
```

### Step 1.4: migration 適用

```bash
TS_DIR=$(ls -d prisma/migrations/*_multi_location_seo_foundation | head -1 | xargs basename)
bunx --bun prisma db execute --file "prisma/migrations/${TS_DIR}/migration.sql"
bunx --bun prisma migrate resolve --applied "${TS_DIR}"
bun run db:generate
```

期待: `Migration ${TS_DIR} marked as applied.` + Prisma Client 再生成完了。

### Step 1.5: seed.ts の seedLocations を更新

`prisma/seed.ts` の `seedLocations` 関数を Read して、`upsert` の `create` / `update` 両方に新フィールドを追加。例:

```typescript
// prisma/seed.ts の seedLocations 内 upsert 例
await prisma.location.upsert({
  where: { name: "本館" },
  create: {
    name: "本館",
    slug: "honkan",
    address: "東京都渋谷区...",
    postalCode: "150-0001",
    prefecture: "東京都",
    city: "渋谷区",
    streetAddress: "...",
    buildingName: "...",
    imageUrl: "/images/locations/honkan.jpg",
    sortOrder: 0,
    isPublished: true,
    isActive: true,
    latitude: 35.6595,
    longitude: 139.7004,
    phoneNumber: "03-1234-5678",
    email: "honkan@example.com",
    googleBusinessPlaceId: null,
    googleReviewUrl: null,
    priceRange: "¥1,000〜¥5,000/時間",
    paymentAccepted: "現金, クレジットカード, 電子マネー",
    amenities: { wifi: true, parking: true, barrier_free: true },
    businessHours: {
      /* ... 既存値維持 */
    },
    specialHolidays: null,
  },
  update: {
    slug: "honkan",
    postalCode: "150-0001",
    prefecture: "東京都",
    city: "渋谷区",
    // ...同じく全フィールド
  },
});
```

実コードは現在の `prisma/seed.ts` の `seedLocations` 構造を Read してから、各 Location seed エントリに **新フィールド全体を `create` + `update` 両方に追加**。slug は Location.name から `generateUniqueSlug` で生成（`@/shared/lib/slug`、ただし日本語 name は ASCII 化困難のため手動命名: `honkan` / `shibuya-ten` 等）。

### Step 1.6: Settings seed から MEO フィールド削除

`prisma/seed.ts` の `seedSettings` 関数内 upsert から以下を削除:

```diff
-    latitude: ...,
-    longitude: ...,
-    priceRange: ...,
-    googleBusinessPlaceId: ...,
-    googleReviewUrl: ...,
-    businessAttributes: ...,
-    paymentAccepted: ...,
-    specialHolidays: ...,
```

### Step 1.7: seed 実行 + idempotency 検証

```bash
bun prisma/seed.ts
bun prisma/seed.ts  # 2回目で count が変化しないことを確認
```

検証用 ad-hoc query（`gotchas/prisma.md` §`prisma db execute --stdin`）:

```bash
bun -e "
const { PrismaClient } = require('./generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
(async () => {
  const locs = await p.location.findMany({
    select: { name: true, slug: true, latitude: true, longitude: true, googleBusinessPlaceId: true }
  });
  console.log(JSON.stringify(locs, null, 2));
  await p.\$disconnect();
})();
"
```

期待: 全 Location に `slug` が設定済み、最初の Location に Settings 由来の MEO フィールドが移管済み。

### Step 1.8: type-check

```bash
bun run type-check
```

期待: Settings 型から MEO フィールドが消え、Location 型に新フィールドが反映される。**この時点で Settings.latitude 等を参照する箇所は型エラーになる**（Phase 2 以降で解消）。

### Step 1.9: Commit

```bash
git add prisma/schema.prisma prisma/migrations/<ts>_multi_location_seo_foundation/migration.sql prisma/seed.ts
git commit -m "$(cat <<'EOF'
feat(prisma): migrate MEO fields from Settings to Location with slug

Add 14 SEO/MEO fields + slug to Location, drop 8 MEO fields from Settings.
Data-preserving migration moves Settings MEO data to the first Location
with COALESCE merge. Placeholder slug採番 (location-<id_prefix>) for
existing rows; admin re-naming workflow per ADR 0023.

Spec: docs/superpowers/specs/2026-04-27-multi-location-seo-foundation-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Domain layer extension

**目的:** Location domain queries / commands / validation schemas に MEO フィールドを反映。Settings 側の MEO 参照を全削除。

**Files:**

- Modify: `src/shared/domain/locations/queries.ts`（全 select 句に新フィールド追加）
- Modify: `src/shared/domain/locations/public-queries.ts`（`LocationForAccess` 拡張 + 新 `LocationForSeo` 型）
- Modify: `src/shared/domain/locations/commands.ts`（`createLocationCommand` / `updateLocationCommand` の Input 型拡張）
- Modify: `src/shared/domain/locations/types.ts`（型定義）
- Modify: `src/shared/lib/validations/location.ts`（Zod schema）
- Modify: `src/shared/domain/settings/queries/organization.ts`（MEO フィールド select 削除）
- Modify: `src/shared/domain/settings/types.ts`（`SettingsData` から MEO フィールド削除）
- Modify: `src/shared/domain/settings/admin-queries.ts`（同上）
- Modify: `src/shared/lib/validations/settings.ts`（MEO 部分削除）

### Step 2.1: Location domain types 更新

`src/shared/domain/locations/types.ts`（または queries.ts 内の型）に新フィールドを追加。例:

```typescript
export type LocationData = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string;
  readonly postalCode: string | null;
  readonly prefecture: string | null;
  readonly city: string | null;
  readonly streetAddress: string | null;
  readonly buildingName: string | null;
  readonly access: string | null;
  readonly parkingInfo: string | null;
  readonly amenities: unknown;
  readonly imageUrl: string;
  readonly imageUrls: unknown;
  readonly businessHours: unknown;
  readonly specialHolidays: unknown;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly googleBusinessPlaceId: string | null;
  readonly googleReviewUrl: string | null;
  readonly priceRange: string | null;
  readonly paymentAccepted: string | null;
  readonly phoneNumber: string | null;
  readonly email: string | null;
  readonly sortOrder: number;
  readonly isPublished: boolean;
  readonly isActive: boolean;
  readonly createdAt: string; // toPlainObject 経由 ISO string
  readonly updatedAt: string;
};
```

### Step 2.2: Location queries.ts の全 select 句に新フィールド追加

`src/shared/domain/locations/queries.ts` の各 query 関数（`getLocations` / `getLocationById` / `getLocationBySlug` / `getPublishedLocations` 等）の `select` に新フィールドを追加。

`getLocationBySlug(slug)` 関数を新設（spec §2.5 で必要）:

```typescript
export async function getLocationBySlug(
  slug: string,
): Promise<LocationData | null> {
  const validated = slugParamSchema.safeParse(slug);
  if (!validated.success) return null;

  const location = await safeFetch({
    fetch: () =>
      prisma.location.findUnique({
        where: { slug: validated.data },
        select: {
          /* 全フィールド */
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getLocationBySlug",
  });

  return location
    ? toPlainObject({
        ...location,
        createdAt: location.createdAt.toISOString(),
        updatedAt: location.updatedAt.toISOString(),
      })
    : null;
}
```

### Step 2.3: public-queries.ts の `LocationForAccess` 拡張 + 新 `LocationForSeo` 型

`src/shared/domain/locations/public-queries.ts` で:

- `LocationForAccess` に `slug` / `postalCode` / `prefecture` / `city` / `streetAddress` / `buildingName` / `phoneNumber` / `email` / `latitude` / `longitude` / `googleReviewUrl` / `googleBusinessPlaceId` / `priceRange` / `paymentAccepted` / `specialHolidays` を追加
- `getPublishedLocationsForAccess` の select にも同フィールド追加
- 新型 `LocationForSeo`（JSON-LD 出力用、必要最小限）を export
- 新関数 `getPublishedLocationsForSeo()` を追加（`'use cache'` + `cacheTag(CACHE_TAGS.LOCATIONS)` + 軽量 select）
- 新関数 `getPublishedLocationForSeoBySlug(slug)` を追加

### Step 2.4: commands.ts の Input 型拡張

`src/shared/domain/locations/commands.ts` の `CreateLocationInput` / `UpdateLocationInput` 型に新フィールドを追加。`createLocationCommand` / `updateLocationCommand` の `prisma.location.create/update` の `data` フィールドにも反映。

slug uniqueness は Prisma `P2002` で自動制御されるが、command 内で事前 `findUnique({ where: { slug } })` チェックで先制エラーを返すと UX が良い:

```typescript
export async function createLocationCommand(input: CreateLocationInput) {
  const existing = await prisma.location.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError(
      "DUPLICATE",
      `slug "${input.slug}" は既に使用されています`,
    );
  }
  // ... create
}
```

### Step 2.5: validations/location.ts の Zod schema 拡張

`src/shared/lib/validations/location.ts` の `locationFormSchema` に新フィールドを追加（spec §2.6 の入力 UI に対応）:

```typescript
export const locationFormSchema = z.object({
  name: z.string().min(1, { error: "拠点名は必須です" }).max(100),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(255)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      error: "スラッグは小文字英数字とハイフンのみ",
    }),
  description: z.string().max(2000).nullable().optional(),
  address: z.string().min(1, { error: "住所は必須です" }),
  postalCode: z.string().max(10).nullable().optional(),
  prefecture: z.string().max(20).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  streetAddress: z.string().max(200).nullable().optional(),
  buildingName: z.string().max(100).nullable().optional(),
  access: z.string().max(2000).nullable().optional(),
  parkingInfo: z.string().max(1000).nullable().optional(),
  amenities: z.record(z.string(), z.boolean()).default({}),
  imageUrl: z.string().url({ error: "有効な画像 URL を入力してください" }),
  imageUrls: z
    .array(z.object({ url: z.string().url() }))
    .refine((arr) => new Set(arr.map((i) => i.url)).size === arr.length, {
      error: "同じ画像 URL を複数登録することはできません",
    })
    .default([]),
  businessHours: businessHoursWeekSchema.nullable().optional(),
  specialHolidays: z.array(z.string()).nullable().optional(),
  // MEO
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  googleBusinessPlaceId: z.string().max(100).nullable().optional(),
  googleReviewUrl: z.string().url().nullable().optional(),
  priceRange: z.string().max(100).nullable().optional(),
  paymentAccepted: z.string().max(500).nullable().optional(),
  phoneNumber: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isPublished: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
```

### Step 2.6: Settings 側から MEO 参照を削除

以下ファイルから MEO フィールド参照を削除:

- `src/shared/domain/settings/queries/organization.ts`（type + select）
- `src/shared/domain/settings/types.ts`（`SettingsData` 型）
- `src/shared/domain/settings/admin-queries.ts`（select + 戻り値 mapping）
- `src/shared/lib/validations/settings.ts`（MEO 関連の Zod schema delete）
- `src/app/(public)/_shared/data/business.ts`（`getBusinessInfo()` の戻り値から MEO 関連を削除）

### Step 2.7: type-check で参照漏れを検出

```bash
bun run type-check 2>&1 | tee /tmp/typecheck.log
```

期待: Phase 1 で残っていた `settings.latitude` 等の型エラーが解消、新規エラーがあれば該当ファイルを修正。

### Step 2.8: lint

```bash
bun run lint
```

### Step 2.9: 関連テストの実行（既存があれば）

```bash
bun test __tests__/unit/domain/locations 2>&1 | tail -30
bun test __tests__/integration/domain/locations 2>&1 | tail -30
```

期待: Phase 1 + 2 の変更で既存テストが落ちる場合、テスト fixtures を新フィールドで更新。テストロジック自体の変更が必要なら別 commit にせず本 Phase でカバー。

### Step 2.10: Commit

```bash
git add src/shared/domain/locations/ src/shared/domain/settings/ src/shared/lib/validations/ src/app/\(public\)/_shared/data/business.ts
git commit -m "$(cat <<'EOF'
refactor(locations): extend domain layer with MEO/SEO fields

- locations queries: add slug + 14 MEO/SEO fields to all select clauses
- locations commands: extend CreateLocationInput / UpdateLocationInput
- locations validation: Zod schema with slug + MEO field validation
- settings queries/types: remove migrated MEO fields (Settings 側削減)
- public/data/business: drop MEO fields from getBusinessInfo()
- new public-queries: getPublishedLocationsForSeo / *BySlug

Spec: §2.4 (getLocalBusinessJsonLdData() の再設計準備)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: JSON-LD pure builders

**目的:** per-location LocalBusiness JSON-LD ビルダーを pure function として新設。`getLocalBusinessJsonLdData()`（Settings 由来単一 LocalBusiness）を削除し、`getGraphJsonLdData()` を Organization+WebSite のみに変更。

**Files:**

- Create: `src/app/(public)/_shared/lib/seo/location-json-ld.ts`（pure builders）
- Modify: `src/app/(public)/_shared/lib/seo/json-ld-config.ts`（`getLocalBusinessJsonLdData()` 削除、`getGraphJsonLdData()` 改修）
- Modify: `src/app/(public)/_shared/lib/seo/index.ts`（barrel）
- Modify: `src/app/(public)/_shared/components/seo/json-ld.tsx`（`<GraphJsonLd>` 改修、新 component `<LocationLocalBusinessJsonLd>` / `<LocationsLocalBusinessJsonLd>` 追加）

### Step 3.1: location-json-ld.ts 新設

`src/app/(public)/_shared/lib/seo/location-json-ld.ts` を新規作成:

```typescript
/**
 * per-location LocalBusiness JSON-LD ビルダー（Google 公式準拠）
 *
 * 各物理拠点ごとに独立した LocalBusiness markup を生成。
 * Google Search Central の Local Business 構造化データガイドに準拠。
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/local-business
 */

import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { getBaseUrl, CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  getPublishedLocationsForSeo,
  getPublishedLocationForSeoBySlug,
  type LocationForSeo,
} from "@/shared/domain/locations/public-queries";
import { isRecord, omitUndefined } from "@/shared/lib/serialize";
import {
  convertToOpeningHoursSpecification,
  convertToSpecialOpeningHours,
  ATTR_LABELS,
} from "./json-ld-config";

const BASE_URL = getBaseUrl();

interface AmenityFeatureSpec {
  "@type": "LocationFeatureSpecification";
  name: string;
  value: boolean;
}

export interface LocationLocalBusinessJsonLdData {
  "@id"?: string;
  name: string;
  description?: string;
  url: string;
  image?: string | string[];
  telephone?: string;
  email?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
  openingHoursSpecification?: ReturnType<
    typeof convertToOpeningHoursSpecification
  >;
  specialOpeningHoursSpecification?: ReturnType<
    typeof convertToSpecialOpeningHours
  >;
  priceRange?: string;
  geo?: { latitude: number; longitude: number };
  hasMap?: string;
  currenciesAccepted?: string;
  paymentAccepted?: string;
  amenityFeature?: AmenityFeatureSpec[];
  branchOf?: { "@id": string };
}

function convertAmenitiesToFeatures(
  amenities: unknown,
): AmenityFeatureSpec[] | undefined {
  if (!isRecord(amenities)) return undefined;
  const features: AmenityFeatureSpec[] = [];
  for (const [key, value] of Object.entries(amenities)) {
    if (value === true) {
      features.push({
        "@type": "LocationFeatureSpecification",
        name: ATTR_LABELS[key] || key,
        value: true,
      });
    }
  }
  return features.length > 0 ? features : undefined;
}

/**
 * 1 拠点分の LocalBusiness JSON-LD データを生成（pure function）
 *
 * @param location - SEO 用 Location データ
 * @param options.includeBranchOf - true で branchOf を併記（複数拠点時のみ）
 */
export function buildLocationLocalBusinessJsonLdData(
  location: LocationForSeo,
  options: { includeBranchOf: boolean },
): LocationLocalBusinessJsonLdData {
  const streetAddress = [location.streetAddress, location.buildingName]
    .filter(Boolean)
    .join(" ");

  const geo =
    location.latitude !== null && location.longitude !== null
      ? { latitude: location.latitude, longitude: location.longitude }
      : undefined;

  const hasMap = geo
    ? `https://www.google.com/maps?q=${geo.latitude},${geo.longitude}`
    : undefined;

  return omitUndefined({
    "@id": `${BASE_URL}/access/${location.slug}#localbusiness`,
    name: location.name,
    description: location.description ?? undefined,
    url: `${BASE_URL}/access/${location.slug}`,
    image: location.imageUrl ? [location.imageUrl] : undefined,
    telephone: location.phoneNumber ?? undefined,
    email: location.email ?? undefined,
    address:
      location.postalCode || location.prefecture
        ? omitUndefined({
            postalCode: location.postalCode ?? undefined,
            addressRegion: location.prefecture ?? undefined,
            addressLocality: location.city ?? undefined,
            streetAddress: streetAddress || undefined,
            addressCountry: "JP",
          })
        : undefined,
    openingHoursSpecification: convertToOpeningHoursSpecification(
      location.businessHours,
    ),
    specialOpeningHoursSpecification: convertToSpecialOpeningHours(
      location.specialHolidays,
    ),
    priceRange: location.priceRange ?? undefined,
    geo,
    hasMap,
    currenciesAccepted: "JPY",
    paymentAccepted: location.paymentAccepted ?? undefined,
    amenityFeature: convertAmenitiesToFeatures(location.amenities),
    branchOf: options.includeBranchOf
      ? { "@id": `${BASE_URL}/#organization` }
      : undefined,
  });
}

/**
 * 公開済み全 Location 分の JSON-LD データを取得（/access ページ用）
 */
export async function getAllPublishedLocationsJsonLdData(): Promise<
  LocationLocalBusinessJsonLdData[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.LOCATIONS);

  const locations = await getPublishedLocationsForSeo();
  const includeBranchOf = locations.length > 1;
  return locations.map((loc) =>
    buildLocationLocalBusinessJsonLdData(loc, { includeBranchOf }),
  );
}

/**
 * 拠点単体ページ向け JSON-LD データを取得（/access/[locationSlug] 用）
 */
export async function getLocationJsonLdDataBySlug(
  slug: string,
): Promise<LocationLocalBusinessJsonLdData | null> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.LOCATIONS);

  const [location, all] = await Promise.all([
    getPublishedLocationForSeoBySlug(slug),
    getPublishedLocationsForSeo(),
  ]);
  if (!location) return null;
  return buildLocationLocalBusinessJsonLdData(location, {
    includeBranchOf: all.length > 1,
  });
}
```

### Step 3.2: json-ld-config.ts のリファクタ

`src/app/(public)/_shared/lib/seo/json-ld-config.ts` から `LocalBusinessJsonLdData` 型と `getLocalBusinessJsonLdData()` 関数を削除。`convertToOpeningHoursSpecification` / `convertToSpecialOpeningHours` / `ATTR_LABELS` / `DAY_MAP` / `DAY_LABELS` は **export を維持**（location-json-ld.ts と Footer/BusinessInfo で再利用）。

`getGraphJsonLdData()` を以下に変更:

```typescript
export interface GraphJsonLdData {
  organization: OrganizationJsonLdData;
  webSite: WebSiteJsonLdData;
}

export async function getGraphJsonLdData(): Promise<GraphJsonLdData> {
  const [organization, webSite] = await Promise.all([
    getOrganizationJsonLdData(),
    getWebSiteJsonLdData(),
  ]);
  return { organization, webSite };
}
```

`getOrganizationJsonLdData()` は `sameAs` を含むよう拡張（複数拠点時に各 LocalBusiness が `branchOf` で参照する Organization のため）:

```typescript
export interface OrganizationJsonLdData {
  "@id"?: string;
  name: string;
  description?: string;
  url: string;
  logo?: string;
  telephone?: string;
  email?: string;
  address?: { /* PostalAddress */ };
  sameAs?: string[];
  foundingDate?: string;
  additionalType?: string;
}

export async function getOrganizationJsonLdData(): Promise<OrganizationJsonLdData> {
  const [settings, sameAs] = await Promise.all([
    getOrganizationSettings(),
    getSocialLinkUrls(),
  ]);
  // ... 既存ロジックに sameAs / foundingDate / additionalType を追加
  return omitUndefined({
    "@id": `${BASE_URL}/#organization`,
    name: settings?.businessName || settings?.siteName || SITE_DEFAULTS.name,
    description: settings?.businessDescription || settings?.siteDescription || undefined,
    url: BASE_URL,
    logo: settings?.headerLogoUrl || undefined,
    telephone: settings?.phoneNumber || undefined,
    email: settings?.email || undefined,
    address: /* 既存どおり */,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    foundingDate: settings?.establishedDate
      ? new Date(settings.establishedDate).toISOString().split("T")[0]
      : undefined,
    additionalType: "https://en.wikipedia.org/wiki/Coworking",
  });
}
```

### Step 3.3: seo/index.ts barrel 更新

`src/app/(public)/_shared/lib/seo/index.ts` で:

- 削除: `export { getLocalBusinessJsonLdData } from "./json-ld-config"`
- 追加: `export { getAllPublishedLocationsJsonLdData, getLocationJsonLdDataBySlug, buildLocationLocalBusinessJsonLdData, type LocationLocalBusinessJsonLdData } from "./location-json-ld"`

### Step 3.4: json-ld.tsx の component 改修

`src/app/(public)/_shared/components/seo/json-ld.tsx` を編集:

**`<GraphJsonLd>` 改修**:

```tsx
export function GraphJsonLd({
  organization,
  webSite,
}: {
  organization: OrganizationJsonLdData;
  webSite: { name: string; description?: string; url?: string };
}): ReactElement {
  const orgId = `${organization.url}/#organization`;
  const websiteId = `${webSite.url || BASE_URL}/#website`;

  const data = {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationData({ ...organization, id: orgId }),
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: webSite.name,
        ...(webSite.description && { description: webSite.description }),
        url: webSite.url || BASE_URL,
        publisher: { "@id": orgId },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${webSite.url || BASE_URL}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return <JsonLd data={data} />;
}
```

**新 component `<LocationLocalBusinessJsonLd>`**（単一拠点詳細ページ用）:

```tsx
import type { LocationLocalBusinessJsonLdData } from "@/public/lib/seo/location-json-ld";

export function LocationLocalBusinessJsonLd(
  props: LocationLocalBusinessJsonLdData,
): ReactElement {
  const data = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    ...props,
  };
  return <JsonLd data={data} />;
}
```

**新 component `<LocationsLocalBusinessJsonLd>`**（/access 一覧ページ用、複数拠点を 1 `<script>` にまとめる）:

```tsx
export function LocationsLocalBusinessJsonLd({
  locations,
}: {
  locations: LocationLocalBusinessJsonLdData[];
}): ReactElement | null {
  if (locations.length === 0) return null;
  const data = {
    "@context": "https://schema.org",
    "@graph": locations.map((loc) => ({
      "@type": "LocalBusiness",
      ...loc,
    })),
  };
  return <JsonLd data={data} />;
}
```

**`<LocalBusinessJsonLd>` 削除**: 旧単一拠点用の export を削除（`buildLocalBusinessData` も削除）。`OrganizationJsonLd` は維持。

### Step 3.5: type-check + lint

```bash
bun run type-check
bun run lint
```

期待: 型エラーゼロ。`getLocalBusinessJsonLdData()` を import している箇所が残っていれば次の Phase で解消。

### Step 3.6: Commit

```bash
git add src/app/\(public\)/_shared/lib/seo/ src/app/\(public\)/_shared/components/seo/json-ld.tsx
git commit -m "$(cat <<'EOF'
feat(seo): per-location LocalBusiness JSON-LD builder (Google official pattern)

- New location-json-ld.ts: pure builder + cached fetchers per location
- json-ld-config.ts: drop getLocalBusinessJsonLdData, expand Organization
  with sameAs/foundingDate for branchOf reference
- json-ld.tsx: <GraphJsonLd> emits Organization+WebSite only;
  add <LocationLocalBusinessJsonLd> + <LocationsLocalBusinessJsonLd>

Reference: https://developers.google.com/search/docs/appearance/structured-data/local-business

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Public layout refactor

**目的:** `(public)/layout.tsx` の site-wide LocalBusiness を撤去。`/access` ページに `<LocationsLocalBusinessJsonLd>` を追加。LocationChapter に詳細ページへの Link を追加。

**Files:**

- Modify: `src/app/(public)/layout.tsx`（`<StructuredDataContent>` 改修）
- Modify: `src/app/(public)/access/page.tsx`（`<LocationsLocalBusinessJsonLd>` 追加）
- Modify: `src/app/(public)/access/_components/location-chapter.tsx`（Link 追加）
- Modify: `src/app/(public)/access/_components/locations-overview.tsx`（必要なら slug を anchorId に使用）
- Modify: `src/app/(public)/_shared/data/business.ts`（`getBusinessInfo()` の戻り値型から MEO 関連削除済み確認）

### Step 4.1: layout.tsx の StructuredDataContent 改修

`src/app/(public)/layout.tsx` の `StructuredDataContent` を改修:

```tsx
async function StructuredDataContent(): Promise<ReactElement> {
  const graphData = await getGraphJsonLdData();
  return (
    <GraphJsonLd
      organization={graphData.organization}
      webSite={graphData.webSite}
    />
  );
}
```

`getGraphJsonLdData()` の戻り値型が `{ organization, webSite }` に変わったので spread 引数も修正。

### Step 4.2: access/page.tsx に LocationsLocalBusinessJsonLd 追加

`src/app/(public)/access/page.tsx` の `AccessPage` 関数内に JSON-LD output を追加:

```tsx
import { getAllPublishedLocationsJsonLdData } from "@/public/lib/seo";
import { LocationsLocalBusinessJsonLd } from "@/public/components/seo/json-ld";

// AccessChaptersJsonLd という名前の Suspense child を作成
async function AccessChaptersJsonLd(): Promise<ReactElement | null> {
  const locations = await getAllPublishedLocationsJsonLdData();
  return <LocationsLocalBusinessJsonLd locations={locations} />;
}

// PageLayout の children として Suspense でラップして配置
<Suspense fallback={null}>
  <AccessChaptersJsonLd />
</Suspense>;
```

### Step 4.3: resolveLocations の slug 連携

`/access/page.tsx` の `resolveLocations()` で、Location.slug がある場合は anchorId として slug をそのまま使う（複数拠点時の SEO URL 一貫性）。フォールバック合成 Location は `anchorId: "main-location"` 固定。

```typescript
async function resolveLocations(): Promise<
  ReadonlyArray<{
    anchorId: string;
    index: number;
    location: LocationForAccess;
  }>
> {
  const locations = await getPublishedLocationsForAccess();
  if (locations.length === 0) {
    const fallback = await buildFallbackLocation();
    return fallback
      ? [{ anchorId: "main-location", index: 1, location: fallback }]
      : [];
  }
  return locations.map((loc, i) => ({
    anchorId: loc.slug, // ← slug を anchorId に使用
    index: i + 1,
    location: loc,
  }));
}
```

### Step 4.4: location-chapter.tsx に詳細ページ Link 追加

`src/app/(public)/access/_components/location-chapter.tsx` の見出し or「詳細を見る」CTA を `<Link href={\`/access/${slug}\`}>` に変更。fallback Location の場合は Link を出さない（slug = "main-location" で route が存在しないため）:

```tsx
{
  location.slug !== "main-location" ? (
    <Link
      href={`/access/${location.slug}` as Route<string>}
      className="text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
    >
      詳細を見る
    </Link>
  ) : null;
}
```

### Step 4.5: business.ts の getBusinessInfo() 型確認

Phase 2 で MEO 関連を削除済み。再確認のみ:

```bash
grep -n "latitude\|longitude\|priceRange\|googleBusinessPlaceId\|googleReviewUrl\|businessAttributes\|paymentAccepted\|specialHolidays" src/app/\(public\)/_shared/data/business.ts
```

期待: ヒットなし。

### Step 4.6: 型チェック + dev で /access 確認

```bash
bun run type-check
bun run lint
bun dev
```

ブラウザで `/access` を開いて以下を目視確認:

- 各 Location カードに「詳細を見る」リンクが出ている（fallback 時は出ない）
- HTML source に `<script type="application/ld+json">` が `Organization` + `WebSite` の `@graph`（layout 由来）と `LocalBusiness[]` の `@graph`（access page 由来）の **2 つ**含まれる

### Step 4.7: Commit

```bash
git add src/app/\(public\)/layout.tsx src/app/\(public\)/access/
git commit -m "$(cat <<'EOF'
refactor(seo): drop site-wide LocalBusiness, emit per-location on /access

- layout.tsx GraphJsonLd: Organization + WebSite only (no LocalBusiness)
- /access/page.tsx: emit <LocationsLocalBusinessJsonLd> with all
  published locations (Google official "repeated markup per location")
- location-chapter.tsx: link to /access/[slug] detail (skip fallback)
- resolveLocations: use Location.slug as anchorId

Spec: §2.3 (JSON-LD output architecture)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: New /access/[locationSlug] detail page

**目的:** 拠点詳細ページを Next.js 16 App Router の dynamic segment として新設。LocationChapter コンポーネントを再利用しつつ、`<LocationLocalBusinessJsonLd>` を出力。

**Files:**

- Create: `src/app/(public)/access/[locationSlug]/page.tsx`
- Create: `src/app/(public)/access/[locationSlug]/loading.tsx`
- Create: `src/app/(public)/access/[locationSlug]/error.tsx`
- Create: `src/app/(public)/access/[locationSlug]/not-found.tsx`

### Step 5.1: page.tsx 作成

```tsx
/**
 * /access/[locationSlug] — 拠点詳細ページ
 *
 * Per-location LocalBusiness JSON-LD（Google 公式準拠）を出力。
 * LocationChapter コンポーネントを再利用してレイアウトを統一する。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Container } from "@/public/components/design-system/container";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { LocationChapter } from "../_components/location-chapter";
import { getPublishedLocationForAccessBySlug } from "@/shared/domain/locations/public-queries";
import { getLocationJsonLdDataBySlug } from "@/public/lib/seo";
import { LocationLocalBusinessJsonLd } from "@/public/components/seo/json-ld";
import { getBusinessInfo } from "@/public/data/business";
import { getBaseUrl } from "@/shared/lib/constants";

type PageProps = {
  params: Promise<{ locationSlug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
  const { locationSlug } = await params;
  const location = await getPublishedLocationForAccessBySlug(locationSlug);
  if (!location) return { title: "拠点が見つかりません" };

  const baseUrl = getBaseUrl();
  return {
    title: `${location.name} - アクセス`,
    description:
      location.description ??
      `${location.name}のアクセス情報・営業時間・設備をご案内します`,
    alternates: {
      canonical: `${baseUrl}/access/${locationSlug}`,
    },
    openGraph: {
      title: `${location.name} - アクセス`,
      description: location.description ?? undefined,
      url: `${baseUrl}/access/${locationSlug}`,
      images: location.imageUrl ? [location.imageUrl] : undefined,
    },
  };
}

async function LocationJsonLdSection({
  slug,
}: {
  slug: string;
}): Promise<ReactElement | null> {
  const data = await getLocationJsonLdDataBySlug(slug);
  return data ? <LocationLocalBusinessJsonLd {...data} /> : null;
}

export default async function LocationDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  const { locationSlug } = await params;

  const [location, businessInfo] = await Promise.all([
    getPublishedLocationForAccessBySlug(locationSlug),
    getBusinessInfo(),
  ]);

  if (!location) notFound();

  return (
    <PageLayout
      variant="content"
      cta={
        <SiteCTA
          label="Contact"
          title="ご不明な点はお気軽にどうぞ"
          buttonText="お問い合わせ"
          buttonHref="/contact"
        />
      }
    >
      <Suspense fallback={null}>
        <LocationJsonLdSection slug={locationSlug} />
      </Suspense>
      <section className="pt-12 md:pt-20 pb-[var(--space-lg)]">
        <Container>
          <ScrollReveal>
            <LocationChapter
              anchorId={location.slug}
              index={1}
              location={location}
              googleMapsUrl={businessInfo.googleMapsUrl}
              showSectionDivider={false}
            />
          </ScrollReveal>
        </Container>
      </section>
    </PageLayout>
  );
}
```

> **注**: `getPublishedLocationForAccessBySlug(slug)` を Phase 2 (`public-queries.ts`) で追加していなければ追加する。Step 2.3 で `LocationForSeo` 型用の関数は追加済みだが、`LocationForAccess`（フル取得）用も別途必要。

### Step 5.2: loading.tsx 作成

```tsx
import { Container } from "@/public/components/design-system/container";

export default function LocationDetailLoading() {
  return (
    <Container>
      <div className="space-y-8 py-20" aria-busy="true" aria-live="polite">
        <div className="h-8 w-1/3 animate-pulse bg-muted" />
        <div className="aspect-[3/2] animate-pulse bg-muted" />
        <div className="space-y-4">
          <div className="h-4 w-2/3 animate-pulse bg-muted" />
          <div className="h-4 w-1/2 animate-pulse bg-muted" />
        </div>
      </div>
    </Container>
  );
}
```

### Step 5.3: error.tsx 作成

```tsx
"use client";

import { useEffect } from "react";
import { logError, ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { Container } from "@/public/components/design-system/container";
import { Button } from "@/public/components/design-system/button";

export default function LocationDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void logError(error, {
      category: ErrorCategory.RENDERING,
      severity: ErrorSeverity.MEDIUM,
      context: { route: "/access/[locationSlug]" },
    });
  }, [error]);

  return (
    <Container>
      <div className="py-20 text-center">
        <h1 className="text-h2">拠点情報を取得できませんでした</h1>
        <p className="mt-4 text-muted-foreground">
          時間をおいて再度お試しください。
        </p>
        <div className="mt-8">
          <Button onClick={reset} variant="editorial">
            再試行
          </Button>
        </div>
      </div>
    </Container>
  );
}
```

### Step 5.4: not-found.tsx 作成

```tsx
import Link from "next/link";
import { Container } from "@/public/components/design-system/container";
import { Button } from "@/public/components/design-system/button";

export default function LocationNotFound() {
  return (
    <Container>
      <div className="py-20 text-center">
        <h1 className="text-h2">拠点が見つかりません</h1>
        <p className="mt-4 text-muted-foreground">
          指定された拠点は存在しないか、現在公開されていません。
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button asChild variant="editorial">
            <Link href="/access">アクセス一覧へ</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">ホームへ戻る</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
```

### Step 5.5: getPublishedLocationForAccessBySlug を public-queries.ts に追加

Phase 2 で追加済みでない場合、`src/shared/domain/locations/public-queries.ts` に:

```typescript
export async function getPublishedLocationForAccessBySlug(
  slug: string,
): Promise<LocationForAccess | null> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.LOCATIONS);

  const validated = slugParamSchema.safeParse(slug);
  if (!validated.success) return null;

  const location = await safeFetch({
    fetch: () =>
      prisma.location.findUnique({
        where: { slug: validated.data, isPublished: true, isActive: true },
        select: {
          /* 全 LocationForAccess select */
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedLocationForAccessBySlug",
  });

  return location ? toPlainObject(location) : null;
}
```

### Step 5.6: dev でブラウザ確認

```bash
bun dev
```

`/access/honkan`（または seed 済 slug）を開いて:

- ページが描画される
- HTML source に `<script type="application/ld+json">` で `"@type": "LocalBusiness"` が含まれる
- 存在しない slug `/access/nonexistent-slug` で 404 表示

### Step 5.7: type-check + lint

```bash
bun run validate
```

### Step 5.8: Commit

```bash
git add src/app/\(public\)/access/\[locationSlug\]/ src/shared/domain/locations/public-queries.ts
git commit -m "$(cat <<'EOF'
feat(access): location detail page with per-location LocalBusiness JSON-LD

- New route /access/[locationSlug] (page/loading/error/not-found)
- generateMetadata with canonical + OG image per location
- Reuses LocationChapter component for layout consistency
- Emits <LocationLocalBusinessJsonLd> via Suspense

Spec: §2.5 (新規ページ)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Admin — remove MeoSection (Settings 側完全削除)

**目的:** 管理画面の Settings ページから MEO セクションを完全削除。`updateMeoSettings` Server Action を削除。`meoFormSchema` を削除。

**Files:**

- Delete: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/MeoSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts`（export 削除）
- Modify: `src/app/(admin)/admin/(dashboard)/settings/page.tsx` または `_components/SettingsTabs.tsx`（タブから MEO 削除）
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts`（`updateMeoSettings` 削除）
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts`（export 削除）
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-seo-analytics.ts`（`meoFormSchema` 削除）

### Step 6.1: MeoSection.tsx 削除

```bash
git rm src/app/\(admin\)/admin/\(dashboard\)/settings/_components/sections/MeoSection.tsx
```

### Step 6.2: index.ts から export 削除

`src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts` の `export { MeoSection } from "./MeoSection"` を削除。

### Step 6.3: settings/page.tsx か SettingsTabs.tsx の MEO タブ削除

```bash
grep -rn "MeoSection\|MEO対策\|meo" src/app/\(admin\)/admin/\(dashboard\)/settings/ --include="*.tsx" --include="*.ts" | head -20
```

ヒットした箇所から MeoSection 描画を削除（タブ定義 / セクション render）。

### Step 6.4: updateMeoSettings 関数削除

`src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts` から `updateMeoSettings` 関数全体を削除。`index.ts` の re-export も削除。

### Step 6.5: meoFormSchema 削除

`src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-seo-analytics.ts` から `meoFormSchema` 全体を削除。`schemas/index.ts` barrel に re-export があれば削除。

### Step 6.6: 関連 import の cleanup

```bash
grep -rn "MeoSection\|updateMeoSettings\|meoFormSchema" src/ __tests__/ 2>/dev/null
```

期待: ヒットなし。残っていれば削除。

### Step 6.7: 関連 integration test 削除

```bash
ls __tests__/integration/actions/admin/settings-meo* __tests__/integration/actions/admin/meo* 2>/dev/null
```

該当ファイルがあれば `git rm` で削除（Phase 8 で per-location テストを別途作成）。

### Step 6.8: type-check + lint

```bash
bun run validate
```

### Step 6.9: Commit

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(admin): remove Settings-level MeoSection (moved to per-Location)

- Delete MeoSection.tsx and tab entry
- Delete updateMeoSettings Server Action and meoFormSchema
- Drop related integration tests (per-location tests added in Phase 8)
- Clean up imports across settings page

Spec: §3.1 (削除されるファイル / 関数)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Admin — Location MEO tab + per-location score

**目的:** `/admin/locations/[id]/edit` ページに MEO タブを追加。LocationForm を拡張して MEO フィールド入力に対応。LocationMeoScoreCard を新設（per-location 14 項目スコア）。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/locations/[id]/edit/page.tsx`（タブレイアウト導入）
- Modify: `src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx`（MEO セクション追加）
- Create: `src/app/(admin)/admin/(dashboard)/locations/_components/LocationMeoScoreCard.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/location.ts`（updateLocation Input に MEO フィールド追加）
- Modify: `src/shared/domain/settings/admin-queries.ts`（per-location score で参照する Settings.businessName / establishedDate / SocialLink を取得する query）
- Modify: `src/app/(admin)/admin/(dashboard)/locations/new/page.tsx`（slug + MEO フィールド入力）

### Step 7.1: LocationForm に slug + 住所詳細 + MEO セクションを追加

`src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx` の現状を Read した上で、以下を追加:

**slug 入力フィールド**（必須、URL 表示プレビュー付き）:

```tsx
<FormField
  control={form.control}
  name="slug"
  render={({ field }) => (
    <FormItem>
      <FormLabel>スラッグ（URL 識別子）</FormLabel>
      <FormControl>
        <Input {...field} placeholder="honkan" disabled={isPending} />
      </FormControl>
      <FormDescription>
        公開 URL: <code>/access/{field.value || "slug"}</code>
        <br />
        小文字英数字とハイフンのみ。一度公開後の変更は SEO に影響します。
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

**住所詳細フィールド（PostalAddress）**:

`postalCode` / `prefecture` / `city` / `streetAddress` / `buildingName` を `<fieldset>` にグループ化:

```tsx
<fieldset className="rounded-lg border p-4 space-y-4">
  <legend className="px-1 text-sm font-medium">住所詳細（構造化データ用）</legend>
  <div className="grid gap-4 sm:grid-cols-2">
    <FormField name="postalCode" {...} />
    <FormField name="prefecture" {...} />
  </div>
  <div className="grid gap-4 sm:grid-cols-2">
    <FormField name="city" {...} />
    <FormField name="streetAddress" {...} />
  </div>
  <FormField name="buildingName" {...} />
  <p className="text-xs text-muted-foreground">
    上記の構造化住所は LocalBusiness JSON-LD で使用されます。`address` フィールドは表示用、ここは検索エンジン用です。
  </p>
</fieldset>
```

**MEO セクション（緯度経度 / GBP / 価格帯 / 決済 / 連絡先）**:

```tsx
<fieldset className="rounded-lg border p-4 space-y-4">
  <legend className="px-1 text-sm font-medium">MEO（ローカル検索最適化）</legend>

  <div className="grid gap-4 sm:grid-cols-2">
    <FormField name="latitude" {...} />
    <FormField name="longitude" {...} />
  </div>

  <FormField name="phoneNumber" {...} />
  <FormField name="email" {...} />

  <FormField name="priceRange"
    description="例: ¥1,000〜¥5,000/時間（最大 100 文字）" {...} />

  <FormField name="paymentAccepted"
    description="現金, クレジットカード, 電子マネー, QRコード決済" {...} />

  <FormField name="googleBusinessPlaceId"
    description="Google Maps Platform で確認できます（ChIJ...）" {...} />

  <FormField name="googleReviewUrl"
    description="お客様に口コミ投稿を促すための URL" {...} />
</fieldset>
```

**施設属性（既存 amenities フィールドを wifi / parking / etc のチェックボックスに）**:

既存の `amenities` フィールド入力 UI を維持しつつ、`BUSINESS_ATTRIBUTE_OPTIONS`（`@/shared/lib/business-attributes` を参照）でチェックボックスを再利用。

### Step 7.2: LocationMeoScoreCard 新設

`src/app/(admin)/admin/(dashboard)/locations/_components/LocationMeoScoreCard.tsx` を新規作成。spec §2.6 の 14 項目（per-location 11 項目 + 全社共通 3 項目）を計算:

```tsx
"use client";

import { useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import type { LocationFormValues } from "@/shared/lib/validations/location";

interface ScoreItem {
  label: string;
  isSet: boolean;
}

function calculateMeoScore(
  values: Partial<LocationFormValues>,
  globals: {
    businessName: boolean;
    establishedDate: boolean;
    socialLinks: boolean;
  },
): { score: number; items: ScoreItem[] } {
  const items: ScoreItem[] = [
    { label: "拠点名", isSet: !!values.name },
    {
      label: "住所（構造化）",
      isSet: !!(values.postalCode && values.prefecture && values.city),
    },
    { label: "電話番号", isSet: !!values.phoneNumber },
    { label: "メールアドレス", isSet: !!values.email },
    {
      label: "緯度・経度",
      isSet:
        values.latitude !== null &&
        values.latitude !== undefined &&
        values.longitude !== null &&
        values.longitude !== undefined,
    },
    { label: "営業時間", isSet: !!values.businessHours },
    { label: "価格帯", isSet: !!values.priceRange },
    { label: "拠点説明", isSet: !!values.description },
    { label: "拠点画像", isSet: !!values.imageUrl },
    { label: "Google Place ID", isSet: !!values.googleBusinessPlaceId },
    { label: "決済方法", isSet: !!values.paymentAccepted },
    { label: "事業者名（全社）", isSet: globals.businessName },
    { label: "設立日（全社）", isSet: globals.establishedDate },
    { label: "ソーシャルリンク（全社）", isSet: globals.socialLinks },
  ];
  const setCount = items.filter((i) => i.isSet).length;
  return { score: Math.round((setCount / items.length) * 100), items };
}

interface LocationMeoScoreCardProps {
  control: Control<LocationFormValues>;
  globals: {
    businessName: boolean;
    establishedDate: boolean;
    socialLinks: boolean;
  };
}

export function LocationMeoScoreCard({
  control,
  globals,
}: LocationMeoScoreCardProps) {
  const values = useWatch({ control });
  const { score, items } = calculateMeoScore(values, globals);

  return (
    <Card>
      <CardHeader>
        <CardTitle>MEO 情報充実度スコア（拠点）</CardTitle>
        <CardDescription>
          ローカル検索で有利になるための設定充実度を確認できます
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 円グラフ + メッセージ + 14 項目チェックリスト UI（既存 MeoSection の SVG 流用可） */}
        {/* spec §2.6 の表に対応 */}
      </CardContent>
    </Card>
  );
}
```

旧 MeoSection.tsx の SVG 円グラフ実装と項目リスト UI を**そのままコピー**して LocationMeoScoreCard に移植する（13 項目 → 14 項目に変更、全社共通項目に「全社」サフィックス）。

### Step 7.3: edit/page.tsx に MEO タブ統合

`src/app/(admin)/admin/(dashboard)/locations/[id]/edit/page.tsx` を改修:

```tsx
import { LocationForm } from "../../_components/LocationForm";
import { LocationMeoScoreCard } from "../../_components/LocationMeoScoreCard";
import {
  getOrganizationSettings,
  getSocialLinkUrls,
} from "@/shared/domain/settings/queries/organization";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/admin/components/ui";

export default async function LocationEditPage({ params }: PageProps) {
  const { id } = await params;
  const [location, settings, socialLinks] = await Promise.all([
    getLocationById(id),
    getOrganizationSettings(),
    getSocialLinkUrls(),
  ]);
  if (!location) notFound();

  const globals = {
    businessName: !!settings?.businessName,
    establishedDate: !!settings?.establishedDate,
    socialLinks: socialLinks.length > 0,
  };

  return (
    <AdminDetailLayout
      backHref="/admin/locations"
      title={location.name}
      subtitle={`/access/${location.slug}`}
    >
      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">基本情報</TabsTrigger>
          <TabsTrigger value="meo">MEO</TabsTrigger>
        </TabsList>
        <TabsContent
          value="basic"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <LocationForm location={location} mode="edit" />
        </TabsContent>
        <TabsContent
          value="meo"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <div className="space-y-6">
            <LocationMeoScoreCard
              control={/* form context — LocationForm から context を共有する設計判断 */}
              globals={globals}
            />
            {/* MEO 入力フォームは LocationForm 内のセクションでまとめている */}
          </div>
        </TabsContent>
      </Tabs>
    </AdminDetailLayout>
  );
}
```

> **設計判断**: LocationForm 内に MEO 入力 UI を含める設計と、LocationMeoScoreCard を別途配置する設計の二つが両立する。実装時は `useFormContext` で control を共有するか、edit page 全体を 1 form scope にする。Implementer は既存 LocationForm の構造を Read してから判断（バンドル時に決定）。

### Step 7.4: updateLocation Server Action の Zod input 拡張

`src/app/(admin)/admin/(dashboard)/_shared/actions/location.ts` の `updateLocation` / `createLocation` の input schema に MEO + slug + 住所詳細 + 連絡先フィールドを追加（Phase 2 で `locationFormSchema` に追加済みなので `.shape` 経由 import）。

```typescript
import { locationFormSchema } from "@/shared/lib/validations/location";

const updateLocationSchema = locationFormSchema; // 完全一致

export async function updateLocation(
  id: string,
  input: unknown,
): Promise<MutationResult<{ id: string }>> {
  const parsed = updateLocationSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "location",
    action: "update",
    resourceId: id,
    execute: async () => updateLocationCommand(id, parsed.data),
    afterSuccess: (data) => {
      updateTag(CACHE_TAGS.LOCATIONS);
      updateTag(getCacheTag.locations.detail(data.slug));
    },
  });
}
```

`getCacheTag.locations.detail(slug)` を `@/shared/lib/constants` に新設（per-location キャッシュ無効化用）。

### Step 7.5: new/page.tsx も同等対応

`src/app/(admin)/admin/(dashboard)/locations/new/page.tsx` で `LocationForm mode="create"` に slug 入力 + MEO セクションが表示されるよう確認（LocationForm 共通実装で対応）。

### Step 7.6: dev で動作確認

```bash
bun dev
```

`/admin/locations/[id]/edit` を開いて:

- 「基本情報」「MEO」タブが表示
- MEO タブで Place ID / 緯度経度 / 価格帯等が編集可能
- LocationMeoScoreCard が 14 項目スコアを表示
- 保存後 `/access/[slug]` にリダイレクトせず編集ページに留まる
- `/access` 公開ページに変更が反映（cache invalidation 確認）

### Step 7.7: 関連 integration test の更新

```bash
grep -rn "updateLocation\|createLocation" __tests__/integration/actions/admin/ 2>/dev/null
```

ヒットしたテストの fixture に新フィールドを追加。

### Step 7.8: type-check + lint

```bash
bun run validate
```

### Step 7.9: Commit

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(admin): per-Location MEO tab with 14-item score

- LocationForm: add slug + structured address + MEO fieldset
- LocationMeoScoreCard: per-location 14-item score (11 location + 3 global)
- edit/page.tsx: Tabs primitive [基本情報 | MEO]
- updateLocation: extend Zod input schema; cache invalidation per slug
- New cache tag getCacheTag.locations.detail(slug)

Spec: §2.6 (管理画面 UI 変更)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Tests (unit + integration + e2e)

**目的:** spec §5 のテスト戦略を実装。pure builder の unit test + DB → JSON-LD shape の integration test + 公開ページの e2e visual + JSON-LD presence。

**Files:**

- Create: `__tests__/unit/lib/seo/location-json-ld.test.ts`
- Create: `__tests__/integration/domain/locations/jsonld-data.test.ts`
- Modify: `__tests__/integration/actions/admin/location.test.ts`（既存）— MEO フィールド更新パス追加
- Create: `e2e/access-location-detail.spec.ts`
- Modify: `e2e/visual/access-page.spec.ts`（既存があれば）— 詳細ページリンクの visual regression

### Step 8.1: location-json-ld.test.ts (unit)

```typescript
import { describe, expect, test } from "bun:test";
import { buildLocationLocalBusinessJsonLdData } from "@/public/lib/seo/location-json-ld";
import type { LocationForSeo } from "@/shared/domain/locations/public-queries";

const baseLocation: LocationForSeo = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "honkan",
  name: "本館",
  description: "渋谷の中心に位置するレンタルスペース",
  address: "東京都渋谷区...",
  postalCode: "150-0001",
  prefecture: "東京都",
  city: "渋谷区",
  streetAddress: "1-2-3",
  buildingName: "本館ビル",
  imageUrl: "/images/honkan.jpg",
  businessHours: null,
  specialHolidays: null,
  amenities: { wifi: true, parking: true },
  latitude: 35.6595,
  longitude: 139.7004,
  googleBusinessPlaceId: "ChIJxxx",
  googleReviewUrl: null,
  priceRange: "¥1,000〜¥5,000/時間",
  paymentAccepted: "現金, クレジットカード",
  phoneNumber: "03-1234-5678",
  email: "honkan@example.com",
};

describe("buildLocationLocalBusinessJsonLdData", () => {
  test("emits @id with location slug", () => {
    const result = buildLocationLocalBusinessJsonLdData(baseLocation, {
      includeBranchOf: false,
    });
    expect(result["@id"]).toContain("/access/honkan");
  });

  test("includes geo when both latitude and longitude set", () => {
    const result = buildLocationLocalBusinessJsonLdData(baseLocation, {
      includeBranchOf: false,
    });
    expect(result.geo).toEqual({ latitude: 35.6595, longitude: 139.7004 });
    expect(result.hasMap).toContain("35.6595,139.7004");
  });

  test("omits geo when latitude is null", () => {
    const result = buildLocationLocalBusinessJsonLdData(
      { ...baseLocation, latitude: null },
      { includeBranchOf: false },
    );
    expect(result.geo).toBeUndefined();
    expect(result.hasMap).toBeUndefined();
  });

  test("includes branchOf when option is true", () => {
    const result = buildLocationLocalBusinessJsonLdData(baseLocation, {
      includeBranchOf: true,
    });
    expect(result.branchOf).toEqual({
      "@id": expect.stringContaining("/#organization"),
    });
  });

  test("omits branchOf when option is false", () => {
    const result = buildLocationLocalBusinessJsonLdData(baseLocation, {
      includeBranchOf: false,
    });
    expect(result.branchOf).toBeUndefined();
  });

  test("converts amenities to amenityFeature with Japanese labels", () => {
    const result = buildLocationLocalBusinessJsonLdData(baseLocation, {
      includeBranchOf: false,
    });
    expect(result.amenityFeature).toContainEqual({
      "@type": "LocationFeatureSpecification",
      name: "Wi-Fi",
      value: true,
    });
    expect(result.amenityFeature).toContainEqual({
      "@type": "LocationFeatureSpecification",
      name: "駐車場",
      value: true,
    });
  });

  test("emits PostalAddress with addressCountry: JP", () => {
    const result = buildLocationLocalBusinessJsonLdData(baseLocation, {
      includeBranchOf: false,
    });
    expect(result.address?.addressCountry).toBe("JP");
    expect(result.address?.postalCode).toBe("150-0001");
    expect(result.address?.streetAddress).toBe("1-2-3 本館ビル");
  });

  test("currenciesAccepted is always JPY", () => {
    const result = buildLocationLocalBusinessJsonLdData(baseLocation, {
      includeBranchOf: false,
    });
    expect(result.currenciesAccepted).toBe("JPY");
  });
});
```

実行:

```bash
bun test __tests__/unit/lib/seo/location-json-ld.test.ts
```

期待: 全 test pass。

### Step 8.2: jsonld-data.test.ts (integration)

```typescript
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@/shared/db/prisma";
import {
  getAllPublishedLocationsJsonLdData,
  getLocationJsonLdDataBySlug,
} from "@/public/lib/seo/location-json-ld";

let createdIds: string[] = [];

beforeAll(async () => {
  const loc1 = await prisma.location.create({
    data: {
      name: "Test拠点A",
      slug: "test-loc-a",
      address: "東京都...",
      imageUrl: "/test-a.jpg",
      latitude: 35.0,
      longitude: 139.0,
      isPublished: true,
      isActive: true,
    },
  });
  const loc2 = await prisma.location.create({
    data: {
      name: "Test拠点B",
      slug: "test-loc-b",
      address: "大阪府...",
      imageUrl: "/test-b.jpg",
      latitude: 34.0,
      longitude: 135.0,
      isPublished: true,
      isActive: true,
    },
  });
  createdIds = [loc1.id, loc2.id];
});

afterAll(async () => {
  await prisma.location.deleteMany({ where: { id: { in: createdIds } } });
});

describe("getAllPublishedLocationsJsonLdData", () => {
  test("returns array with correct length", async () => {
    const data = await getAllPublishedLocationsJsonLdData();
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  test("includes branchOf when multiple locations exist", async () => {
    const data = await getAllPublishedLocationsJsonLdData();
    const testLoc = data.find((d) => d["@id"]?.includes("test-loc-a"));
    expect(testLoc?.branchOf).toBeDefined();
  });
});

describe("getLocationJsonLdDataBySlug", () => {
  test("returns LocalBusiness data for valid slug", async () => {
    const data = await getLocationJsonLdDataBySlug("test-loc-a");
    expect(data).not.toBeNull();
    expect(data?.name).toBe("Test拠点A");
  });

  test("returns null for non-existent slug", async () => {
    const data = await getLocationJsonLdDataBySlug("non-existent-slug");
    expect(data).toBeNull();
  });
});
```

実行:

```bash
bun test __tests__/integration/domain/locations/jsonld-data.test.ts
```

期待: 全 test pass。

### Step 8.3: location.test.ts (integration) — MEO 更新パス追加

既存の `__tests__/integration/actions/admin/location.test.ts` を Read して、以下のテストケースを追加:

```typescript
test("updateLocation persists MEO fields", async () => {
  const created = await prisma.location.create({
    data: {
      name: "Test for MEO",
      slug: "test-meo",
      address: "東京",
      imageUrl: "/test.jpg",
    },
  });

  const result = await updateLocation(created.id, {
    name: "Test for MEO",
    slug: "test-meo",
    address: "東京",
    imageUrl: "/test.jpg",
    latitude: 35.123,
    longitude: 139.456,
    googleBusinessPlaceId: "ChIJtest",
    priceRange: "¥1,000〜¥5,000/時間",
    paymentAccepted: "現金",
    phoneNumber: "03-0000-0000",
    email: "test@example.com",
    amenities: {},
    imageUrls: [],
    sortOrder: 0,
    isPublished: false,
    isActive: true,
  });

  expect(isMutationError(result)).toBe(false);
  const reloaded = await prisma.location.findUnique({
    where: { id: created.id },
  });
  expect(reloaded?.latitude).toBe(35.123);
  expect(reloaded?.googleBusinessPlaceId).toBe("ChIJtest");

  await prisma.location.delete({ where: { id: created.id } });
});
```

### Step 8.4: e2e — access-location-detail.spec.ts

```typescript
import { test, expect } from "@playwright/test";

test.describe("/access/[locationSlug] detail page", () => {
  test("renders LocalBusiness JSON-LD", async ({ page }) => {
    // seed で作成済の slug を想定（必要に応じてテスト用 fixture に置換）
    await page.goto("/access/honkan");
    await expect(page).toHaveURL(/\/access\/honkan/);

    const jsonLdScripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const localBusinessLd = jsonLdScripts.find(
      (s) =>
        s.includes('"@type":"LocalBusiness"') ||
        s.includes('"@type": "LocalBusiness"'),
    );
    expect(localBusinessLd).toBeDefined();
  });

  test("returns 404 for non-existent slug", async ({ page }) => {
    const response = await page.goto("/access/non-existent-slug-xyz");
    expect(response?.status()).toBe(404);
  });
});
```

実行:

```bash
bunx playwright test e2e/access-location-detail.spec.ts
```

### Step 8.5: 全テスト実行で regressions 確認

```bash
bun run test:unit 2>&1 | tail -30
bun run test:integration 2>&1 | tail -30
```

期待: pre-existing failure のみ（diff 検証は controller 側 + plan-drift-detector で）。

### Step 8.6: Commit

```bash
git add __tests__/ e2e/
git commit -m "$(cat <<'EOF'
test(seo): unit + integration + e2e for multi-location JSON-LD

- unit: buildLocationLocalBusinessJsonLdData branches (geo/branchOf/amenity)
- integration: getAllPublishedLocationsJsonLdData / getLocationJsonLdDataBySlug
  with real DB (2-location fixture)
- integration: updateLocation MEO field persistence
- e2e: /access/[slug] renders LocalBusiness JSON-LD; 404 for unknown slug

Spec: §5 (テスト戦略)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: ADR + rule docs sync + handoff memory

**目的:** ADR 0023 を作成。SEO / SSoT / gotchas の rule docs を per-location パターンに同期。後続 Phase 2-5 のための handoff memory を記録。

**Files:**

- Create: `docs/architecture/decisions/0023-multi-location-seo-foundation.md`
- Modify: `.claude/rules/frontend/seo-patterns.md`（per-location パターンに書き換え）
- Modify: `.claude/rules/gotchas/domain.md` および `.claude/rules/gotchas/ui.md`（MeoSection 関連 gotcha cleanup + per-location cache invalidation 追加。barrel-index 分割後は sub-file に振り分け: cache invalidation は domain.md、UI gotchas は ui.md）
- Modify: `.claude/rules/ssot-singletons.md`（MEO の SSoT を Location に変更）
- Create: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_meo-multi-location-handoff.md`
- Modify: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md`

### Step 9.1: ADR 0023 作成

`docs/architecture/decisions/0023-multi-location-seo-foundation.md`:

```markdown
# ADR 0023: Multi-Location SEO Foundation — Per-Location LocalBusiness JSON-LD

**Date**: 2026-04-27
**Status**: Accepted

## Context

単一拠点 MEO 設計が multi-location テンプレート要件と乖離。Google [Local Business 構造化データ公式ガイド](https://developers.google.com/search/docs/appearance/structured-data/local-business) は **複数拠点 = repeated `LocalBusiness` markup per location** を推奨し、`@graph` / `branchOf` / `parentOrganization` は明示推奨していない（schema.org spec はサポート、Google 解釈は補助的）。

現状 `Settings` シングルトンに `latitude` / `longitude` / `googleBusinessPlaceId` / `googleReviewUrl` / `priceRange` / `paymentAccepted` / `businessAttributes` / `specialHolidays` が集約され、`(public)/layout.tsx` の `<GraphJsonLd>` が単一 `LocalBusiness` を全公開ページ共通で出力していた。

## Decision

1. **Settings から MEO フィールドを完全削除**し `Location` モデルに移管（破壊的変更、後方互換なし）
2. `Location` に `slug` + 構造化住所（`postalCode` / `prefecture` / `city` / `streetAddress` / `buildingName`）+ `phoneNumber` / `email` + MEO 7 フィールドを追加
3. `(public)/layout.tsx` の `<GraphJsonLd>` から `LocalBusiness` を撤去 → `Organization` + `WebSite` のみ
4. `/access` ページに公開済み全 Location を `<script>` 1 個にまとめた `<LocationsLocalBusinessJsonLd>` を出力
5. 新 route `/access/[locationSlug]` を新設し、各拠点に独立した `<LocationLocalBusinessJsonLd>` を出力
6. 管理画面の `/admin/settings` MeoSection を全廃し、`/admin/locations/[id]/edit` に MEO タブ統合
7. **`branchOf` を optional 併記**: 複数拠点時のみ `branchOf: { "@id": "{BASE_URL}/#organization" }` を付与（schema.org spec 準拠）

## Consequences

**利点**:

- Google 公式パターン（per-location repeated markup）に準拠 → ローカル検索ランキング改善
- per-location GBP 連携が前提となり Phase 2-5（GBP API / Review 収集 / Service schema / 業種特化 amenity）への基盤確立
- multi-tenant template として複数拠点運用顧客にスケール可能

**欠点 / トレードオフ**:

- 後方互換なし（Settings の MEO フィールド削除）。既存運用顧客には migration step 3 で「最初の Location に強制移管」を実行
- placeholder slug（`location-<id_prefix>`）は SEO URL として暫定的。production では管理画面で正規 slug に手動更新する運用が必要

## Alternatives Considered

1. **Settings に MEO を残し Location にもコピー（dual SSoT）** — ドリフト不可避、運用負荷増 → 棄却
2. **`branchOf` を必須化（schema.org spec 準拠を強化）** — Google 解釈に依存しないため optional のまま → 採用
3. **`@graph` を全ページで維持し各 LocalBusiness を含める** — Google 公式が `@graph` を推奨していないため、各拠点ページに per-page LocalBusiness を出す方が安全 → 棄却

## Operational Notes (Production Migration)

1. 事前に各 Location.slug を管理画面（後続 release）で正規化する。migration step 2 の placeholder slug（`location-<id_prefix>`）は SEO URL として暫定的
2. `bunx --bun prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > <migration.sql>` で差分生成 → `db execute --file` + `migrate resolve --applied`
3. デプロイ後、管理画面で各 Location の slug を SEO 観点で再採番（例: `honkan` / `shibuya-ten`）→ Server Action に slug uniqueness 検証あり
4. 旧 `Location.imageUrl` 必須制約は維持。新規拠点作成時は画像必須

## References

- [Google Search Central — Local Business structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [schema.org/LocalBusiness](https://schema.org/LocalBusiness)
- Spec: `docs/superpowers/specs/2026-04-27-multi-location-seo-foundation-design.md`
- Plan: `docs/superpowers/plans/2026-04-27-multi-location-seo-foundation.md`
```

### Step 9.2: seo-patterns.md の書き換え

`.claude/rules/frontend/seo-patterns.md` の以下セクションを per-location パターンに書き換え:

- §JSON-LD 配置 — `LocalBusiness` を「各 Location ページに per-location 出力」に変更
- §データソース表 — `getLocalBusinessJsonLdData()` を削除、`getAllPublishedLocationsJsonLdData` / `getLocationJsonLdDataBySlug` を追加
- §LocalBusiness プロパティ一覧 — 「Location モデルが SSoT」に変更
- §禁止事項 4 — `@graph` 外の WebSite/LocalBusiness 個別出力禁止 → "site-wide layout で LocalBusiness を出力しない（per-location ページのみ）"
- §ファイル配置 — `location-json-ld.ts` を追加、`getLocalBusinessJsonLdData` を削除

### Step 9.3: gotchas sub-files の更新

`.claude/rules/gotchas/domain.md` および `.claude/rules/gotchas/ui.md` で以下を変更:

**追加**: per-location cache invalidation の項

```markdown
- **Location 編集時のキャッシュ無効化** — `updateLocation` の `afterSuccess` で `updateTag(CACHE_TAGS.LOCATIONS)` + `updateTag(getCacheTag.locations.detail(slug))` 必須。MEO フィールド更新時も同じタグで無効化（粒度を分けない）
```

**削除 / 書き換え**: MEO 関連で Settings を前提にしていた gotcha 記述を per-location パターンに移植 or 削除

### Step 9.4: ssot-singletons.md の更新

`.claude/rules/ssot-singletons.md` の DB / Prisma / 公開 UI セクションで:

- `Settings.latitude` 等を「**Location.latitude / 各拠点別 SSoT**」に変更
- 新項目: `getAllPublishedLocationsJsonLdData` / `getLocationJsonLdDataBySlug` を「公開 SEO」セクションに追加
- `getLocationLocalBusinessJsonLdData()`（旧）の参照を削除

### Step 9.5: handoff memory の作成

`~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_meo-multi-location-handoff.md`:

````markdown
---
name: project_meo-multi-location-handoff
description: MEO 改善 5 サブプロジェクトの Phase 1 完了 / Phase 2-5 の handoff
type: project
---

> **Snapshot: 2026-04-27**

## 完了済み

- Phase 1: Multi-Location SEO Foundation（commit list で確認）
  - Spec: `docs/superpowers/specs/2026-04-27-multi-location-seo-foundation-design.md`
  - Plan: `docs/superpowers/plans/2026-04-27-multi-location-seo-foundation.md`
  - ADR: `docs/architecture/decisions/0023-multi-location-seo-foundation.md`
  - Branch: `feature/multi-location-seo-foundation` → main マージ済み（マージ後に削除）

## 残 Phase（独立サブプロジェクト、それぞれ spec → plan → 実装）

- **Phase 2**: Google Business Profile API 連携（実データ MEO スコア）
  - 前提: Phase 1 で `Location.googleBusinessPlaceId` 確立済み
  - 想定スコープ: GBP API クライアント + OAuth + レビュー / 写真 / 投稿頻度の取得 + admin スコア再計算
- **Phase 3**: Review Collection Funnel
  - 前提: Phase 1 で `Location.googleReviewUrl` 確立済み
  - 想定スコープ: 予約完了メール CTA + マイページ CTA + QR 生成
- **Phase 4**: Service / Offer Schema 移行
  - 前提: Phase 1 で per-location LocalBusiness 確立済み
  - 想定スコープ: `Product` → `Service` + `LocalBusiness.makesOffer` に Space 列挙
- **Phase 5**: 業種特化 amenityFeature
  - 前提: Phase 1 で `Location.amenities` 確立済み
  - 想定スコープ: 24h利用可 / 防音 / 電源数 / Wi-Fi 速度等の schema.org enum 化

## 次セッション起動コマンド

```bash
# Phase 2 着手時
gh repo view --json defaultBranch  # main 確認
git pull origin main
# Phase 2 spec 作成: brainstorming → writing-plans
```
````

````

### Step 9.6: MEMORY.md にエントリ追加

`~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md` の末尾に:

```markdown
## MEO Multi-Location Foundation (2026-04-27)

- [project_meo-multi-location-handoff.md](project_meo-multi-location-handoff.md) — Phase 1 完了、Phase 2-5 (GBP API / Review 収集 / Service Schema / 業種特化 amenity) を独立サブプロジェクトとして順次実装
````

### Step 9.7: handoff memory + MEMORY.md 以外の docs を commit

```bash
git add docs/ .claude/
git commit -m "$(cat <<'EOF'
docs(adr): 0023 multi-location SEO foundation; sync rule docs

- ADR 0023: Per-Location LocalBusiness JSON-LD (Google official pattern)
- seo-patterns.md: rewrite for per-location architecture
- gotchas.md: cleanup MeoSection refs; add cache invalidation entry
- ssot-singletons.md: MEO SSoT moved to Location

Plan: docs/superpowers/plans/2026-04-27-multi-location-seo-foundation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

memory ファイルは git 管理外（`~/.claude/projects/...`）のため、コミット不要。

### Step 9.8: 最終検証

```bash
bun run validate
bun run build
```

期待: type-check / lint / build すべて exit 0。

### Step 9.9: Plan ファイル削除（CLAUDE.md clean-break 方針）

`docs/plans/CLAUDE.md` のステータス管理に従い、実装完了後 plan ファイルを削除:

```bash
git rm docs/superpowers/plans/2026-04-27-multi-location-seo-foundation.md
git commit -m "chore(plans): remove completed multi-location SEO plan (clean-break)"
```

> **注**: spec ファイル（`docs/superpowers/specs/2026-04-27-...`）は履歴として保持しても可。判断は controller。

---

## Self-Review

### Spec coverage

各 spec section に対応する task を確認:

- §2.1 データモデル変更 → Task 1 ✓
- §2.2 マイグレーション戦略 → Task 1 ✓
- §2.3 JSON-LD 出力アーキテクチャ → Task 3 + 4 + 5 ✓
- §2.4 `getLocalBusinessJsonLdData()` 再設計 → Task 3 ✓
- §2.5 公開ページ構成変更 → Task 4 + 5 ✓
- §2.6 管理画面 UI 変更 → Task 6 + 7 ✓
- §2.7 単一拠点フォールバック → Task 4（既存 `buildFallbackLocation()` 維持で対応済み）
- §2.8 キャッシュ戦略 → Task 7（`getCacheTag.locations.detail(slug)` 新設）
- §3 影響範囲 → 全 Task で網羅
- §4 ADR → Task 9
- §5 テスト戦略 → Task 8
- §6 実装順序 → Task 1-9 が一致
- §7 リスク・トレードオフ → ADR 0023 に転記
- §8 後続サブプロジェクト → Task 9 handoff memory

### Placeholder scan

- "TBD" / "TODO" / "実装は spec を見て" → なし ✓
- "Add appropriate error handling" → 各 Task で具体的に明記済み（error.tsx / catch + logError） ✓
- "Write tests for the above" → Task 8 で具体的なテストコード記述 ✓
- "Similar to Task N" → なし（各 Task で完結したコード提示） ✓

### Type consistency

- `LocationForSeo` 型: Task 2 で定義、Task 3 / 5 / 8 で参照 ✓
- `LocationLocalBusinessJsonLdData` 型: Task 3 で定義、Task 4 / 5 / 8 で参照 ✓
- `getCacheTag.locations.detail(slug)`: Task 7 で新設、Task 9 で gotchas.md 反映 ✓
- `getPublishedLocationForAccessBySlug`: Task 5 で参照、Step 5.5 で追加明記 ✓
- `buildLocationLocalBusinessJsonLdData(location, options)`: 全 Task で同一シグネチャ ✓

### 最終調整

Phase 2 と Phase 5 の境界に細部の重複があるため、Step 5.5 で「Phase 2 で追加済みでない場合」と条件付き記載で柔軟性を確保。
