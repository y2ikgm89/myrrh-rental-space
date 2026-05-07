# location-list Section Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/access` ページの拠点章 / アンカーナビ / 代表お問い合わせ / Maps / 営業時間 / 駐車場 / 設備 をハードコードから抽出し、`location-list` セクションタイプとして CMS で編集可能にする破壊的クリーン実装。

**Architecture:**

- Dynamic Section Architecture（`field-registry` + `sectionLayoutSchema` + `SectionRenderer` switch dispatch）に準拠
- `LocationChapter` / `LocationsOverview` / `AccessGlobalInfo` の責務を 1 つの `LocationListSection` 公開コンポーネントに統合
- 全拠点 / 特定拠点（slug 配列）両対応、`overviewNav` / `globalContact` / `chapterLayout` を config トグル
- `/access/page.tsx` は `getPageSectionsWithFallback("access") → SectionRenderer.map` の純粋 DB 駆動に書き換え（CTA ハードコード + `cta` フィルタ削除）
- per-location LocalBusiness JSON-LD はページレベルで固定出力（SEO 退行防止 = γ）

**Tech Stack:** Zod 4 / `field-registry` / Next.js 16 PPR / `'use cache'` / `executeAdminMutationResult` 不変

**Implementation strategy:** 2 commit（中間 type-check broken を許容）。Chunk A = Foundation + Section Definition、Chunk B = Component + Page Rewrite + Cleanup + Seed + Test。1 implementer に bundle dispatch。

---

## File Structure

### Create

- `src/shared/lib/sections/definitions/location-list/schema.ts` — Zod config schema + `LocationListConfig` 型
- `src/shared/lib/sections/definitions/location-list/metadata.ts` — `SectionMetadata` (label / description / icon / category)
- `src/app/(public)/_components/LocationListSection.tsx` — 公開コンポーネント（旧 `LocationChapter` / `LocationsOverview` / `AccessGlobalInfo` の責務統合）

### Modify

- `src/shared/lib/sections/field-registry.ts:26` — `DynamicSelectSource` に `"locations"` 追加
- `src/shared/lib/validations/section.ts` — `SectionType` const に `LOCATION_LIST: "location-list"` 追加 + 関連配列
- `src/shared/lib/validations/section-defaults.ts` — `getLocationListConfig` getter + `getSafeConfig` overload
- `src/shared/domain/section-styles/types.ts:131-132` 周辺 — `SECTION_TYPE_STYLES` に `"location-list": HERO_ADJACENT_STYLE` 追加
- `src/shared/lib/sections/registry.ts:8` — import 追加 + `definitions` object に登録 + コメントの `23` を `24` に
- `src/app/(public)/_shared/components/sections/section-renderer.tsx` — `case SectionType.LOCATION_LIST` 追加
- `src/app/(public)/access/page.tsx` — 全 DB 駆動に書き直し（CTA ハードコード + `cta` フィルタ + AccessOverview/AccessChapters/AccessGlobalInfo 呼び出し全削除）
- `src/shared/domain/locations/public-queries.ts:100-151` — `getPublishedLocationsForAccess` に optional `slugs?: readonly string[]` 引数追加（cache key 反映）
- `src/shared/lib/constants/default-page-sections.ts:259-272` — access entry を `[hero(minimal), location-list, cta]` に拡張
- `prisma/seed.ts` — access Page seed の sections に `location-list` 追加（既存パターンに従う）
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx` — `dynamicOptions["locations"]` 受領 + AutoSelectField への配線
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx` — `getActiveLocations()` 呼び出し + `dynamicOptions={{ locations: ... }}` props 経由渡し
- `__tests__/unit/domain/sections/registry.test.ts:51` — `toHaveLength(23)` → `24`、カテゴリ分布期待値も更新

### Delete

