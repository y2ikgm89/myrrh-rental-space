> **Snapshot: 2026-05-06** — Implementation completed across Phase 1-7, archived as historical reference.
>
> **Completed Phases**:
>
> - Phase 1 `2cf4475e` — `Page.template` + `PAGE_TEMPLATES` SSoT 導入
> - Phase 2 `6236b514` — `homepage-*` を標準 section type に統合
> - Phase 3 `b80086b7` — FaqAccordion + ContactForm を section variant に内包
> - Phase 4-A `a325b9cd` — EventCalendar + ViewSwitcher を event-calendar variant に内包
> - Phase 4-B `952b313a` — SpaceGrid + FilterBar + Pagination を space-list catalog variant に内包
> - Phase 4-C `3ec2e63a` — PostGrid + NewsList + SearchBar + BlogLayout を post-list / news-list archive variant に内包
> - Phase 5 `b184f4a6` — `reservation-form` 新規 Section type 追加
> - Phase 6-A `12eba315` — /access + /reservation page.tsx 統一テンプレート化
> - Phase 6-B `1fbfbabe` — AddSectionDialog template-aware + 必須セクション削除メニュー disabled
> - Phase 6-C `e1802169` — SectionRenderer に `pageSlug` prop 導入、sidebar page-template-aware 化
> - Phase 7 — docs / rule / memory 同期 + plan archive（本 commit）

# Page Template Architecture — Design Spec (Clean Break)

> 対象: `/admin/pages` 編集体験と公開ページ描画の整合性統一
> 作成: 2026-05-05
> ステータス: Implemented（Phase 1-7 全完了 2026-05-06）
> 関連: ADR 0018（field-registry）/ ADR 0021（Section Architecture clean-break）/ ADR 0028（Claude config 最適化）

## 背景・動機

### 現状の問題（2026-05-05 整合性監査で判明）

「ページ管理にある公開ページが編集ページと一致しているか」の徹底調査結果:

**【主】管理画面で編集できるのに公開で表示されない silent ignore（7 ページ）**

`/faq` `/contact` `/news` `/posts` `/events` `/spaces` `/reservation` の各 `page.tsx` に `trailingSections.filter(s => s.type !== "X")` の除外ロジックが存在。除外対象例:

| ページ         | 除外 type                              |
| -------------- | -------------------------------------- |
| `/faq`         | `faq-list` / `cta` / `hero(parallax)`  |
| `/contact`     | `cta` / `hero(parallax)`               |
| `/news`        | `news-list` / `cta` / `hero(parallax)` |
| `/posts`       | `post-list` / `cta` / `hero(parallax)` |
| `/events`      | `event-calendar` / `hero(parallax)`    |
| `/spaces`      | `space-list` / `hero(parallax)`        |
| `/reservation` | `space-list` / `hero(parallax)`        |

→ 管理者が `/admin/pages/faq/edit` で `cta` を追加保存しても **公開 `/faq` には何も表示されない**。UI 上の警告も無し。

**【副】Homepage 別系統による特例**

`/` だけ `getHomepagePublicData()` + `HomepageSections.tsx` で動作し、`type.startsWith("homepage-")` でフィルタ。`hero` / `cta` / `concept` 等の標準 type を追加しても無視される（`HomepageSections.tsx:225-227` `default: return null`）。許可される type は `homepage-how-it-works` / `homepage-spaces` / `homepage-features` / `homepage-cta` の 4 種のみ。

**【副】page.tsx 内のページ固有 UI が SSoT 二重化**

`FaqAccordion`（`/faq` 中間に強制挿入）/ 自作カレンダー（`/events`）/ 自作 SpaceGrid（`/spaces` `/reservation`）/ 自作リスト（`/news` `/posts`）/ 予約フォーム（`/reservation`）/ 問い合わせフォーム（`/contact`）が **管理画面で編集不能なハードコード**として存在。

## 方針: Clean Break（後方互換なし）

**ユーザー指示**: 公式ベストプラクティス準拠 / 後方互換性なし / 推奨実装でクリーンに。

採用する公式パターン:

