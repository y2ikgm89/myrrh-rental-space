# Section Architecture Phase B — Style Cascade + Library（Sanity Style Object パターン）

**日付**: 2026-04-22
**種別**: 破壊的変更（後方互換なし）
**ステータス**: 設計中（Phase A 完了が前提）
**依存**: `2026-04-22-section-architecture-phase-a.md` 完了必須
**所要見込み**: 5 営業日 (1 週)
**ブランチ戦略**: `feature/section-arch-phase-b` worktree、5 commit 構成

---

## 概要

`Section.config`（内容）と `Section.design`（見た目）の混在を解消し、見た目を独立した `SectionStyle` テーブルに切り出す。Style は再利用可能な preset として複数 page / section から参照され、4 段 cascade（Hardcoded fallback → Theme default → Page-level → Section preset → Section instance override）で解決される。Sanity Studio の object reference / Webflow Class System / WordPress Block Style Variations を参考にした業界標準 CMS パターンに準拠。

---

## 背景・目的

### Phase A 完了後の残課題

Phase A により全 section が `SectionWrapper` 経由となり管理画面 design 制御が有効化されたが、以下の課題が残る:

1. **同じデザインの繰り返し定義** — 「Editorial Hero スタイル」を全 page で使いたい場合、各 Section レコードに同じ `design` JSON を毎回書く必要がある（DRY 違反）
2. **デザイン変更の波及困難** — 「全 page の section を一括で paddingTop xl に変更」したい場合、全 Section レコードを個別更新する必要がある
3. **A/B テスト・variant 比較困難** — 「同じ内容で見た目だけ別 Style」のテストが Section レコード複製を要する
4. **マルチサイト・複数ブランド非対応** — テナントごとに「ブランド A の Editorial Hero」「ブランド B の Minimal Hero」を切り替える機能なし

### 目標

- `SectionStyle` を独立 entity として版管理
- 4 段 cascade で Style 解決（specificity 低 → 高: Theme → Page → Section preset → Section override）
- Style Library 管理画面（`/admin/styles`）で CRUD 可能
- Section 編集画面で「Style 選択 + override panel」UX
- 既存 `Section.design` JSON データを SectionStyle テーブルに自動移行 + 重複統合

---

## 公式準拠の根拠（一次資料・取得 2026-04-22）

各引用は context7 query-docs / WebFetch / WebSearch で本日（2026-04-22）取得した一次資料に基づく。出典 URL と該当部分の要約引用を併記。

| 出典 / バージョン                         | URL / 取得方法                                                                                                                     | 該当部分の要約引用                                                                                                                                                                                                                               | 計画書での採用箇所                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **WordPress Gutenberg theme.json (v3)**   | `context7: /wordpress/gutenberg` + `https://developer.wordpress.org/block-editor/how-to-guides/themes/global-settings-and-styles/` | "**3-tier override structure**: ① Core Defaults → ② Theme Layer (theme.json) → ③ User Customization. Block style variations: `is-style-{slug}` CSS class with `styles.blocks.{block}.variations.{slug}`"                                         | AD-2（4 段 cascade resolver: Hardcoded → Global Style → Page Style → Section Style → Section override）、AD-1（SectionStyle.slug 採用） |
| **WordPress block.json supports.spacing** | `https://developer.wordpress.org/block-editor/reference-guides/block-api/block-supports/`                                          | "`supports: { spacing: { margin: true \| string[], padding: true \| string[], blockGap: true \| string[] } }`. A spacing property may support arbitrary individual sides OR axial sides, but not a mix"                                          | AD-1（SectionStyle.spacing JSON schema 設計、`{ paddingTop, paddingBottom }` axial 採用）                                               |
| **WordPress theme.json spacingScale**     | 同上 + Gutenberg llms.txt                                                                                                          | "`settings.spacing.spacingScale: { operator, increment, steps, mediumStep, unit }` でプログラム的に spacing スケール生成。または `spacingSizes: [{ slug, size, name }]` で手動定義"                                                              | seed preset 5 件の slug / size / name フィールド設計の参考                                                                              |
| **Sanity Studio v3+**                     | `context7: /sanity-io/sanity` + `https://www.sanity.io/docs/object-type`                                                           | "Object types define custom data structures but cannot exist as standalone documents. **Document types: top-level content with ID + revision + timestamps**. Inline embedding は object 型の primary パターン、reference は別 document への参照" | AD-1（SectionStyle = document type 相当の独立テーブル + Section が FK reference）                                                       |
| **Sanity 業界主流（2025）**               | `https://robotostudio.com/blog/the-only-sanity-page-builder-guide-youll-ever-need` (WebSearch)                                     | "**For most page builders, go with inline objects**, which matches your 'instance of a component' mental model from relational databases - each time you add a hero to a page, you're creating a new instance with its own data"                 | 業界主流は inline object（embed）。本プロジェクトの reference 採用は **Style 再利用** の要件から正当化                                  |
| **Strapi v5 Components vs Dynamic Zones** | `https://strapi.io/blog/building-a-page-builder-via-content-modeling-best-practices-in-strapi5` (WebSearch)                        | "**Components**: 構造化フィールドの再利用（Address, SEO, Link）→ 複数 content type で再利用するなら component / **Dynamic Zones**: editor が異なる section type を選択"                                                                          | Style = "Component 相当の再利用 entity" として位置づけ。Section.styleOverride = Strapi 的「Component instance customization」           |
| **Tailwind CSS 4.x**                      | `context7: /tailwindlabs/tailwindcss.com` (Phase A 引用継続)                                                                       | Container queries 公式推奨 / `--container-*` token                                                                                                                                                                                               | Style.container.maxWidth の値設計                                                                                                       |
| **Next.js 16.x**                          | `context7: /vercel/next.js` (Phase A 引用継続)                                                                                     | RSC composition pattern + serializable props                                                                                                                                                                                                     | Style cascade resolver を Server Component で実行（client bundle 不要）                                                                 |
| **Adrian Roselli accessibility 警告**     | `https://utopia.fyi/blog/clamp/` 末尾                                                                                              | "clamp can negatively interact with browser text zoom settings, requiring thorough accessibility testing before production deployment"                                                                                                           | Style preset の preview 画面で zoom 200% / 400% 検証チェックリスト                                                                      |