- `src/app/(public)/access/_components/access-global-info.tsx`
- `src/app/(public)/access/_components/locations-overview.tsx`
- `src/app/(public)/access/_components/location-chapter.tsx`
- `src/app/(public)/access/_components/access-map.tsx` — `LocationListSection` から参照するため `src/app/(public)/_components/` 配下に移動（rename）

---

## Task 1 (Chunk A): Foundation type additions + Section Definition + Registry registration

**Files (Create):**

- `src/shared/lib/sections/definitions/location-list/schema.ts`
- `src/shared/lib/sections/definitions/location-list/metadata.ts`

**Files (Modify):**

- `src/shared/lib/sections/field-registry.ts`
- `src/shared/lib/validations/section.ts`
- `src/shared/lib/validations/section-defaults.ts`
- `src/shared/domain/section-styles/types.ts`
- `src/shared/lib/sections/registry.ts`
- `__tests__/unit/domain/sections/registry.test.ts`

### Step 1.1: `field-registry.ts` の `DynamicSelectSource` 拡張

**File:** `src/shared/lib/sections/field-registry.ts:26`

```typescript
export type DynamicSelectSource =
  | "postCategories"
  | "faqCategories"
  | "locations";
```

これだけで Zod schema 側で `field.dynamicSelect({ source: "locations" })` が型チェックを通るようになる。AutoSectionForm 側の `dynamicOptions` 受領は Task 1.10 で対応。

### Step 1.2: `SectionType` に `LOCATION_LIST` 追加

**File:** `src/shared/lib/validations/section.ts`

`SectionType` const object に `LOCATION_LIST: "location-list"` を追加。`SECTION_TYPES` 配列、`SectionType` type alias、関連 narrowing helper があれば全て同期。

実装前に該当ファイル全体を Read して既存パターン（`HERO_PARALLAX` / `CONCEPT` 等）と完全に同形で追加する。1 行追加のみで type 派生が連動する設計なら他箇所更新不要。

### Step 1.3: `LocationListConfig` schema 定義

**File:** `src/shared/lib/sections/definitions/location-list/schema.ts` (Create)

参照: `src/shared/lib/sections/definitions/map/schema.ts` のパターン

```typescript
import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const chapterLayouts = ["alternating", "stacked"] as const;
const locationModes = ["all", "selected"] as const;

export const locationListConfigSchema = z.object({
  // セクション見出し（Section共通: 上部の eyebrow + heading）
  sectionLabel: field.text("セクションラベル", {
    default: "Locations",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.text("セクション見出し", {
    default: "全拠点のご案内",
    maxLength: 100,
    subGroup: "text",
  }),

  // 拠点選択
  mode: field.select("表示拠点", {
    options: locationModes,
    default: "all",
    helpText: "all=公開中の全拠点 / selected=指定 slug のみ",
    group: "content",
  }),
  locationSlugs: field.array("表示する拠点 slug（mode=selected 時のみ有効）", {
    fields: { slug: z.string().min(1).max(100) },
    helpText: "Location 管理で発行された slug を順序通りに指定",
    group: "content",
  }),

  // Overview anchor ナビ
  overviewNavEnabled: field.boolean("拠点アンカーナビを表示", {
    default: true,
    helpText: "ページ内で拠点へジャンプする目次（拠点 2 件以上で意味あり）",
    group: "design",
  }),
  overviewHeadline: field.text("ナビ見出し（省略可）", {
    default: "",
    maxLength: 100,
    helpText: "未指定時は拠点数に応じて自動生成",
    subGroup: "text",
  }),

  // 代表連絡先（旧 AccessGlobalInfo）
  globalContactEnabled: field.boolean("代表お問い合わせを表示", {
    default: true,
    helpText: "Settings の電話 / メールを章の上に表示",
    group: "design",
  }),
  globalContactHeadline: field.text("代表お問い合わせ見出し", {
    default: "代表お問い合わせ",
    maxLength: 100,
    subGroup: "text",
  }),

  // 章レイアウト
  chapterLayout: field.select("章レイアウト", {
    options: chapterLayouts,
    default: "alternating",
    helpText: "alternating=現行の縦型 Editorial / stacked=画像上部固定",
    group: "design",
  }),

  layout: sectionLayoutSchema,
});

export type LocationListConfig = z.infer<typeof locationListConfigSchema>;
```

