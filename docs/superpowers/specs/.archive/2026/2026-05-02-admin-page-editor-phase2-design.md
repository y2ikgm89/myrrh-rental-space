# Admin Page Editor Phase 2 — Field Decoration Extensions (Clean Break)

> 対象: フィールド装飾系の clean-break 拡張（ボタン統一 + 画像メタ構造化 + 動的 select）
> 作成: 2026-05-02
> ステータス: Draft（ユーザー承認待ち）
> 依存: Phase 1 (`9e96ebd2` まで完了)

## 背景・動機

Phase 1 で master-detail UI + page-hero 統合 + Section CRUD は完了したが、装飾系の以下が未対応:

1. **ボタン関連の二重実装**: `cta-and-url.ts` の `ctaButtonItemSchema` は `size/backgroundColor/textColor/ghost` を持つが、Phase 1 後の section schemas (cta/hero/hero-parallax/page-hero/homepage-cta) は `field.array` で独自に簡略版（text/url/variant/openInNewTab のみ）を持つ → 機能落差 + SSoT 違反
2. **画像メタが構造化されていない**: hero / hero-parallax / concept / testimonial の image 系フィールドは `String` のまま（alt 必須化・caption 任意化が未対応）。a11y / SEO 品質低下
3. **registry 外フィールド**: `post-list.categoryId` / `faq-list.categoryId` が field-registry を経由せず、AutoSectionForm で自動生成されない → SectionEditPanel で特殊扱い必要だが Phase 1 で deferred

## 方針: Clean Break（後方互換なし）

ユーザー指示: 破壊的変更可・公式準拠・後方互換性なし・推奨実装。

これに従い、以下を **同一 PR で一括実施**:

1. **ボタンスキーマ統一**: `cta-and-url.ts` の `ctaButtonItemSchema` factory を field-registry 経由で共有化 → 5 sections (cta/hero/hero-parallax/page-hero/homepage-cta) で一元利用
2. **legacy CTA 削除**: `ctaPrimary/ctaSecondary` + `transformLegacyCtaToButtons` + `transformCtaFields` + `createCtaSchemas` を完全削除（既存データはマイグレーションで `buttons[]` に変換）
3. **画像メタ構造化**: `String` 画像 URL を `{url, alt, caption?}` group に変換（4 sections × destructive Section.config JSON migration）
4. **動的 select**: `field.dynamicSelect()` 新ヘルパー + AutoSectionForm 経由の動的 options 注入（post-list / faq-list の categoryId 対応）
5. **公開側 renderer 更新**: 新フィールド (size/icon/bg/text color, image alt/caption) を反映

## ゴール

- 全 buttons[] フィールドで **size / iconName / 色** が編集可能
- 全画像フィールドが **{url, alt, caption?}** に構造化、a11y 必須化
- カテゴリ等の動的 options が **field-registry の標準パスで自動生成** される

---

## 設計詳細

### 1. ボタンスキーマ統一（A）

#### 1.1 共通 buttons factory

`cta-and-url.ts` の `createCtaButtonItemSchema` を field-registry 経由のヘルパーに転換:

```typescript
// src/shared/lib/sections/definitions/_shared/buttons.ts (新規)
import { z } from "zod";
import { fieldRegistry, field } from "../../field-registry";
import { createInternalAppRouteSchema } from "@/shared/lib/validations/cta-and-url";
import {
  ctaButtonVariants,
  ctaButtonSizes,
  optionalHexColorSchema,
} from "@/shared/lib/validations/cta-and-url";

/** Section schema 共通の buttons array スキーマ */
export function createButtonsArraySchema(label = "ボタン") {
  return field
    .array(label, {
      subGroup: "button",
      fields: {
        text: field.text("ボタンの文字", { maxLength: 50 }),
        url: createInternalAppRouteSchema(500).register(fieldRegistry, {
          fieldType: "url",
          label: "リンク先 URL",
          group: "content",
        }),
        variant: field.select("ボタンの種類", {
          options: ctaButtonVariants, // primary / secondary / outline / ghost
          default: "primary",
        }),
        size: field.select("ボタンの大きさ", {
          options: ctaButtonSizes, // sm / md / lg
          default: "lg",
        }),
        iconName: field.icon("アイコン（任意）", {
          helpText: "Tabler Icons の名前を入力（例: IconArrowRight）",
        }),
        openInNewTab: field.boolean("新しいタブで開く"),
        backgroundColor: optionalHexColorSchema.register(fieldRegistry, {
          fieldType: "color",
          label: "背景色（カスタム）",
          group: "content",
          helpText: "未設定の場合は variant 既定色",
        }),
        textColor: optionalHexColorSchema.register(fieldRegistry, {
          fieldType: "color",
          label: "文字色（カスタム）",
          group: "content",
          helpText: "未設定の場合は variant 既定色",
        }),
      },
    })
    .refine((arr) => new Set(arr.map((b) => b.url)).size === arr.length, {
      error: "同じ URL のボタンを複数登録することはできません",
    });
}
```

5 sections の buttons をこの factory に置き換え。

#### 1.2 Legacy CTA 削除

削除対象（`cta-and-url.ts`）:

- `createCtaSchemas` factory
- `transformLegacyCtaToButtons` function
- `transformCtaFields` function
- 旧 `ctaButtonSchema` / `optionalCtaButtonSchema`（factory 内）

`hero/schema.ts` / `cta/schema.ts` から legacy 吸収用の `.transform()` を削除（buttons[] 直接使用）。

#### 1.3 Tabler icon の Public 側描画

`@/public/components/design-system/button` を `iconName?: string` 受け入れに拡張:

```tsx
// IconRegistry: Tabler icon 名 → Component の static map
import * as TablerIcons from "@tabler/icons-react";

function resolveTablerIcon(name: string | undefined) {
  if (!name) return null;
  if (name in TablerIcons) {
    return TablerIcons[name as keyof typeof TablerIcons];
  }
  return null;
}
```

bundle size 影響: tree-shaking で実使用 icon のみ含まれる（ただし全 icon import 経由は警戒）。Phase 2 では一旦動的 lookup 採用、bundle 肥大化が問題なら Phase 3 で static allowlist に縛る。

### 2. 画像メタ構造化（B）

#### 2.1 対象セクション

| Section               | 旧フィールド                 | 新構造                                      |
| --------------------- | ---------------------------- | ------------------------------------------- |
| `hero`                | `backgroundImageUrl: String` | `backgroundImage: { url, alt, caption? }`   |
| `hero-parallax`       | `backgroundImageUrl: String` | `backgroundImage: { url, alt, caption? }`   |
| `concept`             | `imageUrl: String`           | `image: { url, alt, caption? }`             |
| `testimonial.items[]` | `authorImageUrl: String`     | `authorImage: { url, alt? }` (caption 不要) |

#### 2.2 共通 image factory

```typescript
// src/shared/lib/sections/definitions/_shared/image.ts (新規)
export function createImageGroupSchema(label = "画像") {
  return field.group(
    label,
    {
      url: field.image("画像 URL"),
      alt: field.text("代替テキスト（a11y / SEO 必須）", {
        helpText: "画像が読み込めない場合や読み上げ時に使用",
      }),
      caption: field.text("キャプション（任意）", {
        helpText: "画像下部に表示する説明文",
      }),
    },
    { subGroup: "image" },
  );
}

// caption 不要版
export function createCompactImageGroupSchema(label = "画像") {
  return field.group(
    label,
    {
      url: field.image("画像 URL"),
      alt: field.text("代替テキスト"),
    },
    { subGroup: "image" },
  );
}
```

#### 2.3 Migration（destructive）

`prisma/migrations/<TS>_section_image_meta_structuring/migration.sql`:

```sql
-- hero: backgroundImageUrl: string → backgroundImage: { url, alt: "" }
UPDATE sections SET config = jsonb_set(
  config - 'backgroundImageUrl',
  '{backgroundImage}',
  jsonb_build_object('url', config->>'backgroundImageUrl', 'alt', '', 'caption', '')
) WHERE type = 'hero' AND config ? 'backgroundImageUrl' AND config->>'backgroundImageUrl' <> '';

-- backgroundImageUrl が空文字 or null の hero: 単に列削除（backgroundImage は default で作成される）
UPDATE sections SET config = config - 'backgroundImageUrl'
WHERE type = 'hero' AND config ? 'backgroundImageUrl';

-- hero-parallax: 同様
UPDATE sections SET config = jsonb_set(
  config - 'backgroundImageUrl',
  '{backgroundImage}',
  jsonb_build_object('url', config->>'backgroundImageUrl', 'alt', '', 'caption', '')
) WHERE type = 'hero-parallax' AND config ? 'backgroundImageUrl' AND config->>'backgroundImageUrl' <> '';
UPDATE sections SET config = config - 'backgroundImageUrl'
WHERE type = 'hero-parallax' AND config ? 'backgroundImageUrl';

-- concept: imageUrl: string → image: { url, alt: "" }
UPDATE sections SET config = jsonb_set(
  config - 'imageUrl',
  '{image}',
  jsonb_build_object('url', config->>'imageUrl', 'alt', '', 'caption', '')
) WHERE type = 'concept' AND config ? 'imageUrl' AND config->>'imageUrl' <> '';
UPDATE sections SET config = config - 'imageUrl' WHERE type = 'concept' AND config ? 'imageUrl';

-- testimonial: items[].authorImageUrl: string → items[].authorImage: { url, alt: "" }
-- jsonb_path_query で配列全要素変換 — 複雑。Python 経由の bun -e スクリプトで処理するほうが安全
-- migration.sql には testimonial の transform を含めず、bun -e スクリプトで対応する代替案
```

testimonial の items 配列は jsonb_path 操作が複雑なため、`bun -e` データ migration スクリプト + commit に同梱する案を推奨（migration.sql は hero / hero-parallax / concept のみ）。

#### 2.4 公開側 renderer 更新

- `Hero` Component: `config.backgroundImageUrl` → `config.backgroundImage.url`、`alt={config.backgroundImage.alt}`、caption 表示（任意）
- `HeroParallax` Component: 同様
- `Concept` Component: 同様
- `Testimonial` Component: items[].authorImage.url

### 3. 動的 Select（C）

#### 3.1 `field.dynamicSelect()` 新ヘルパー

```typescript
// field-registry.ts
type DynamicSelectSource = "postCategories" | "faqCategories";

export interface FieldMeta {
  // ... 既存
  readonly dynamicSelectSource?: DynamicSelectSource;
}

export const field = {
  // ... 既存
  dynamicSelect(
    label: string,
    opts: {
      readonly source: DynamicSelectSource;
      readonly subGroup?: FieldSubGroup;
      readonly group?: FieldMeta["group"];
      readonly helpText?: string;
    },
  ) {
    return z
      .string()
      .uuid()
      .or(z.literal(""))
      .default("")
      .register(fieldRegistry, {
        fieldType: "select",
        label,
        group: opts.group ?? "content",
        dynamicSelectSource: opts.source,
        ...(opts.subGroup !== undefined && { subGroup: opts.subGroup }),
        ...(opts.helpText !== undefined && { helpText: opts.helpText }),
      });
  },
};
```

#### 3.2 AutoSectionForm 側の処理

- `FieldInfo.meta.dynamicSelectSource` が `"postCategories"` の場合、props 経由で渡された `dynamicOptions.postCategories` を Select の options に注入
- `SectionEditPanel` で section.type が post-list / faq-list の場合、SC fetch で categories を取得して props 経由で AutoSectionForm に渡す

```typescript
// SectionEditPanel.tsx
const dynamicOptions = useDynamicSectionOptions(section.type);

<AutoSectionForm
  ...
  dynamicOptions={dynamicOptions}
/>

// useDynamicSectionOptions: useEffect で fetch、または親で SC fetch + props
```