### バージョン明記

- WordPress Gutenberg: trunk (2025-2026 リリース)、theme.json schema v3
- Sanity Studio: v3 / v4 共通（schema 定義 API は v3 以降安定）
- Strapi: v5 系（2025）
- Tailwind CSS: 4.2 系（`package.json`）
- Next.js: 16.2 系（`package.json`）

---

## 業界実装パターン比較（Style cascade の取り扱い）

| CMS / Framework                    | Style cascade の構造                                                                                                                     | 採用カラム/フィールド                                                                              | 出典                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **WordPress theme.json**           | 3 階層: Core Defaults → theme.json → User Customization                                                                                  | `theme.json.styles.blocks.{block}.variations.{slug}`                                               | 公式 docs                                  |
| **Sanity**                         | document reference / inline embed の 2 通り。cascade は schema 設計依存                                                                  | object type vs reference field                                                                     | 公式 docs                                  |
| **Strapi**                         | Component / Dynamic Zone Component instance                                                                                              | Component 内 fields に design 系を埋め込む                                                         | 公式 blog                                  |
| **Webflow Class System**           | Cascade (parent class → child class) + Combo Class で variant override                                                                   | Class hierarchy（DOM 階層から自動推論）                                                            | 業界知識（公式 docs 取得失敗、要追加調査） |
| **Material Design Tokens**         | Reference → System → Component の 3 階層                                                                                                 | Token alias chain                                                                                  | Material Design 公式                       |
| **本プロジェクト（Phase B 採用）** | **4 段 cascade**: Hardcoded fallback → Global SectionStyle → Page SectionStyle → Section SectionStyle preset → Section instance override | `Settings.globalSectionStyleId` / `Page.pageStyleId` / `Section.styleId` / `Section.styleOverride` | 下記 AD-2 で詳述                           |

### 本プロジェクトが 4 段 cascade を採用する理由

WordPress の 3 階層 cascade（Core → Theme → User）に **Section instance override** を加えた 4 段とする:

1. **Hardcoded fallback** = WordPress の "Core Defaults" 相当（コードで保証、DB 障害時のフォールバック）
2. **Global SectionStyle** (`Settings.globalSectionStyleId`) = WordPress の "theme.json" 相当（テナント/サイト全体の default）
3. **Page SectionStyle** (`Page.pageStyleId`) = WordPress にはない中間階層（**本プロジェクト独自**、ページ単位の design 統一に必要）
4. **Section preset** (`Section.styleId`) = WordPress の "Block Style Variations" 相当（再利用可能な Style preset）
5. **Section instance override** (`Section.styleOverride`) = WordPress の "User Customization" 相当（個別 instance 微調整）

→ Page 階層を加えた **4 段 cascade** は WordPress + Sanity のハイブリッド。**ADR `0017-section-style-cascade.md` で本選択を Architecture Decision として記録**。

---

## アーキテクチャ決定事項

### AD-1: SectionStyle 独立テーブル