**注意:** `field.array` の `fields` プロパティは `Record<string, ZodType>`。`slug` を直接 `z.string()` で渡す（`field.text` は `.register()` 副作用があるため inner field に向かない）。

### Step 1.4: metadata 定義

**File:** `src/shared/lib/sections/definitions/location-list/metadata.ts` (Create)

```typescript
import type { SectionMetadata } from "../../types";

export const locationListMetadata: SectionMetadata = {
  label: "拠点一覧",
  description:
    "公開中の拠点を縦型 Editorial 章として表示します（営業時間・駐車場・設備・地図含む）",
  icon: "IconMapPinFilled",
  category: "list",
};
```

### Step 1.5: `section-defaults.ts` に getter 追加

**File:** `src/shared/lib/validations/section-defaults.ts`

事前に Read して既存 `getMapConfig` / `getInstagramConfig` のパターンを確認。`getLocationListConfig(section.config): LocationListConfig` を `locationListConfigSchema.safeParse` 経由で実装。`getSafeConfig` overload にも `"location-list"` 追加。`getDefaultSectionConfig` switch にも追加。

### Step 1.6: `section-styles/types.ts` に entry 追加

**File:** `src/shared/domain/section-styles/types.ts:131-132` 付近

`SECTION_TYPE_STYLES` Record に追加:

```typescript
"location-list": HERO_ADJACENT_STYLE,
```

`map` / `space-list` 等と同じ `HERO_ADJACENT_STYLE` を採用（`SectionWrapper` で標準 padding 適用）。

### Step 1.7: registry.ts に登録

**File:** `src/shared/lib/sections/registry.ts`

- L8 周辺の import 群に追加:

```typescript
import { locationListConfigSchema } from "./definitions/location-list/schema";
import { locationListMetadata } from "./definitions/location-list/metadata";
```

- L62 の `definitions` object に追加（既存エントリと同形式）:

```typescript
"location-list": {
  type: "location-list",
  configSchema: locationListConfigSchema,
  metadata: locationListMetadata,
},
```

- L3 / L61 のコメント `全 21` / `全 23` を `全 24` に更新。

### Step 1.8: registry test の数値更新

**File:** `__tests__/unit/domain/sections/registry.test.ts`

事前に該当ファイル全体を Read。`toHaveLength(23)` を `toHaveLength(24)` に変更（L51 + 他出現箇所全て）。`getSectionDefinitionsByCategory` のカテゴリ分布期待値で `list` カウントが +1 になる箇所も同期。

### Step 1.9: 中間検証

```bash
bun run type-check
```

期待: 通る（schema / metadata / registry / section-defaults / styles 全部揃った時点で型整合）。

不通なら `getSafeConfig` overload / `getDefaultSectionConfig` switch / `SECTION_TYPE_STYLES` Record いずれかの欠落 → ファイル全体を再 Read して修正。

### Step 1.10: registry test 単体実行

```bash
bun test __tests__/unit/domain/sections/registry.test.ts
```

期待: PASS（24 件、location-list が `list` カテゴリに含まれる）。

### Step 1.11: Commit (Chunk A)

```bash
git add src/shared/lib/sections/field-registry.ts \
         src/shared/lib/sections/definitions/location-list/ \
         src/shared/lib/sections/registry.ts \
         src/shared/lib/validations/section.ts \
         src/shared/lib/validations/section-defaults.ts \
         src/shared/domain/section-styles/types.ts \
         __tests__/unit/domain/sections/registry.test.ts
git commit -m "feat(sections): add location-list section type definition

公開拠点を縦型 Editorial 章として表示する新セクションタイプを追加。
config: mode (all/selected) / locationSlugs / overviewNav / globalContact / chapterLayout。
DynamicSelectSource に \"locations\" を追加（AutoSectionForm 配線は次コミット）。
セクション総数 23 → 24。"
```