| CMS                 | 該当パターン                                                                  | 参考 URL                                                                                   |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Sanity Studio       | `documents` × `arrayOf([{ type: "block-A" }])` で page-context 別の許可 block | `https://www.sanity.io/docs/document-types`                                                |
| Payload CMS         | `blocks` field の `blockReferences` で template ごとに使える block を制限     | `https://payloadcms.com/docs/fields/blocks`                                                |
| Contentful          | Content Model の `validations.linkContentType` で entry 制限                  | `https://www.contentful.com/developers/docs/concepts/data-model/`                          |
| WordPress Gutenberg | `block_template` + `allowed_blocks` setting                                   | `https://developer.wordpress.org/block-editor/reference-guides/block-api/block-templates/` |

**核心原則**: 「管理画面に出る = 公開で出る」の不変条件を **type level で強制**する。

## ゴール

1. **silent ignore の根本撲滅**: 管理画面で追加できる section type は必ず公開で描画される
2. **Homepage 特例廃止**: 全公開ページが単一 SectionRenderer 経由で描画
3. **ページ固有 UI を Section variant に内包**: FaqAccordion / カレンダー / SpaceGrid / 予約フォーム / 問い合わせフォーム を section 化し、管理画面から並び替え・配置可能に
4. **Page Template SSoT**: 各 Page slug に `template` を持たせ、許可 section type を declarative 定義
5. **DB Section が canonical**: 公開 page.tsx は trailing filter なしで `sections.map(SectionRenderer)` のみ

---

## 設計詳細

### 1. データモデル変更（destructive migration）

#### 1.1 `Page.template` カラム追加

```prisma
model Page {
  // ...
  template String @db.VarChar(64)  // SSoT: PAGE_TEMPLATES のキー
  // ...
}
```

`@db.VarChar(64)` で Section.type と同じ柔軟性。enum 化しない（既存 `Section.type` パターン踏襲）。

#### 1.2 既存 Page レコードへの template 値割当（migration data step）

| slug                 | template         |
| -------------------- | ---------------- |
| `home`               | `home`           |
| `about`              | `content`        |
| `access`             | `access`         |
| `contact`            | `contact`        |
| `faq`                | `faq`            |
| `news`               | `news-archive`   |
| `posts`              | `blog-archive`   |
| `events`             | `events-archive` |
| `spaces`             | `spaces-archive` |
| `reservation`        | `reservation`    |
| その他カスタムページ | `custom`         |

#### 1.3 既存 `homepage-*` Section の rewrite

`/admin/pages/home/edit` の既存 Section レコードを以下に書き換え:

| 旧 type                 | 新 type          | 備考                                 |
| ----------------------- | ---------------- | ------------------------------------ |
| `homepage-how-it-works` | `features`       | `variant="numbered-list"` で同等表現 |
| `homepage-spaces`       | `space-showcase` | 既存標準 type に統合                 |
| `homepage-features`     | `features`       | `variant="grid"`                     |
| `homepage-cta`          | `cta`            | 既存標準 type に統合                 |

migration SQL で `UPDATE sections SET type = ..., config = jsonb_build_object(...) WHERE type = 'homepage-X'` 形式で書き換え。

### 2. Page Template SSoT（新規 file）

`src/shared/lib/sections/page-templates.ts`:

```typescript
import type { SectionType } from "./types";

export interface PageTemplate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly allowedSectionTypes: readonly SectionType[];
  readonly defaultSections: readonly DefaultSectionDef[];
  readonly requiredSectionTypes?: readonly SectionType[]; // 必須（削除不可）
}

export const PAGE_TEMPLATES: Record<string, PageTemplate> = {
  home: {
    id: "home",
    label: "ホーム",
    description: "トップページ — Hero + 特集",
    allowedSectionTypes: [
      "page-hero",
      "hero-parallax",
      "features",
      "space-showcase",
      "post-list",
      "news-list",
      "cta",
      "concept",
      "instagram",
      "testimonial",
    ],
    defaultSections: [
      /* 既存 DEFAULT_PAGE_SECTIONS.home から派生 */
    ],
    requiredSectionTypes: ["page-hero"],
  },
  content: {
    id: "content",
    label: "コンテンツページ",
    description: "/about のような自由構成",
    allowedSectionTypes: [
      /* hero / custom / cta / features / gallery / 等の汎用 */
    ],
    defaultSections: [
      /* */
    ],
  },
  access: {
    id: "access",
    label: "アクセス",
    description: "拠点情報",
    allowedSectionTypes: [
      "page-hero",
      "hero",
      "location-list",
      "map",
      "cta",
      "custom",
    ],
    defaultSections: [
      /* */
    ],
    requiredSectionTypes: ["location-list"],
  },
  contact: {
    id: "contact",
    label: "お問い合わせ",
    description: "問い合わせフォーム + 補足",
    allowedSectionTypes: ["page-hero", "hero", "contact-form", "custom", "map"],
    defaultSections: [
      /* contact-form 含む */
    ],
    requiredSectionTypes: ["contact-form"],
  },
  faq: {
    id: "faq",
    label: "FAQ",
    description: "よくあるご質問",
    allowedSectionTypes: ["page-hero", "hero", "faq-list", "cta", "custom"],
    defaultSections: [
      /* faq-list 含む */
    ],
    requiredSectionTypes: ["faq-list"],
  },
  "news-archive": {
    /* news-list 必須 */
  },
  "blog-archive": {
    /* post-list 必須 */
  },
  "events-archive": {
    /* event-calendar 必須 */
  },
  "spaces-archive": {
    /* space-list 必須 */
  },
  reservation: {
    id: "reservation",
    label: "予約",
    description: "予約フォーム",
    allowedSectionTypes: [
      "page-hero",
      "hero",
      "reservation-form",
      "space-list",
      "cta",
    ],
    defaultSections: [
      /* reservation-form 含む */
    ],
    requiredSectionTypes: ["reservation-form"],
  },
  custom: {
    id: "custom",
    label: "カスタム",
    description: "自由構成（管理者が任意に組む）",
    allowedSectionTypes: [
      /* 全 standard type */
    ],
    defaultSections: [
      /* hero + custom + cta */
    ],
  },
} as const;

export function getPageTemplate(templateId: string): PageTemplate | undefined {
  return PAGE_TEMPLATES[templateId];
}

export function isAllowedSectionForTemplate(
  templateId: string,
  sectionType: SectionType,
): boolean {
  const template = PAGE_TEMPLATES[templateId];
  if (!template) return false;
  return template.allowedSectionTypes.includes(sectionType);
}
```

### 3. 新規 Section type（ページ固有 UI を内包）

#### 3.1 `contact-form` Section

`src/shared/lib/sections/definitions/contact-form/` 配下:

- `schema.ts`: `formId` / `successMessage` / `requiredFields[]` / `turnstileEnabled` 等を field-registry で定義
- `metadata.ts`: 必須・カスタマイズ不可な設定（hidden honeypot 等）
- 描画: 既存 `contact/_components/contact-form.tsx` を `_components/sections/standard/contact-form/` に移動

#### 3.2 `reservation-form` Section（**新規追加**）

既存 `reservation/_components/` 配下の form を Section に内包。configurable 項目:

- `defaultSpaceId`（事前選択）
- `skipStep1` (boolean)
- `enableCoupon` (boolean)
- `requireLogin` (boolean)

#### 3.3 既存 Section に variant 追加

| Section type     | 既存 variant        | 追加 variant                                 | 内包する旧独自 UI                      |
| ---------------- | ------------------- | -------------------------------------------- | -------------------------------------- |
| `faq-list`       | `accordion`（既存） | なし（既に accordion）                       | `/faq` の `FaqAccordion` を統合        |
| `event-calendar` | （既存単一）        | `calendar-list-toggle`（list/calendar 切替） | `/events` の自作カレンダー + 一覧      |
| `space-list`     | `grid`              | `featured-grid` / `category-filtered`        | `/spaces` の自作 SpaceGrid + FilterBar |
| `news-list`      | `list`              | `card-grid` / `magazine`                     | `/news` の自作 NewsArchive             |
| `post-list`      | `grid`              | `card-grid` / `magazine`                     | `/posts` の自作 PostGrid + sidebar     |

各 variant は `config.variant` field で選択。schema は discriminated union ではなく `variant: z.enum([...])` + variant 別 optional fields で表現（既存パターン踏襲）。

### 4. 公開 page.tsx の clean

#### 4.1 全 11 ページ統一テンプレート

```tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { PageLayout } from "@/public/components/design-system/page-layout";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("<slug>");
}

export default async function Page(): Promise<ReactElement> {
  await connection();
  const sections = await getPageSectionsWithFallback("<slug>");
  return (
    <PageLayout variant="content">
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
```

**削除対象**:

- `trailingSections` filter ロジック全件
- `heroSection` の find / split ロジック（PageHero は `page-hero` Section type で SectionRenderer に統合済み）
- ページ固有 UI の手動配置（FaqAccordion / 自作 SpaceGrid 等は Section に吸収済み）
- `/faq` の `Suspense` + `SiteCTA` 強制配置（cta Section が代替）

#### 4.2 `/` (Home) の clean

`src/app/(public)/page.tsx`:

```tsx
export default async function HomePage(): Promise<ReactElement> {
  await connection();
  const [webSiteData, sections] = await Promise.all([
    getWebSiteJsonLdData(),
    getPageSectionsWithFallback("home"),
  ]);
  return (
    <>
      <WebSiteJsonLd {...webSiteData} />
      <PageLayout variant="home">
        {sections.map((section) => (
          <SectionRenderer key={section.id} section={section} />
        ))}
      </PageLayout>
    </>
  );
}
```

`HomepageSections.tsx` / `getHomepagePublicData()` / `_components/homepage/` 配下の旧コンポーネント全削除。

### 5. 管理画面 Template-aware UI

#### 5.1 `AddSectionDialog` の変更

`src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/AddSectionDialog.tsx`:

- 現状: `getAllSectionDefinitions()` で全 24 type を表示
- 変更後: `PAGE_TEMPLATES[page.template].allowedSectionTypes` でフィルタした type のみ Command Palette に表示

#### 5.2 必須 Section の削除制御

`PageTemplate.requiredSectionTypes` に含まれる Section は `SectionListItem` の削除ボタンを無効化（tooltip で「このセクションはこのテンプレートで必須です」表示）。

#### 5.3 ページ作成時の defaultSections

`createPageCommand` が `template` を受け取り、`PAGE_TEMPLATES[template].defaultSections` を初期 Section として作成。

### 6. 削除リスト（destructive cleanup）

#### 6.1 ファイル削除

```
src/app/(public)/_shared/components/homepage/HomepageSections.tsx
src/app/(public)/_components/homepage/how-it-works-section.tsx
src/app/(public)/_components/homepage/spaces-section.tsx
src/app/(public)/_components/homepage/features-section.tsx
src/app/(public)/_components/homepage/cta-section.tsx
src/app/(public)/_components/homepage/spaces-carousel.tsx (機能は space-showcase に統合)
src/shared/lib/sections/definitions/homepage-how-it-works/
src/shared/lib/sections/definitions/homepage-spaces/
src/shared/lib/sections/definitions/homepage-features/
src/shared/lib/sections/definitions/homepage-cta/
src/app/(public)/faq/_components/faq-accordion.tsx (faq-list section に統合)
src/app/(public)/events/_components/event-calendar-view.tsx (event-calendar section に統合)
src/app/(public)/events/_components/event-list-view.tsx (同上)
src/app/(public)/events/_components/events-view-switcher.tsx (同上)
```

#### 6.2 関数・型削除

```
getHomepagePublicData() — @/shared/domain/sections/queries
HomepagePublicData type
getShowcaseSpaces (HomepageSections 専用なら削除、space-showcase が使うなら維持)
DEFAULT_PAGE_SECTIONS の各エントリ — PAGE_TEMPLATES.defaultSections に置換
```

#### 6.3 SSoT 表更新

`.claude/rules/ssot-singletons.md` の以下を更新:

- 「管理画面 セクション編集」表に `PAGE_TEMPLATES` を追加
- 「Section レジストリ全体数」を 24 → 25（reservation-form 追加）or 21（homepage-\* 4 種削除後）

### 7. cache invalidation

新規 cache tag は不要。既存 `getCacheTag.pages.detail(slug)` が Page + 配下 Section を invalidate する契約は維持。

`updatePageTemplate` action は新規追加せず、`updatePage` の data に `template` field を含めるだけ（pages の other field と同経路）。

### 8. テスト戦略

#### 8.1 Unit tests