```prisma
model SectionStyle {
  id          String   @id @default(cuid()) @db.VarChar(30)
  name        String   @unique @db.VarChar(100)         // "Editorial Hero" 等
  description String?  @db.Text
  scope       String   @db.VarChar(32)                  // "global" | "page" | "section"

  // Style payload (現 Section.design 相当を分割)
  spacing     Json                                       // { paddingTop, paddingBottom }
  background  Json                                       // { type, value, overlayOpacity, imageUrl }
  container   Json                                       // { maxWidth }
  typography  Json                                       // { titleSize, titleColor, textColor, textAlign }
  animation   Json                                       // { preset }
  customClass String?  @db.VarChar(200)

  // Section type 制限（このスタイルが使える section type の whitelist）
  applicableTypes String[] @db.VarChar(64)               // ["hero-parallax", "spaces-list"]

  // 版管理
  version     Int      @default(1)
  parentId    String?  @db.VarChar(30)                   // Style 派生
  parent      SectionStyle? @relation("StyleDerivation", fields: [parentId], references: [id])
  derived     SectionStyle[] @relation("StyleDerivation")

  // 監査
  createdById String?  @db.Uuid
  updatedById String?  @db.Uuid
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?                                  // ソフトデリート

  // Reverse relations
  sections        Section[]
  pagesAsDefault  Page[]    @relation("PageDefaultStyle")
  settingsGlobal  Settings? @relation("SettingsGlobalStyle")

  @@index([scope])
  @@index([applicableTypes])
  @@index([deletedAt])
}

model Section {
  id            String  @id
  pageId        String
  type          String  @db.VarChar(64)
  config        Json                                      // 内容のみ
  // 旧 design Json 削除 → styleId + override に置換
  styleId       String? @db.VarChar(30)                   // FK to SectionStyle
  styleOverride Json?                                     // Webflow Combo Class 相当
  order         Int

  style         SectionStyle? @relation(fields: [styleId], references: [id], onDelete: SetNull)

  @@index([styleId])
}

model Page {
  id            String  @id
  // ... existing
  pageHero      Json?                                     // Phase A で追加済み
  pageStyleId   String? @db.VarChar(30)                   // Page-level cascade
  pageStyle     SectionStyle? @relation("PageDefaultStyle", fields: [pageStyleId], references: [id], onDelete: SetNull)
}

model Settings {
  // ... existing
  globalSectionStyleId String? @db.VarChar(30)
  globalSectionStyle   SectionStyle? @relation("SettingsGlobalStyle", fields: [globalSectionStyleId], references: [id], onDelete: SetNull)
}
```

### AD-2: 4 段 Cascade 解決ロジック（Domain 層）

```typescript
// src/shared/domain/sections/style-resolver.ts
import type {
  Section,
  Page,
  Settings,
  SectionStyle,
} from "@/generated/prisma/client";
import { DEFAULT_SECTION_STYLE } from "./style-defaults";

export interface ResolvedSectionStyle {
  spacing: { paddingTop: SectionSpacing; paddingBottom: SectionSpacing };
  background: {
    type: SectionBg;
    value?: string;
    overlayOpacity: number;
    imageUrl?: string;
  };
  container: { maxWidth: SectionMaxWidth };
  typography: {
    titleSize: TitleSize;
    titleColor?: string;
    textColor?: string;
    textAlign: TextAlign;
  };
  animation: { preset: SectionAnimation };
  customClass?: string;
}

/**
 * 4 段 cascade で Style を解決（specificity 低 → 高）
 * 1. Hardcoded fallback (DEFAULT_SECTION_STYLE)
 * 2. Theme default (settings.globalSectionStyle)
 * 3. Page-level (page.pageStyle)
 * 4. Section style preset (section.style)
 * 5. Section instance override (section.styleOverride)
 */
export function resolveSectionStyle(
  section: Section & { style: SectionStyle | null },
  page: Page & { pageStyle: SectionStyle | null },
  settings: Settings & { globalSectionStyle: SectionStyle | null },
): ResolvedSectionStyle {
  const layers = [
    DEFAULT_SECTION_STYLE,
    extractStylePayload(settings.globalSectionStyle),
    extractStylePayload(page.pageStyle),
    extractStylePayload(section.style),
    section.styleOverride as Partial<ResolvedSectionStyle> | null,
  ];
  return mergeStyleLayers(layers);
}

function mergeStyleLayers(
  layers: (Partial<ResolvedSectionStyle> | null)[],
): ResolvedSectionStyle {
  return layers.reduce<ResolvedSectionStyle>((acc, layer) => {
    if (!layer) return acc;
    return {
      spacing: { ...acc.spacing, ...layer.spacing },
      background: { ...acc.background, ...layer.background },
      container: { ...acc.container, ...layer.container },
      typography: { ...acc.typography, ...layer.typography },
      animation: { ...acc.animation, ...layer.animation },
      ...(layer.customClass !== undefined && {
        customClass: layer.customClass,
      }),
    };
  }, DEFAULT_SECTION_STYLE);
}
```

### AD-3: Style Library 管理画面

```
/admin/styles                          # Style 一覧（カード表示・検索・フィルタ）
/admin/styles/new                      # 新規作成（baseId から派生も可）
/admin/styles/[id]                     # 詳細表示（プレビュー + usage 一覧）
/admin/styles/[id]/edit                # 編集（プレビューパネル付き）
/admin/styles/[id]/usage               # この Style を使用している page / section の一覧
/admin/styles/[id]/derive              # この Style から派生 Style を作成
```

### AD-4: Section 編集画面の DesignFields 改修

旧 DesignFields（直接 paddingTop/Bottom を編集）→ 新「Style 選択 + Override panel」:

```tsx
<StyleSelector
  selectedStyleId={section.styleId}
  onStyleChange={handleStyleChange}
  applicableTypes={[section.type]}    // section.type に対応する Style のみ表示
/>
<ResolvedStylePreview style={resolvedStyle} />  // cascade 結果のプレビュー
<Disclosure title="Override（このセクション固有の調整）">
  <OverrideFields override={section.styleOverride} onChange={handleOverrideChange} />
</Disclosure>
<Button variant="secondary" onClick={handleSaveAsNewStyle}>
  Save current overrides as new Style
</Button>
<Button variant="ghost" onClick={handleDetachStyle}>
  Detach Style preset (embed override)
</Button>
```