---

## Task 2 (Chunk B): Component + Page rewrite + Cleanup + Seed + Tests

**Files (Create):**

- `src/app/(public)/_components/LocationListSection.tsx`
- `src/app/(public)/_components/access-map.tsx` (rename from `access/_components/access-map.tsx`)

**Files (Modify):**

- `src/shared/domain/locations/public-queries.ts`
- `src/app/(public)/_shared/components/sections/section-renderer.tsx`
- `src/app/(public)/access/page.tsx`
- `src/shared/lib/constants/default-page-sections.ts`
- `prisma/seed.ts`
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx`

**Files (Delete):**

- `src/app/(public)/access/_components/access-global-info.tsx`
- `src/app/(public)/access/_components/locations-overview.tsx`
- `src/app/(public)/access/_components/location-chapter.tsx`
- `src/app/(public)/access/_components/access-map.tsx` (after rename)

### Step 2.1: `getPublishedLocationsForAccess` に slugs 引数追加

**File:** `src/shared/domain/locations/public-queries.ts:100-151`

```typescript
export async function getPublishedLocationsForAccess(
  slugs?: readonly string[],
): Promise<LocationForAccess[]> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.LOCATIONS);

  const locations = await safeFetch({
    fetch: () =>
      prisma.location.findMany({
        where: {
          isPublished: true,
          isActive: true,
          ...(slugs && slugs.length > 0 && { slug: { in: [...slugs] } }),
        },
        orderBy: { sortOrder: "asc" },
        select: {
          /* 既存通り */
        },
      }),
    /* ... */
  });

  // 既存の toPlainArray + accessLines parse はそのまま
}
```

`'use cache'` の引数依存は Next.js 16 が自動キー化するため追加対応不要。`slugs` は `readonly string[]` で React serialization 通る。

selected mode で sortOrder ではなく指定順に並べたい場合は呼び出し側で順序整列する（`config.locationSlugs.map(s => locations.find(l => l.slug === s)).filter(Boolean)`）。

### Step 2.2: `access-map.tsx` の移動

```bash
git mv src/app/\(public\)/access/_components/access-map.tsx src/app/\(public\)/_components/access-map.tsx
```

import パスは Step 2.3 で更新。

### Step 2.3: `LocationListSection.tsx` の作成

**File:** `src/app/(public)/_components/LocationListSection.tsx` (Create)

旧 `location-chapter.tsx` / `locations-overview.tsx` / `access-global-info.tsx` の **全ロジックを完全移植**:

- `parseBusinessHoursForDisplay()` (旧 location-chapter.tsx:78-146)
- `parseAmenitiesEntries()` (旧 location-chapter.tsx:45-50)
- `ATTR_ICONS` Record (旧 location-chapter.tsx:34-43)
- `DAY_ORDER` / `DAY_ABBREV` 定数
- 拠点章描画 JSX 全体（hero image / Address+Routes pair / Hours / Parking+Amenities pair / Map iframe）
- Overview anchor nav（旧 LocationsOverview）
- Global Info（旧 AccessGlobalInfo の Contact dl）

**Props:**

```typescript
interface LocationListSectionProps {
  readonly config: LocationListConfig;
  readonly locations: readonly LocationForAccess[];
  readonly businessInfo: {
    phone: string | null;
    email: string | null;
    name: string;
  };
  readonly style: SectionStylePayload;
}
```

`locations` と `businessInfo` は `SectionRenderer` で fetch して props で渡す（Server Component 階層）。

**動作:**

1. `config.mode === "selected"` の場合は `locations` を `config.locationSlugs` 順で並べ替え（`SectionRenderer` 側で fetch 時に slug 渡し済み）
2. 拠点 0 件で `config.mode === "all"` のときは `buildFallbackLocation()` 相当を `businessInfo` から内部合成（旧 page.tsx:43-73）
3. `config.overviewNavEnabled && enriched.length > 0` で Overview ブロック描画
4. `config.globalContactEnabled && (businessInfo.phone || businessInfo.email)` で代表連絡先ブロック描画
5. 各拠点の `LocationChapter` 内容を inline 描画（separate 子コンポーネントに分割するなら同ファイル内に private function として）

`SectionWrapper` でラップしない（`SectionRenderer` 側で wrap）。`section.title` を `config.title` で代用しても良いが既存 SectionRenderer がどう扱うかは section-renderer.tsx 既存パターン参照。

### Step 2.4: `SectionRenderer` 拡張

**File:** `src/app/(public)/_shared/components/sections/section-renderer.tsx`

import 追加:

```typescript
import { LocationListSection } from "../../../_components/LocationListSection";
import { getPublishedLocationsForAccess } from "@/shared/domain/locations/public-queries";
import { getBusinessInfo } from "@/public/data/business";
import { getLocationListConfig } from "@/shared/lib/validations/section-defaults";
```

switch case 追加（`SectionType.MAP` の case 直後あたり）:

```typescript
case SectionType.LOCATION_LIST: {
  const config = getLocationListConfig(section.config);
  const slugs = config.mode === "selected"
    ? config.locationSlugs.map((item) => item.slug)
    : undefined;
  const [locations, info] = await Promise.all([
    getPublishedLocationsForAccess(slugs),
    getBusinessInfo(),
  ]);
  return (
    <LocationListSection
      config={config}
      locations={locations}
      businessInfo={{
        phone: info.phone ?? null,
        email: info.email ?? null,
        name: info.name,
      }}
      style={resolved}
    />
  );
}
```

### Step 2.5: `/access/page.tsx` 全 DB 駆動書き換え

**File:** `src/app/(public)/access/page.tsx`

完全書き直し。新内容:

```typescript
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { getAllPublishedLocationsJsonLdData } from "@/public/lib/seo";
import { LocationsLocalBusinessJsonLd } from "@/public/components/seo/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("access");
}