実装簡素化: 親 PageEditor で全 dynamic options を一括 fetch（home/managed page 編集時の load 時 1 回）。

#### 3.3 post-list / faq-list schema 更新

```typescript
// definitions/post-list/schema.ts
categoryId: field.dynamicSelect("カテゴリで絞り込み", {
  source: "postCategories",
  subGroup: "other",
  helpText: "未指定の場合、全カテゴリの記事を表示",
}),

// definitions/faq-list/schema.ts (もし categoryId あれば)
categoryId: field.dynamicSelect("カテゴリで絞り込み", {
  source: "faqCategories",
  subGroup: "other",
}),
```

### 4. 削除対象（cleanup）

`src/shared/lib/validations/cta-and-url.ts` から削除:

- `createCtaSchemas` factory
- `transformLegacyCtaToButtons` function
- `transformCtaFields` function

`section.ts` から削除:

- `heroConfigSchema` / `ctaConfigSchema` の `.transform()` chain
- `import { transformLegacyCtaToButtons }` 等

### 5. 公式準拠

| 項目                    | 公式準拠先                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Zod 4 metadata registry | [Zod 4 docs](https://zod.dev/?id=metadata-registry)                                                    |
| Prisma data migration   | [Prisma SQL migration](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations) |
| Tabler Icons usage      | [Tabler React docs](https://tabler.io/icons/usage)                                                     |
| Postgres JSONB UPDATE   | [PostgreSQL JSON Functions](https://www.postgresql.org/docs/current/functions-json.html)               |

### 6. リスク

| リスク                                                                         | 影響             | 対策                                                        |
| ------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------- |
| Tabler Icons 全 import で bundle 肥大化                                        | First Load JS 増 | Phase 2 では動的 lookup、Phase 3 で allowlist 縮小          |
| Migration の jsonb_set が既存データを壊す                                      | 公開ページ崩壊   | dev DB で smoke test 必須、`AND config ? 'X'` の guard 完全 |
| testimonial の items 配列変換が SQL では困難                                   | Migration 失敗   | `bun -e` スクリプトに分離、commit に同梱                    |
| `dynamicOptions` props が AutoSectionForm の signature に追加 → 全 caller 影響 | wide change      | optional prop で migration、未指定なら従来通り              |

### 7. 計画される commit 分割

#### Phase 2A: ボタン統一

1. `feat(sections): add createButtonsArraySchema shared factory + drop legacy CTA helpers`
2. `refactor(sections): unify 5 sections to use createButtonsArraySchema`
3. `feat(public): Button primitive consumes size/iconName/backgroundColor/textColor`
4. `feat(prisma): migration — convert legacy ctaPrimary/ctaSecondary to buttons[]`

#### Phase 2B: 画像メタ統一

5. `feat(sections): add createImageGroupSchema shared factory`
6. `refactor(sections): structure single-string images into image group (4 sections)`
7. `refactor(public): image renderers consume {url, alt, caption}`
8. `feat(prisma): migration — convert string image fields to {url, alt} groups`

#### Phase 2C: 動的 Select

9. `feat(field-registry): add field.dynamicSelect helper + dynamicSelectSource meta`
10. `feat(page-edit): SectionEditPanel fetches dynamic options (postCategories/faqCategories)`
11. `feat(auto-section-form): consume dynamicOptions for select rendering`
12. `refactor(sections): post-list / faq-list categoryId via field.dynamicSelect`

#### Phase 2D: テスト + cleanup

13. `test(sections): button factory + image factory + dynamicSelect tests`
14. `chore(cleanup): final dead code removal in cta-and-url.ts`

合計 14 commits（plan で粒度再調整可）。

---

## Out of Scope（次回 spec へ）

- ❌ レイアウト統一（全セクション padding / containerWidth 標準化）
- ❌ visibility 制御（hideOnMobile/Desktop, animateOnScroll）
- ❌ Tabler Icons の static allowlist による bundle 削減（Phase 3）
- ❌ live preview iframe / autosave / スケジュール公開