### AD-5: 既存 Section.design JSON の自動移行

migration 内で:

1. 全 `Section.design` JSON を読み出し
2. 同一値を持つ design は 1 つの SectionStyle にまとめる（重複統合）
3. SectionStyle preset を seed 値（"Editorial - Standard"、"Editorial - Compact" 等）と照合
4. 一致するもの → 既存 preset の styleId を Section に設定
5. 不一致のもの → 新規 SectionStyle として作成 + styleId 設定
6. `Section.design` 列を削除

### AD-6: Style scope の意味論

| scope     | 意味                                                                    | UI 配置                                         |
| --------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| `global`  | テーマレベル default、Settings.globalSectionStyle として 1 件のみ選択可 | `/admin/settings/design`                        |
| `page`    | Page 単位 default、Page.pageStyle として複数 page から参照可            | `/admin/pages/[slug]/edit` の「Page Style」タブ |
| `section` | Section instance preset、複数 section から参照可（最も再利用される）    | `/admin/styles` メニュー                        |

---

## 破壊的変更リスト

| 変更                                                      | 影響                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| `SectionStyle` テーブル新設                               | 新規モデル、既存データ非影響                                    |
| `Section.design` JSON 列削除                              | 全 Section レコードの design データを SectionStyle に移行後削除 |
| `Section.styleId` / `Section.styleOverride` 追加          | 全 Section レコードに styleId 設定（migration 自動実行）        |
| `Page.pageStyleId` / `Settings.globalSectionStyleId` 追加 | nullable、既存データ非影響                                      |
| `SectionWrapper` の props 型変更                          | `design: SectionDesign` → `style: ResolvedSectionStyle`         |
| 全公開ページの section 描画ロジック                       | `resolveSectionStyle` 経由に書き換え                            |
| 管理画面 DesignFields 全面改修                            | 旧 UI 削除、新 StyleSelector + OverridePanel に置換             |

---

## 新規ファイル

### Domain 層

- `src/shared/domain/section-styles/types.ts` — SectionStyle TypeScript types
- `src/shared/domain/section-styles/queries.ts` — Style 取得（list / detail / usage 確認）
- `src/shared/domain/section-styles/commands.ts` — Style CRUD コマンド
- `src/shared/domain/section-styles/style-resolver.ts` — 4 段 cascade ロジック
- `src/shared/domain/section-styles/style-defaults.ts` — `DEFAULT_SECTION_STYLE` + seed preset 群
- `src/shared/domain/section-styles/style-merger.ts` — `mergeStyleLayers` deep merge
- `src/shared/domain/section-styles/applicable-types.ts` — Style ↔ Section type 適用可否判定

### Validation

- `src/shared/lib/validations/section-style.ts` — Zod schema（spacing / background / container / typography / animation）
- `src/shared/lib/validations/section-style-preset.ts` — seed preset の Zod 定義

### Server Actions（管理画面）

- `src/app/(admin)/_shared/actions/section-styles/queries.ts`
- `src/app/(admin)/_shared/actions/section-styles/mutations.ts` — create / update / delete / derive / detach
- `src/app/(admin)/_shared/actions/section-styles/index.ts` — barrel

### 管理画面 UI（Style Library）

- `src/app/(admin)/admin/(dashboard)/styles/page.tsx` — 一覧
- `src/app/(admin)/admin/(dashboard)/styles/_components/StyleGrid.tsx`
- `src/app/(admin)/admin/(dashboard)/styles/_components/StyleFilters.tsx`
- `src/app/(admin)/admin/(dashboard)/styles/_components/StyleCard.tsx` — カードプレビュー
- `src/app/(admin)/admin/(dashboard)/styles/new/page.tsx`
- `src/app/(admin)/admin/(dashboard)/styles/[id]/page.tsx` — 詳細 + usage
- `src/app/(admin)/admin/(dashboard)/styles/[id]/edit/page.tsx`
- `src/app/(admin)/admin/(dashboard)/styles/_components/StyleEditor.tsx` — メイン編集 UI
- `src/app/(admin)/admin/(dashboard)/styles/_components/StylePreview.tsx` — リアルタイムプレビュー
- `src/app/(admin)/admin/(dashboard)/styles/_components/StyleUsageTable.tsx` — 使用箇所一覧

### Section 編集 UI 改修

- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/StyleSelector.tsx` — Style 選択 dropdown
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/StyleOverridePanel.tsx` — override 編集
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/ResolvedStylePreview.tsx` — cascade 結果表示

### Page 編集 UI（pageStyle）

- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_components/PageStyleField.tsx` — Page-level Style 選択

### Settings 編集 UI（globalStyle）

- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/DesignSection.tsx` — globalSectionStyle 選択

### テスト

- `__tests__/unit/domain/section-styles/style-resolver.test.ts` — cascade ロジック
- `__tests__/unit/domain/section-styles/style-merger.test.ts` — deep merge
- `__tests__/unit/domain/section-styles/applicable-types.test.ts`
- `__tests__/integration/actions/admin/section-styles.test.ts` — CRUD Server Actions
- `__tests__/integration/section-design-migration.test.ts` — 旧 design → SectionStyle 移行ロジック

### Migration & Seed

- `prisma/migrations/<ts>_add_section_styles_and_cascade/migration.sql`
- `prisma/seed-section-styles.ts` — seed preset（Editorial - Hero / Standard / Compact / CTA / Carousel 等 5-7 件）

### ドキュメント

- `docs/architecture/decisions/0017-section-style-cascade.md` — ADR
- `docs/guides/admin/style-library.md` — 運用ガイド（管理者向け）

## 変更ファイル

- `prisma/schema.prisma` — SectionStyle model 追加、Section/Page/Settings 拡張
- `prisma/seed.ts` — `seedSectionStyles` 呼び出し追加、`seedAll` / `seedDemo` 登録
- `src/shared/lib/validations/section-design.ts` — `SectionDesign` 型を `SectionStylePayload` 系に分割（互換削除）
- `src/app/(public)/_shared/components/sections/SectionWrapper.tsx` — props を `style: ResolvedSectionStyle` に変更
- `src/app/(public)/page.tsx` / 全公開ページ — `resolveSectionStyle` 経由で style を resolve して渡す
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/SectionEditor.tsx` — DesignFields 削除、StyleSelector + OverridePanel に置換
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/DesignFields.tsx` — 削除
- `src/app/(admin)/admin/(dashboard)/_shared/components/Sidebar.tsx` — 「Style Library」メニュー追加
- `src/admin/lib/admin-resources.ts` — `Resource` 型に `"sectionStyle"` 追加
- `src/admin/lib/permissions.ts` — `sectionStyle` の RBAC 定義
- `src/shared/lib/constants/cache.ts` — `CACHE_TAGS.SECTION_STYLES` 追加、`getCacheTag.sectionStyles.detail` 追加
- `.claude/rules/ssot-singletons.md` — SectionStyle / cascade resolver を追加
- `.claude/rules/server-actions.md` — Style CRUD パターン追加
- `.claude/rules/gotchas.md` — Style cascade gotcha 追加（旧 `Section.design` 直接アクセス禁止）
- `.claude/rules/frontend/project-design-config.md` — Style システムの位置付け追加
- `__tests__/unit/lib/sections/architecture-boundaries.test.ts` — `Section.design` 直接参照禁止 grep 追加

## 削除ファイル

- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/DesignFields.tsx`
- `prisma/schema.prisma` の `Section.design` 列定義（migration で DROP COLUMN）

---

## マイグレーション

### Schema 変更 SQL（手書き、destructive）