async function AccessChaptersJsonLd(): Promise<ReactElement | null> {
  const locations = await getAllPublishedLocationsJsonLdData();
  return <LocationsLocalBusinessJsonLd locations={locations} />;
}

export default async function AccessPage(): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("access");
  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) => s !== heroSection && s.type !== "hero" && s.type !== "hero-parallax",
  );

  return (
    <PageLayout
      variant="content"
      hero={heroSection ? <SectionRenderer section={heroSection} /> : undefined}
    >
      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      <Suspense fallback={null}>
        <AccessChaptersJsonLd />
      </Suspense>
    </PageLayout>
  );
}
```

**確認ポイント:**

- `PageLayout` の `cta` prop **削除**（編集ページで `cta` セクションを追加することで代用）
- `s.type !== "cta"` フィルタ **削除**（cta セクションを trailing で描画）
- `AccessOverview` / `AccessChapters` / `AccessGlobalInfo` 呼び出し **全削除**
- per-location LocalBusiness JSON-LD は `Suspense` で保持（γ 採用、SEO 退行防止）
- import 文整理（不要 import 全削除）

### Step 2.6: 旧 access components 削除

```bash
git rm src/app/\(public\)/access/_components/access-global-info.tsx
git rm src/app/\(public\)/access/_components/locations-overview.tsx
git rm src/app/\(public\)/access/_components/location-chapter.tsx
```

`access-map.tsx` は Step 2.2 で `_components/` に移動済み。`access/_components/` ディレクトリが空になる場合は Windows MINGW64 の `()` パス制約のため `python3 -c "import shutil; shutil.rmtree(r'src/app/(public)/access/_components')"` で削除。

### Step 2.7: `default-page-sections.ts` 更新

**File:** `src/shared/lib/constants/default-page-sections.ts:259-272`

`access` entry を以下に置き換え:

```typescript
access: [
  {
    type: "hero",
    title: null,
    config: {
      title: "Access",
      subtitle: "最寄り駅・駐車場・営業時間をご案内します。",
      variant: "minimal",
    },
    content: null,
    order: 0,
    isActive: true,
  },
  {
    type: "location-list",
    title: null,
    config: {
      sectionLabel: "Locations",
      title: "全拠点のご案内",
      mode: "all",
      locationSlugs: [],
      overviewNavEnabled: true,
      overviewHeadline: "",
      globalContactEnabled: true,
      globalContactHeadline: "代表お問い合わせ",
      chapterLayout: "alternating",
    },
    content: null,
    order: 1,
    isActive: true,
  },
  {
    type: "cta",
    title: null,
    config: {
      title: "ご不明な点はお気軽にどうぞ",
      buttons: [{ text: "お問い合わせ", url: "/contact", variant: "primary" }],
    },
    content: null,
    order: 2,
    isActive: true,
  },
],
```

`cta` セクション config の正確な形は `definitions/cta/schema.ts` を Read して合わせる（フィールド名差分があれば修正）。

### Step 2.8: seed の access page 更新

**File:** `prisma/seed.ts`

access Page seed の section 配列を `default-page-sections.ts` の `access` と完全一致させる（既存パターンが seed 側で別途定義しているなら同期、`DEFAULT_PAGE_SECTIONS` 経由なら自動反映）。

事前に該当箇所を Grep `grep -n 'access' prisma/seed.ts` で特定し、現状の hero 1 個 seed を 3 個に拡張。idempotent な upsert を維持。

### Step 2.9: AutoSectionForm に `dynamicOptions["locations"]` 配線

**File:** `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`

事前に該当ファイルの `dynamicOptions` prop 型と `AutoSelectField` への受け渡しパターンを Read。`postCategories` / `faqCategories` と同形で `locations` を追加。

`locationSlugs` フィールドは `field.array` で配列のため `field.dynamicSelect` の単一 select とは異なる UI が必要。**最小実装:** `field.array` のまま進め、各 inner `slug` の input は素朴な text input になる（dynamicSelect のドロップダウンにしたい場合は次フェーズ）。

ユーザー UX を優先するなら `dynamicMultiSelect` ヘルパーを field-registry に新設して `locationSlugs` を `string[]` 直接の multi-select にする — ただし scope 拡大のため本 plan では `field.array(slug: z.string())` で進める。

### Step 2.10: pages edit page で getActiveLocations 配線

**File:** `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx`

事前に該当ファイルの `dynamicOptions` 構築箇所を Read（postCategories / faqCategories の取得パターン）。`getActiveLocations()` を import + 呼び出し + `dynamicOptions={{ ..., locations: locations.map(l => ({ value: l.id, label: l.name })) }}` で渡す。

`field.dynamicSelect({ source: "locations" })` は今 plan の `locationSlugs` 内 inner slug field では使っていないので、配線は将来用意（実害なし）。**configSchema 内で他に `dynamicSelect({ source: "locations" })` を使うフィールドが無い場合、Step 2.9 / 2.10 は no-op で skip 可** — Step 1.1 の type 拡張のみで残す。

実際にこの plan の `locationListConfigSchema` は `dynamicSelect` を使っていないため、**Step 2.9 / 2.10 はスキップ可能**。Step 1.1 の `DynamicSelectSource` 拡張は将来の `dynamicMultiSelect` ヘルパー追加時のための先行投資として残す。

### Step 2.11: 検証

```bash
bun run validate
```

期待: PASS。

主要 type-check 観点:

- `LocationListSection` の props 型が `LocationListConfig` と整合
- `SectionRenderer` switch case の `SectionType.LOCATION_LIST` が string literal と一致
- `getPublishedLocationsForAccess(slugs?)` の signature が呼び出し側と整合
- `default-page-sections.ts` の access entry config が `locationListConfigSchema.safeParse` を通る型

```bash
bun run build
```

期待: PASS。Next.js typegen が PageContent / Section の追加を拾う。

### Step 2.12: 手動 dev 確認

```bash
bun dev
```

公開ページ確認:

1. `/access` を開く → 拠点章が描画される（mode=all デフォルト）
2. 拠点 anchor link `/access#<slug>` のスクロール offset が正しい
3. per-location LocalBusiness JSON-LD が `<script type="application/ld+json">` で出力される（DevTools Elements 検索）
4. CTA セクションがフッター手前に描画される