| 対象                          | test                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAGE_TEMPLATES`              | 全 template の `allowedSectionTypes` が `SectionType` enum の subset / `requiredSectionTypes` が `allowedSectionTypes` の subset / `defaultSections` の type が全て allowed |
| `isAllowedSectionForTemplate` | 既知 template + 既知 type = true / 未知 template = false / 既知 template + 未許可 type = false                                                                              |
| `createPageCommand`           | template 指定時に default sections が作成される                                                                                                                             |
| `addSectionToPage`            | 許可外 type を渡すと `DomainError("FORBIDDEN_SECTION_TYPE")`                                                                                                                |

#### 8.2 Integration tests

| 対象                                        | test                                                        |
| ------------------------------------------- | ----------------------------------------------------------- |
| `/admin/pages/<slug>/edit` AddSectionDialog | template に応じた type のみ表示                             |
| 公開 `/faq` `/contact` 等                   | DB Section の追加・削除が即時反映（`updateTag` 経由）       |
| Migration smoke                             | 既存 `homepage-*` Section が新 type に正しく rewrite される |

#### 8.3 E2E (Playwright)

| シナリオ                                              | 検証                               |
| ----------------------------------------------------- | ---------------------------------- |
| 管理者が `/admin/pages/about/edit` で `cta` 追加      | 公開 `/about` の最後に CTA が表示  |
| 管理者が `/admin/pages/home/edit` で section 並び替え | 公開 `/` の DOM 順序が変更後と一致 |
| 必須 Section の削除試行                               | 削除ボタン disabled / tooltip 表示 |

### 9. アクセシビリティ・SEO 影響

- **JSON-LD**: 既存 `LocalBusinessJsonLd` (per-location) / `BreadcrumbJsonLd` / `ProductJsonLd` 等は影響なし（`page.tsx` の Suspense 内 SC として維持）
- **a11y**: SectionRenderer は既存 SectionWrapper を使うため WCAG 2.5.5 / heading 階層の規律はそのまま
- **画像**: `next/image` 経由で従来どおり

### 10. パフォーマンス影響

- **Bundle size**: `homepage-*` 4 type 削除で client bundle ~30 KB 削減見込み（未測定）
- **First Load JS**: `/` は HomepageSections.tsx + 4 専用 component を SectionRenderer 経由に統合するため軽量化
- **Cache**: `getPageSectionsWithFallback` は既に `'use cache'` + `safeFetch`、追加最適化なし

### 11. リスク・トレードオフ

| リスク                                                                                | 対策                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Homepage の見た目が `homepage-*` から標準 section に rewrite で変わる                 | migration 内で `config` を可能な限り保持。視覚的な微差は許容（clean-break 方針）                  |
| 必須 Section のテストカバレッジ漏れ                                                   | Phase 2 の data migration 後、自動テストで全 11 ページが render エラーにならないことを smoke test |
| `reservation-form` Section 内で React Hook Form + nuqs + Server Action 等の複雑な依存 | Section schema は config のみ、form 実装は section component が従来どおり client component で持つ |
| 既存テスト（`__tests__/integration/actions/homepage.test.ts` 等）の破綻               | 削除 + 新規テスト追加で clean-break                                                               |

---

## Phase 分割（実装順）

各 phase は **単独で merge 可能 + validate + build pass** を必須条件とする。

### Phase 1: Foundation（destructive migration + SSoT）

**1 commit**: `feat(pages): introduce Page.template + PAGE_TEMPLATES SSoT`

- `Page.template` migration（既存 Page に slug 別 template 値を割当）
- `src/shared/lib/sections/page-templates.ts` 新規作成
- `__tests__/unit/shared/lib/sections/page-templates.test.ts`
- `getPagesList` / `getPageForEdit` の select に `template: true` 追加
- 公開・管理 UI 変更なし（既存無影響）

### Phase 2: Homepage 統合

**1 commit**: `refactor(sections): merge homepage-* into standard section types`

- migration: `homepage-*` Section を `features` / `space-showcase` / `cta` に rewrite
- `definitions/homepage-*/` 4 ディレクトリ削除
- `registry.ts` から該当 import 削除
- `HomepageSections.tsx` / `getHomepagePublicData()` / `_components/homepage/*` 削除
- `src/app/(public)/page.tsx` を統一テンプレート化
- 既存 unit / integration テストの homepage-related を削除 + 新規 smoke test 追加

### Phase 3: ページ固有 UI を Section に内包（A: contact-form / faq-list）

**1 commit**: `refactor(sections): absorb FaqAccordion + ContactForm into section variants`

- `definitions/contact-form/schema.ts` 拡張
- `_components/sections/standard/contact-form/` に既存 form 移動
- `faq-list` schema に `variant: "accordion"` 追加（既存挙動を default に）
- `_components/sections/standard/faq-list/` 配下に既存 `FaqAccordion` 機能を統合
- `/contact/_components/` `/faq/_components/faq-accordion.tsx` 削除

### Phase 4: ページ固有 UI を Section に内包（B: events / spaces / posts / news）

**1 commit**: `refactor(sections): absorb EventsCalendar + SpaceGrid + PostGrid + NewsArchive`

- `event-calendar` schema に `variant: "calendar" | "list" | "calendar-list-toggle"` 追加
- `space-list` schema に `variant: "grid" | "featured-grid" | "category-filtered"` 追加
- `news-list` / `post-list` schema に `variant: "list" | "card-grid" | "magazine"` 追加
- 既存 `events-view-switcher.tsx` / `event-calendar-view.tsx` / `event-list-view.tsx` を section component に統合
- 自作 `/spaces` `/news` `/posts` の独自 UI を section component に吸収

### Phase 5: reservation-form 新規 Section

**1 commit**: `feat(sections): add reservation-form section type`

- `definitions/reservation-form/` 新規作成
- 既存 `reservation/_components/reservation-form.tsx` 等を section に内包
- `registry.ts` に登録
- `PAGE_TEMPLATES.reservation.requiredSectionTypes` に追加

### Phase 6: page.tsx clean + AddSectionDialog template-aware

**1 commit**: `refactor(public,admin): finalize page-template architecture`

- 11 公開 page.tsx を統一テンプレートに置換（trailing filter 全廃）
- `AddSectionDialog` を `PAGE_TEMPLATES[page.template].allowedSectionTypes` でフィルタ
- `SectionListItem` の必須 Section 削除ボタン disabled 処理
- `createPageCommand` で `template` 受け取り + defaultSections 作成
- `DEFAULT_PAGE_SECTIONS` 削除（`PAGE_TEMPLATES.defaultSections` に置換）
- 該当 unit / integration / E2E テスト追加・更新
- `.claude/rules/ssot-singletons.md` 更新

### Phase 7: 文書同期

**1 commit**: `docs(rules): sync page-template architecture`

- `MEMORY.md` に新プロジェクト記録追加
- `.claude/rules/ssot-singletons.md` の Section レジストリ件数更新
- `.claude/skills/create-page-content/SKILL.md` を template 派生型に更新

---

## 受入条件（Definition of Done）

- [ ] 全 11 公開ページの `page.tsx` から `trailingSections.filter(...)` 排除
- [ ] `HomepageSections.tsx` / `getHomepagePublicData()` 削除
- [ ] `homepage-*` 4 type の registry 登録なし
- [ ] `PAGE_TEMPLATES` の各 template について unit test 全 pass
- [ ] 管理画面 `AddSectionDialog` が template に応じてフィルタされる
- [ ] 既存 home Page の section が新 type に rewrite され、視覚 regression が許容範囲
- [ ] `bun run validate` exit 0
- [ ] `bun run build` pass
- [ ] E2E smoke (Playwright): 11 ページ全部が 200 + render error 0

## 非対象（out of scope）

- ページテンプレート切替時の既存 Section の自動 rewrite UI（管理者が手動で section を整理する想定）
- 多言語対応（既存仕様維持）
- Section 内の動的 i18n
- Stripe / Better Auth / Cloudflare 等の外部統合への影響（無し）

## 参考

- 関連 ADR: `docs/architecture/decisions/0021-section-architecture-clean-break.md`（Section Architecture Phase B 撤回経緯）
- 公式パターン: Sanity / Payload / Contentful / WordPress Gutenberg（上記表参照）
- 関連 spec: `docs/superpowers/specs/2026-05-02-admin-page-editor-redesign-design.md`（PageHero → Section 統合の前例）