```sql
-- 1. SectionStyle テーブル新設
CREATE TABLE "SectionStyle" (
  id              VARCHAR(30) PRIMARY KEY,
  name            VARCHAR(100) NOT NULL UNIQUE,
  description     TEXT,
  scope           VARCHAR(32) NOT NULL,
  spacing         JSONB NOT NULL,
  background      JSONB NOT NULL,
  container       JSONB NOT NULL,
  typography      JSONB NOT NULL,
  animation       JSONB NOT NULL,
  "customClass"   VARCHAR(200),
  "applicableTypes" VARCHAR(64)[] NOT NULL DEFAULT '{}',
  version         INTEGER NOT NULL DEFAULT 1,
  "parentId"      VARCHAR(30) REFERENCES "SectionStyle"(id) ON DELETE SET NULL,
  "createdById"   UUID,
  "updatedById"   UUID,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "deletedAt"     TIMESTAMP(3)
);
CREATE INDEX ON "SectionStyle" (scope);
CREATE INDEX ON "SectionStyle" ("applicableTypes");
CREATE INDEX ON "SectionStyle" ("deletedAt");

-- 2. Section に styleId / styleOverride 追加
ALTER TABLE "Section" ADD COLUMN "styleId" VARCHAR(30) REFERENCES "SectionStyle"(id) ON DELETE SET NULL;
ALTER TABLE "Section" ADD COLUMN "styleOverride" JSONB;
CREATE INDEX ON "Section" ("styleId");

-- 3. Page / Settings に cascade FK 追加
ALTER TABLE "Page" ADD COLUMN "pageStyleId" VARCHAR(30) REFERENCES "SectionStyle"(id) ON DELETE SET NULL;
ALTER TABLE "Settings" ADD COLUMN "globalSectionStyleId" VARCHAR(30) REFERENCES "SectionStyle"(id) ON DELETE SET NULL;

-- 4. seed preset を INSERT（5 件）— アプリケーション側で実行可能だが migration に含めることで roll-forward を保証
INSERT INTO "SectionStyle" (id, name, scope, spacing, background, container, typography, animation, "applicableTypes", "createdAt", "updatedAt") VALUES
  ('clxyz...', 'Editorial - Standard', 'section', '{"paddingTop":"lg","paddingBottom":"lg"}'::jsonb, '{"type":"default","overlayOpacity":0}'::jsonb, '{"maxWidth":"xl"}'::jsonb, '{"titleSize":"lg","textAlign":"left"}'::jsonb, '{"preset":"fade"}'::jsonb, ARRAY[]::VARCHAR[], NOW(), NOW()),
  ('clxyz...', 'Editorial - Compact', 'section', '{"paddingTop":"md","paddingBottom":"md"}'::jsonb, '{"type":"default","overlayOpacity":0}'::jsonb, '{"maxWidth":"xl"}'::jsonb, '{"titleSize":"md","textAlign":"center"}'::jsonb, '{"preset":"fade"}'::jsonb, ARRAY[]::VARCHAR[], NOW(), NOW()),
  ('clxyz...', 'Editorial - CTA', 'section', '{"paddingTop":"md","paddingBottom":"md"}'::jsonb, '{"type":"surface","overlayOpacity":0}'::jsonb, '{"maxWidth":"lg"}'::jsonb, '{"titleSize":"xl","textAlign":"center"}'::jsonb, '{"preset":"fade"}'::jsonb, ARRAY[]::VARCHAR[], NOW(), NOW()),
  ('clxyz...', 'Editorial - Hero Adjacent', 'section', '{"paddingTop":"sm","paddingBottom":"lg"}'::jsonb, '{"type":"default","overlayOpacity":0}'::jsonb, '{"maxWidth":"xl"}'::jsonb, '{"titleSize":"lg","textAlign":"left"}'::jsonb, '{"preset":"fade"}'::jsonb, ARRAY[]::VARCHAR[], NOW(), NOW()),
  ('clxyz...', 'Editorial - Full Bleed', 'section', '{"paddingTop":"none","paddingBottom":"none"}'::jsonb, '{"type":"default","overlayOpacity":0}'::jsonb, '{"maxWidth":"full"}'::jsonb, '{"titleSize":"lg","textAlign":"center"}'::jsonb, '{"preset":"none"}'::jsonb, ARRAY[]::VARCHAR[], NOW(), NOW());

-- 5. 既存 Section.design を SectionStyle に移行（プログラム側で実行する方が複雑な統合ロジックを書けるため、Step 6 の migration script で対応）

-- 6. 旧 Section.design 列を削除
ALTER TABLE "Section" DROP COLUMN design;
```

### データ移行スクリプト（migration.sql 後に実行）

```bash
# scripts/migrate-section-design-to-style.ts を作成して実行
bun scripts/migrate-section-design-to-style.ts
```

スクリプト内容（疑似コード）:

1. `prisma.section.findMany({ select: { id, design } })` で全 Section の旧 design を取得
2. design JSON を canonical 化（key 並び替え + 値正規化）してハッシュ化
3. ハッシュ別にグルーピング → ユニークな design pattern を抽出
4. 各 unique pattern を SectionStyle として upsert（既存 seed preset と一致するもの優先）
5. Section.styleId に該当 SectionStyle の id を設定
6. 移行ログを `migration-log.json` に書き出し（roll-back 用）

### 実行手順

```bash
# Worktree 隔離 + dev DB バックアップ
git worktree add .worktrees/section-arch-phase-b feature/section-arch-phase-b

# Phase A 完了済みであることを確認
grep -r "spacing-section-compact" src/ && echo "ERROR: Phase A 未完" && exit 1

# Migration 適用
TS=$(date -u +%Y%m%d%H%M%S)
NAME="add_section_styles_and_cascade"
mkdir prisma/migrations/${TS}_${NAME}
python3 -c "open('prisma/migrations/${TS}_${NAME}/migration.sql','w',encoding='utf-8').write('...SQL...')"
bunx --bun prisma db execute --file prisma/migrations/${TS}_${NAME}/migration.sql
bunx --bun prisma migrate resolve --applied ${TS}_${NAME}
bunx --bun prisma generate

# データ移行スクリプト実行
bun scripts/migrate-section-design-to-style.ts

# 移行検証
bun -e "import {prisma} from './src/shared/db/prisma'; (async () => { const orphans = await prisma.section.count({ where: { styleId: null } }); console.log('Orphan sections (no styleId):', orphans); await prisma.\$disconnect(); })()"
# 期待: 0
```

---

## 環境変数

なし（既存の `DATABASE_URL` のみ）

---

## 実装 Phase 分割（5 commit 構成）

### P1: Spec & Plan 確定 + ADR 作成（0.5d / 1 commit）

**目的**: 設計仕様を凍結、ADR で意思決定を記録。

**変更**:

- `docs/superpowers/specs/section-style-cascade-design.md` 作成（本プランの拡張版）
- `docs/architecture/decisions/0017-section-style-cascade.md` 作成（Status: Proposed）

**Commit message**: `docs(arch): add section style cascade spec and ADR 0017 (Phase B.1)`

---

### P2: Prisma model + migration + seed（1d / 1 commit）

**目的**: SectionStyle テーブル新設、seed preset 5-7 件追加、Section に styleId 列追加（design 列はまだ残す並行運用）。

**変更**:

- `prisma/schema.prisma` に SectionStyle / Section.styleId / Section.styleOverride / Page.pageStyleId / Settings.globalSectionStyleId 追加（design 列はまだ削除しない）
- migration SQL 作成・実行
- `prisma/seed-section-styles.ts` 作成、`seedAll` / `seedDemo` 登録
- `src/shared/domain/section-styles/types.ts` / `queries.ts` / `commands.ts` 雛形作成
- unit test 追加: `style-resolver.test.ts`（DEFAULT_SECTION_STYLE のみ動作確認）

**検証**:

- `bunx --bun prisma migrate status` で migration 反映確認
- `bun prisma/seed.ts` で seed preset が DB に追加される
- `bun -e "..."` で SectionStyle テーブルに 5 件存在確認
- `bun run validate && bun run build` 通過

**Commit message**: `feat(prisma): add SectionStyle model with cascade FKs (Phase B.2)`

---

### P3: Domain 層 cascade resolver + 旧 design → Style 移行スクリプト（1d / 1 commit）

**目的**: 4 段 cascade ロジック完成、既存 Section.design データを SectionStyle に移行。

**変更**:

- `src/shared/domain/section-styles/style-resolver.ts` 完全実装
- `src/shared/domain/section-styles/style-merger.ts` deep merge ロジック
- `src/shared/domain/section-styles/applicable-types.ts`
- `scripts/migrate-section-design-to-style.ts` 実装
- 既存 dev DB で migration script 実行 → 全 Section に styleId が設定されることを確認
- `__tests__/unit/domain/section-styles/style-resolver.test.ts` 完全版（4 段 cascade のテストケース）
- `__tests__/integration/section-design-migration.test.ts` — migration script のテスト

**検証**:

- migration script を 2 回連続実行で idempotency 確認
- `bun -e "..."` で全 Section.styleId が non-null 確認
- ユニットテスト全件通過

**Commit message**: `feat(domain): add 4-tier style cascade resolver and migration script (Phase B.3)`

---

### P4: SectionWrapper / 公開ページの全面 cascade 統合 + 旧 Section.design 列削除（1d / 1 commit）

**目的**: 公開ページの全描画ロジックを `resolveSectionStyle` 経由に書き換え、旧 design 列を完全廃止。

**変更**:

- `SectionWrapper.tsx` props を `design: SectionDesign` → `style: ResolvedSectionStyle` に変更
- 全公開ページ（`src/app/(public)/**`）で `resolveSectionStyle(section, page, settings)` を呼び出して style prop 渡し
- `src/shared/lib/validations/section-design.ts` を `section-style.ts` に名称変更、payload 型を分割
- migration 第 2 弾: `ALTER TABLE "Section" DROP COLUMN design`
- 全 unit / integration テストを Style ベースに書き換え

**検証**:

- 公開全ページの visual regression 確認（375px / 768px / 1280px / 1920px）
- 管理画面 Section 編集画面が一時的に壊れる（DesignFields がまだ削除されていないため）→ P5 で修正
- `bun run validate && bun run build` 通過
- `bun run test:all` 通過

**Commit message**: `refactor(public): switch all sections to style cascade resolver (Phase B.4, BREAKING)`

---

### P5: 管理画面 Style Library + Section 編集 UI 改修（2d / 1 commit）

**目的**: Style Library 管理画面新設、Section 編集 UI を StyleSelector + OverridePanel に改修。

**変更**:

- `/admin/styles` 管理画面一式新設（一覧・詳細・編集・新規・usage）
- Server Actions: `section-styles/queries.ts` / `mutations.ts`（executeAdminMutationResult パターン）
- `Resource` 型に `"sectionStyle"` 追加、RBAC 定義
- Section 編集画面: `DesignFields.tsx` 削除、`StyleSelector` + `StyleOverridePanel` + `ResolvedStylePreview` に置換
- Page 編集画面に `PageStyleField`（Page-level Style 選択）追加
- Settings 編集画面に `DesignSection`（globalSectionStyle 選択）追加
- Sidebar に「Style Library」メニュー追加
- ADR 0017 を Status: Accepted に変更
- 関連ルール更新（ssot-singletons.md / server-actions.md / gotchas.md）
- 運用ガイド作成（`docs/guides/admin/style-library.md`）

**検証**:

- 管理画面で Style CRUD 動作確認
- Section 編集で Style 選択 → 公開ページ即時反映確認
- Page-level cascade 動作確認（Page Style 変更で全 section 反映）
- Global cascade 動作確認（Settings.globalSectionStyle 変更で全 page 反映）
- `bun run validate && bun run build` 通過
- E2E テスト追加: `e2e/admin/section-styles.spec.ts`

**Commit message**: `feat(admin): add Style Library and refactor Section editor with cascade UX (Phase B.5)`

---

## 検証

### Phase 全体の完了基準