管理画面確認: 5. `/admin/pages/access/edit` で 3 つのセクション（hero / location-list / cta）が表示される 6. location-list セクションを開くと config フィールド全部が AutoSectionForm で render される 7. `mode` を `selected` に変更して `locationSlugs` を 1 件追加 → 保存 → 公開ページで該当拠点のみ表示 8. `globalContactEnabled` を OFF → 公開ページで代表連絡先ブロック消失 9. CTA セクションを削除 → 公開ページの末尾 CTA が消える

### Step 2.13: Commit (Chunk B)

```bash
git add -A   # 削除/移動を含むため明示的に確認
git status   # 予期せぬ並行 WIP 混入が無いか確認
git diff --cached --stat
git commit -m "refactor(access): rewrite /access page using location-list section

旧 LocationChapter / LocationsOverview / AccessGlobalInfo を
LocationListSection 公開コンポーネントに統合し、/access ページを
全 DB セクション駆動に書き直し。CTA ハードコードと cta フィルタを削除し、
編集ページから順序・有無を制御可能に。per-location LocalBusiness
JSON-LD はページレベルで固定出力（SEO 退行防止）。
default-page-sections と access seed も同期。"
```

---

## Self-Review Checklist

実装後に以下を確認:

1. **Spec coverage:**
   - [ ] α: 代表連絡先が `location-list` の `globalContactEnabled` トグルで制御可能
   - [ ] page-agnostic: `location-list` は他ページでも追加可能（access 専用名にしていない）
   - [ ] γ: per-location LocalBusiness JSON-LD は page.tsx で固定出力

2. **Placeholder scan:** "TBD" / "TODO" / "implement later" が plan / 実装にないこと

3. **Type consistency:**
   - [ ] `LocationListConfig` は schema / component props / SectionRenderer で同名で参照
   - [ ] `getPublishedLocationsForAccess(slugs?)` の signature が SectionRenderer の呼び出しと一致
   - [ ] `SectionType.LOCATION_LIST` の string value が `"location-list"`（registry / SECTION_TYPE_STYLES / default-page-sections と全部同じ）

4. **破壊的変更の網羅:**
   - [ ] 旧 3 components 削除済み（grep `LocationChapter\|LocationsOverview\|AccessGlobalInfo` でゼロヒット）
   - [ ] `/access/page.tsx` から hardcoded CTA / `s.type !== "cta"` フィルタ消滅
   - [ ] `default-page-sections.ts` の access entry が hero + location-list + cta の 3 セクション

5. **Cache invalidation:**
   - [ ] Location 編集時に既存の `updateTag(CACHE_TAGS.LOCATIONS)` が `getPublishedLocationsForAccess(slugs)` の cache key を invalidate（Next.js 16 は `'use cache'` 関数の引数を含めて自動キー化、`cacheTag` 一致で全 variant 失効）

---

## Execution Handoff

**1. Subagent-Driven (recommended)** — 2 chunk dispatch、各 chunk 後に独立検証 (`git log` + `git show --stat` + `bun run validate`)。implementer は sonnet 以上。git commit は implementer 側で完結（中間 type-check 失敗を Chunk A で許容するため bundle dispatch にしないなら、Chunk A は **commit 禁止** + controller が Chunk A+B 完了後にまとめて 2 commit を作る方が安全）。

**2. Inline Execution** — 本セッションで `executing-plans` skill 経由で実行（context 残量次第）。