- [ ] `bun run validate && bun run build` 通過
- [ ] `bun run test:all` 通過
- [ ] `bunx playwright test` 通過（admin + public E2E）
- [ ] 管理画面 `/admin/styles` で Style CRUD 動作
- [ ] Section 編集で Style 選択 + override が cascade で正しく解決される
- [ ] 全 Section レコードに `styleId` が設定済み（`prisma.section.count({ where: { styleId: null } })` = 0）
- [ ] 旧 `Section.design` 列が完全削除（schema.prisma に存在しない）
- [ ] `grep -r '\.design\b' src/ --include="*.ts" --include="*.tsx" | grep -i section` で旧参照 0
- [ ] Lighthouse スコア劣化なし
- [ ] ADR 0017 が Accepted

### Style Library QA チェックリスト

- [ ] Style 新規作成 → 即座に Section 編集画面の dropdown に表示
- [ ] Style 編集 → 該当 Style を使う全 section に即時反映（cache 無効化）
- [ ] Style 削除 → 使用中の section で onDelete: SetNull → DEFAULT_SECTION_STYLE にフォールバック
- [ ] Style derive → parent の値を継承した新 Style が作成される
- [ ] Style usage 一覧 → 該当 Style を使う全 page / section が表示
- [ ] applicable Types フィルタ → section type に対応する Style のみ dropdown 表示
- [ ] Page-level Style 設定 → 該当 page の全 section（個別 styleId なし）が継承
- [ ] Global Style 設定 → 全 page の全 section（個別なし + page なし）が継承
- [ ] Section override → cascade 結果が override 優先で適用

---

## ロールバック戦略

- 各 phase は 1 commit、`git revert <sha>` で個別 rollback 可能
- P3 の data migration は `migration-log.json` を保持し roll-back スクリプト準備
- P4 の `Section.design` 列削除は revert SQL を migration ディレクトリに併記:
  ```sql
  ALTER TABLE "Section" ADD COLUMN design JSONB;
  -- migration-log.json から旧 design を復元する script で復旧
  ```
- P5 の管理画面改修は機能追加のみで非破壊（旧 DesignFields は削除済みだが UI は新規）
- worktree 隔離で main を常にクリーン状態に保つ

---

## リスク

| リスク                                                                      | 対策                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 旧 design → SectionStyle 移行で重複統合に失敗（似て非なる design がマージ） | canonical 化ロジックを厳密に（key 順序 + 値正規化）、移行ログで全 Section の before/after を記録 |
| migration 中の Section が styleId NULL のまま残る                           | `ALTER TABLE Section DROP COLUMN design` を実行する前に `count(styleId IS NULL) = 0` 検証必須    |
| Style cascade の deep merge ロジックバグ                                    | unit test で 4 段 × 全フィールド × override 有無の組み合わせを網羅                               |
| 管理画面 UX 学習コストで運用者が混乱                                        | `docs/guides/admin/style-library.md` 運用ガイド + 初回ログイン時のオンボーディング               |
| Style 削除で onDelete: SetNull → 視覚デグレ                                 | 削除前に usage 一覧を強制表示、影響範囲確認後のみ削除可能                                        |
| Production migration での DB lock                                           | seed preset を migration 内で INSERT、データ移行は別 script で段階実行可能                       |
| Style preset の applicableTypes 制限が運用負荷                              | デフォルトは全 type 適用可、必要に応じて個別 Style で制限                                        |

---

## 関連 ADR / ルール

- 新規 ADR: `docs/architecture/decisions/0017-section-style-cascade.md`
- 前提 ADR: `docs/architecture/decisions/0016-page-hero-first-class-field.md`（Phase A 採択）
- 更新ルール: `ssot-singletons.md` / `server-actions.md` / `gotchas.md` / `frontend/project-design-config.md`
- 影響テスト: `architecture-boundaries.test.ts` に Style cascade 違反検出ルール追加

---

## ROI 評価

| 項目               | Phase A 単体 | Phase A + B                                  |
| ------------------ | ------------ | -------------------------------------------- |
| 工数               | 5d           | 10d (累計)                                   |
| Migration 数       | 1            | 2                                            |
| 公式 CMS 互換性    | 中           | **最高** (Sanity / Webflow / WordPress 互換) |
| マルチサイト準備度 | 30%          | **95%**                                      |
| A/B テスト容易性   | 低           | **高**                                       |
| 運用者学習コスト   | 低           | 中                                           |
| デザインシステム化 | 部分的       | **完全**                                     |

---

## 実装手順サマリ（agentic worker 向け）

1. **前提確認**: Phase A 完了 (`grep -r "spacing-section-compact" src/` ヒット 0、`Page.pageHero` 列存在)
2. worktree 作成: `feature/section-arch-phase-b`
3. P1 → P2 → P3 → P4 → P5 の順に commit、各 phase 完了後 `bun run validate && bun run build`
4. P3 の data migration 後 `prisma.section.count({ styleId: null })` = 0 確認必須
5. P4 の `DROP COLUMN design` は P3 検証完了後のみ実行
6. P5 の Style Library 管理画面は実装規模大、別 worktree + サブエージェント並列化推奨
7. Phase 完了後 PR 作成、レビュー後 main マージ → 本番デプロイ
8. 完了後本ファイル削除（CLAUDE.md clean-break 原則）、ADR 0017 を Accepted で残す
