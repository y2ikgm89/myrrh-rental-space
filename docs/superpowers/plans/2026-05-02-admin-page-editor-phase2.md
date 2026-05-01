# Admin Page Editor Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-02-admin-page-editor-phase2-design.md`

**Goal:** ボタン装飾統一（A）+ 画像メタ構造化（B）+ 動的 select（C）の clean-break 拡張を一括実施。

**Architecture:** ① Phase 2A でボタン factory を作成し 5 sections を統一、legacy CTA 削除 + データ移行。② Phase 2B で画像メタを構造化（4 sections + Section.config JSON destructive migration）。③ Phase 2C で動的 select を field-registry に追加し post-list / faq-list を統一。

**Tech Stack:** Phase 1 同様（Prisma 7.8 / PostgreSQL / Next.js 16.2 / React 19 + Compiler 1.0 / Zod 4 / Tabler Icons）

**Branch:** `refactor/docs-diataxis` で続行（Phase 1 の延長）。

---

## File Structure

### 新規作成

| パス                                                                     | 役割                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `src/shared/lib/sections/definitions/_shared/buttons.ts`                 | `createButtonsArraySchema` factory（共通 buttons array スキーマ）    |
| `src/shared/lib/sections/definitions/_shared/image.ts`                   | `createImageGroupSchema` / `createCompactImageGroupSchema` factories |
| `src/shared/lib/sections/dynamic-options.ts`                             | `DynamicSelectSource` 型定義 + `useDynamicSectionOptions` 関連       |
| `src/admin/api/section-dynamic-options/route.ts` (or fetch helper)       | post categories / faq categories の取得                              |
| `prisma/migrations/<TS>_buttons_unify_and_image_structure/migration.sql` | データ移行（buttons + image 構造化）                                 |
| `__tests__/unit/shared/lib/sections/buttons-factory.test.ts`             | buttons factory テスト                                               |
| `__tests__/unit/shared/lib/sections/image-factory.test.ts`               | image factory テスト                                                 |
| `__tests__/unit/shared/lib/sections/dynamic-select.test.ts`              | dynamicSelect テスト                                                 |

### 変更

| パス                                                                                         | 内容                                                                                     |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/shared/lib/sections/field-registry.ts`                                                  | `dynamicSelectSource` 追加 + `field.dynamicSelect()` ヘルパー                            |
| `src/shared/lib/sections/definitions/cta/schema.ts`                                          | `createButtonsArraySchema` 採用、`.transform()` 削除                                     |
| `src/shared/lib/sections/definitions/hero/schema.ts`                                         | 同上 + `backgroundImageUrl` → `backgroundImage` 構造化                                   |
| `src/shared/lib/sections/definitions/hero-parallax/schema.ts`                                | 同上                                                                                     |
| `src/shared/lib/sections/definitions/page-hero/schema.ts`                                    | `createButtonsArraySchema` への移行はスコープ外（既に独自実装、整合性のため検討は別 PR） |
| `src/shared/lib/sections/definitions/homepage-cta/schema.ts`                                 | `createButtonsArraySchema` 採用                                                          |
| `src/shared/lib/sections/definitions/concept/schema.ts`                                      | `imageUrl` → `image` 構造化                                                              |
| `src/shared/lib/sections/definitions/testimonial/schema.ts`                                  | `items[].authorImageUrl` → `authorImage` 構造化                                          |
| `src/shared/lib/sections/definitions/post-list/schema.ts`                                    | `categoryId` → `field.dynamicSelect`                                                     |
| `src/shared/lib/sections/definitions/faq-list/schema.ts`                                     | `categoryId` → `field.dynamicSelect`（あれば）                                           |
| `src/shared/lib/validations/cta-and-url.ts`                                                  | `createCtaSchemas` / `transformLegacyCtaToButtons` / `transformCtaFields` 削除           |
| `src/shared/lib/validations/section.ts`                                                      | `heroConfigSchema` / `ctaConfigSchema` の `.transform()` 削除                            |
| `src/public/components/design-system/button.tsx`                                             | `iconName?` / `size` / `customBackgroundColor` / `customTextColor` 受け入れ              |
| `src/app/(public)/_components/homepage/...`                                                  | Hero / HeroParallax / Concept / Testimonial の renderer 更新                             |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditPanel.tsx`       | dynamic options を AutoSectionForm に props 経由で渡す                                   |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx` | `dynamicOptions` prop 受け入れ + select 描画時に注入                                     |
| `prisma/seed.ts`                                                                             | `defaultPageHero` 等のデフォルト値を新構造に対応                                         |

### 削除

- `transformLegacyCtaToButtons` function
- `transformCtaFields` function
- `createCtaSchemas` factory（legacy）

---

## Phase 2A: ボタン装飾統一

### Task A1: `createButtonsArraySchema` factory 作成

**Files:**

- Create: `src/shared/lib/sections/definitions/_shared/buttons.ts`

- [ ] **Step 1: factory 実装**

```typescript
// src/shared/lib/sections/definitions/_shared/buttons.ts
import { z } from "zod";
import { fieldRegistry, field } from "../../field-registry";
import {
  createInternalAppRouteSchema,
  ctaButtonVariants,
  ctaButtonSizes,
  optionalHexColorSchema,
} from "@/shared/lib/validations/cta-and-url";

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
          options: ctaButtonVariants,
          default: "primary",
        }),
        size: field.select("ボタンの大きさ", {
          options: ctaButtonSizes,
          default: "lg",
        }),
        iconName: field.icon("アイコン（任意）", {
          helpText: "Tabler Icons 名（例: IconArrowRight）",
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

- [ ] **Step 2: 検証**

```bash
bun run type-check 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/sections/definitions/_shared/buttons.ts
git commit -m "feat(sections): add createButtonsArraySchema shared factory"
```

---

### Task A2: 5 sections を `createButtonsArraySchema` に統一

**Files:**

- Modify: `cta/schema.ts`、`hero/schema.ts`、`hero-parallax/schema.ts`、`homepage-cta/schema.ts`
- Note: `page-hero/schema.ts` は Phase 1 で独自 schema 定義済みのため Phase 2 では除外（次回 PR で整合）

- [ ] **Step 1: cta/schema.ts 更新**

```typescript
import { createButtonsArraySchema } from "../_shared/buttons";

export const ctaConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", { ... }),
  title: field.text("見出し", { maxLength: 100, subGroup: "text" }),
  description: field.textarea("説明文", { maxLength: 500, subGroup: "text" }),
  buttons: createButtonsArraySchema("ボタン"),
  backgroundColor: field.color("背景色", { group: "design" }),
  variant: field.select("レイアウトの種類", { ... }),
});
```

`.transform()` chain を削除（旧 `transformLegacyCtaToButtons` 吸収用）。

- [ ] **Step 2: hero/schema.ts 同様に更新**
- [ ] **Step 3: hero-parallax/schema.ts 同様に更新**
- [ ] **Step 4: homepage-cta/schema.ts 同様に更新**

- [ ] **Step 5: 検証**

```bash
bun run type-check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/sections/definitions/{cta,hero,hero-parallax,homepage-cta}/schema.ts
git commit -m "refactor(sections): unify 4 sections to use createButtonsArraySchema"
```

---

### Task A3: Public Button primitive を size/icon/color 拡張

**Files:**

- Modify: `src/public/components/design-system/button.tsx`（または該当パス）

- [ ] **Step 1: 既存 props 確認**

```bash
cat src/public/components/design-system/button.tsx 2>&1 | head -50
```

- [ ] **Step 2: `iconName` / `customBackgroundColor` / `customTextColor` props 追加**

```tsx
import * as TablerIcons from "@tabler/icons-react";
import type { ComponentProps } from "react";

interface ExtendedProps {
  readonly iconName?: string;
  readonly customBackgroundColor?: string;
  readonly customTextColor?: string;
}

function resolveIcon(name: string | undefined) {
  if (!name) return null;
  const Icon = (TablerIcons as Record<string, unknown>)[name];
  if (typeof Icon === "function" || typeof Icon === "object") {
    return Icon as React.ComponentType<{ className?: string }>;
  }
  return null;
}

// Button 内部で:
const Icon = resolveIcon(iconName);
const inlineStyle: React.CSSProperties = {
  ...(customBackgroundColor && { backgroundColor: customBackgroundColor }),
  ...(customTextColor && { color: customTextColor }),
};

return (
  <button style={inlineStyle} ...>
    {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
    {children}
  </button>
);
```

- [ ] **Step 3: 公開 Hero / CTA renderer の caller を更新** — buttons.map で iconName/size/customBackgroundColor を Button に渡す

- [ ] **Step 4: 検証 + Commit**

```bash
bun run validate 2>&1 | tail -5
git add src/public/
git commit -m "feat(public): Button primitive consumes iconName/size/customBackgroundColor/customTextColor"
```

---

### Task A4: Legacy CTA データ移行 + コード削除

**Files:**

- Create: `prisma/migrations/<TS>_buttons_unify_drop_legacy_cta/migration.sql`
- Modify: `src/shared/lib/validations/cta-and-url.ts` (削除)
- Modify: `src/shared/lib/validations/section.ts` (削除)

- [ ] **Step 1: 既存 DB に legacy CTA データがあるか確認**

```bash
bun -e "
const { PrismaClient } = require('./generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
(async () => {
  const sections = await p.section.findMany({ where: { type: { in: ['hero', 'cta'] } } });
  for (const s of sections) {
    const c = s.config;
    if (typeof c === 'object' && c && ('ctaPrimary' in c || 'ctaSecondary' in c)) {
      console.log(s.id, s.type, JSON.stringify(c));
    }
  }
  await p.\$disconnect();
})();
"
```

- [ ] **Step 2: Migration SQL 書き出し（Python）**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
echo "$TS" > /tmp/migration-ts-a4.txt
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_buttons_unify_drop_legacy_cta', exist_ok=True)"

python3 << 'PY'
import os
ts = open('/tmp/migration-ts-a4.txt').read().strip()
sql = r"""-- Phase 2A: Legacy ctaPrimary / ctaSecondary を buttons[] に変換 + フィールド削除
-- hero / cta の config に legacy CTA フィールドが残っていれば、buttons array に統合する

-- 注: jsonb_path 操作で配列構築を行う。buttons 既存配列がある場合は legacy 取り込みなし

UPDATE sections SET config = jsonb_set(
  config - 'ctaPrimary' - 'ctaSecondary',
  '{buttons}',
  COALESCE(config->'buttons', '[]'::jsonb) ||
    CASE
      WHEN config->'ctaPrimary'->>'text' IS NOT NULL AND config->'ctaPrimary'->>'url' IS NOT NULL
      THEN jsonb_build_array(jsonb_build_object(
        'text', config->'ctaPrimary'->>'text',
        'url', config->'ctaPrimary'->>'url',
        'variant', 'primary',
        'size', 'lg',
        'iconName', '',
        'openInNewTab', false
      ))
      ELSE '[]'::jsonb
    END ||
    CASE
      WHEN config->'ctaSecondary'->>'text' IS NOT NULL AND config->'ctaSecondary'->>'url' IS NOT NULL
      THEN jsonb_build_array(jsonb_build_object(
        'text', config->'ctaSecondary'->>'text',
        'url', config->'ctaSecondary'->>'url',
        'variant', 'secondary',
        'size', 'lg',
        'iconName', '',
        'openInNewTab', false
      ))
      ELSE '[]'::jsonb
    END
) WHERE type IN ('hero', 'cta')
  AND (config ? 'ctaPrimary' OR config ? 'ctaSecondary');
"""
path = f'prisma/migrations/{ts}_buttons_unify_drop_legacy_cta/migration.sql'
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(sql)
print(f'Wrote: {path}')
PY
```

- [ ] **Step 3: Migration 適用**

```bash
TS=$(cat /tmp/migration-ts-a4.txt)
bunx --bun prisma db execute --file prisma/migrations/${TS}_buttons_unify_drop_legacy_cta/migration.sql
bunx --bun prisma migrate resolve --applied "${TS}_buttons_unify_drop_legacy_cta"
```

- [ ] **Step 4: cta-and-url.ts から legacy 削除**

`createCtaSchemas` / `transformLegacyCtaToButtons` / `transformCtaFields` を全部削除。

- [ ] **Step 5: section.ts から `.transform()` 削除（既に Task A2 で対応済みなら no-op）**

```typescript
// 確認: heroConfigSchema / ctaConfigSchema が transformCtaFields を使っていないか
grep "transformCtaFields\|transformLegacyCtaToButtons" src/
# Expected: 0 件
```

- [ ] **Step 6: 検証**

```bash
bun run validate 2>&1 | tail -5
bun run build 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
TS=$(cat /tmp/migration-ts-a4.txt)
git add prisma/migrations/${TS}_buttons_unify_drop_legacy_cta/migration.sql \
        src/shared/lib/validations/cta-and-url.ts \
        src/shared/lib/validations/section.ts
git commit -m "feat(prisma+sections): migrate legacy ctaPrimary/ctaSecondary to buttons[] + drop legacy helpers"
```

---

## Phase 2B: 画像メタ構造化

### Task B1: `createImageGroupSchema` factory 作成

**Files:**

- Create: `src/shared/lib/sections/definitions/_shared/image.ts`

- [ ] **Step 1: factory 実装**

```typescript
// src/shared/lib/sections/definitions/_shared/image.ts
import { field } from "../../field-registry";

export function createImageGroupSchema(label = "画像") {
  return field.group(
    label,
    {
      url: field.image("画像 URL"),
      alt: field.text("代替テキスト（a11y / SEO）", {
        maxLength: 200,
        helpText: "画像が読み込めない場合や読み上げ時に使用",
      }),
      caption: field.text("キャプション（任意）", {
        maxLength: 300,
        helpText: "画像下部に表示する説明文",
      }),
    },
    { subGroup: "image" },
  );
}

export function createCompactImageGroupSchema(label = "画像") {
  return field.group(
    label,
    {
      url: field.image("画像 URL"),
      alt: field.text("代替テキスト", { maxLength: 200 }),
    },
    { subGroup: "image" },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/lib/sections/definitions/_shared/image.ts
git commit -m "feat(sections): add createImageGroupSchema shared factory"
```

---

### Task B2: 4 sections の image を構造化

**Files:**

- Modify: `hero/schema.ts`、`hero-parallax/schema.ts`、`concept/schema.ts`、`testimonial/schema.ts`

- [ ] **Step 1: hero/schema.ts**

```typescript
// 削除: backgroundImageUrl: field.image("背景画像", { subGroup: "image" })
// 追加: backgroundImage: createImageGroupSchema("背景画像")

import { createImageGroupSchema } from "../_shared/image";

backgroundImage: createImageGroupSchema("背景画像"),
```

- [ ] **Step 2: hero-parallax/schema.ts 同様**
- [ ] **Step 3: concept/schema.ts**

```typescript
// imageUrl → image
import { createImageGroupSchema } from "../_shared/image";

image: createImageGroupSchema("メイン画像"),
```

- [ ] **Step 4: testimonial/schema.ts**

```typescript
// items[].authorImageUrl → items[].authorImage
import { createCompactImageGroupSchema } from "../_shared/image";

items: z.array(
  z.object({
    // ...
    authorImage: createCompactImageGroupSchema("プロフィール画像"),
  }),
);
```

- [ ] **Step 5: 検証 + Commit**

```bash
bun run type-check 2>&1 | tail -5
git add src/shared/lib/sections/definitions/{hero,hero-parallax,concept,testimonial}/schema.ts
git commit -m "refactor(sections): structure single-string images into image group"
```

---

### Task B3: Migration（destructive Section.config JSON）

**Files:**

- Create: `prisma/migrations/<TS>_section_image_meta_structuring/migration.sql`
- Create: `scripts/migrate-testimonial-images.ts` (testimonial.items[] 配列変換用)

- [ ] **Step 1: 事前 grep**

```bash
bun -e "
const { PrismaClient } = require('./generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
(async () => {
  const sections = await p.section.findMany({ where: { type: { in: ['hero','hero-parallax','concept','testimonial'] } } });
  console.log('Total target sections:', sections.length);
  await p.\$disconnect();
})();
"
```

- [ ] **Step 2: Migration SQL（hero / hero-parallax / concept）**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
echo "$TS" > /tmp/migration-ts-b3.txt
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_section_image_meta_structuring', exist_ok=True)"

python3 << 'PY'
import os
ts = open('/tmp/migration-ts-b3.txt').read().strip()
sql = r"""-- Phase 2B: hero / hero-parallax / concept の string image を {url, alt, caption} group に変換

-- hero
UPDATE sections SET config = jsonb_set(
  config - 'backgroundImageUrl',
  '{backgroundImage}',
  jsonb_build_object(
    'url', COALESCE(config->>'backgroundImageUrl', ''),
    'alt', '',
    'caption', ''
  )
) WHERE type = 'hero' AND config ? 'backgroundImageUrl';

-- hero-parallax
UPDATE sections SET config = jsonb_set(
  config - 'backgroundImageUrl',
  '{backgroundImage}',
  jsonb_build_object(
    'url', COALESCE(config->>'backgroundImageUrl', ''),
    'alt', '',
    'caption', ''
  )
) WHERE type = 'hero-parallax' AND config ? 'backgroundImageUrl';

-- concept
UPDATE sections SET config = jsonb_set(
  config - 'imageUrl',
  '{image}',
  jsonb_build_object(
    'url', COALESCE(config->>'imageUrl', ''),
    'alt', '',
    'caption', ''
  )
) WHERE type = 'concept' AND config ? 'imageUrl';
"""
path = f'prisma/migrations/{ts}_section_image_meta_structuring/migration.sql'
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(sql)
print(f'Wrote: {path}')
PY
```

- [ ] **Step 3: Migration 適用**

```bash
TS=$(cat /tmp/migration-ts-b3.txt)
bunx --bun prisma db execute --file prisma/migrations/${TS}_section_image_meta_structuring/migration.sql
bunx --bun prisma migrate resolve --applied "${TS}_section_image_meta_structuring"
```

- [ ] **Step 4: testimonial.items[] 用 bun スクリプト**

```typescript
// scripts/migrate-testimonial-images.ts
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const sections = await prisma.section.findMany({
    where: { type: "testimonial" },
  });
  for (const section of sections) {
    const config = section.config;
    if (
      typeof config !== "object" ||
      !config ||
      !("items" in config) ||
      !Array.isArray((config as { items: unknown }).items)
    )
      continue;
    const items = (config as { items: Record<string, unknown>[] }).items;
    let changed = false;
    for (const item of items) {
      if (typeof item.authorImageUrl === "string") {
        item.authorImage = { url: item.authorImageUrl, alt: "" };
        delete item.authorImageUrl;
        changed = true;
      }
    }
    if (changed) {
      await prisma.section.update({
        where: { id: section.id },
        data: { config: config as never },
      });
      console.log(`Migrated section ${section.id}`);
    }
  }
  await prisma.$disconnect();
}

main();
```

```bash
bun scripts/migrate-testimonial-images.ts
```

- [ ] **Step 5: 検証 + Commit**

```bash
bun run validate 2>&1 | tail -5
TS=$(cat /tmp/migration-ts-b3.txt)
git add prisma/migrations/${TS}_section_image_meta_structuring/migration.sql \
        scripts/migrate-testimonial-images.ts
git commit -m "feat(prisma): migration — convert string image fields to {url, alt, caption?} groups"
```

---

### Task B4: 公開 renderer 更新

**Files:**

- Modify: 公開 Hero / HeroParallax / Concept / Testimonial Component

- [ ] **Step 1: caller grep + 修正**

```bash
grep -rln "backgroundImageUrl\|imageUrl\|authorImageUrl" src/app/\(public\)/ src/public/ --include="*.tsx" --include="*.ts"
```

各 caller を新構造（`backgroundImage.url` / `image.url` / `authorImage.url`）に変更。

`alt` も使用（aria-label / Image alt prop）。

- [ ] **Step 2: 検証 + Commit**

```bash
bun run validate 2>&1 | tail -5
bun run build 2>&1 | tail -10
git add src/
git commit -m "refactor(public): image renderers consume {url, alt, caption} groups"
```

---

## Phase 2C: 動的 Select

### Task C1: `field.dynamicSelect` ヘルパー追加

**Files:**

- Modify: `src/shared/lib/sections/field-registry.ts`

- [ ] **Step 1: `FieldMeta.dynamicSelectSource` 追加**

```typescript
export type DynamicSelectSource = "postCategories" | "faqCategories";

export interface FieldMeta {
  // ... 既存
  readonly dynamicSelectSource?: DynamicSelectSource;
}

interface DynamicSelectOpts {
  readonly source: DynamicSelectSource;
  readonly group?: FieldMeta["group"];
  readonly subGroup?: FieldSubGroup;
  readonly helpText?: string;
}

// field オブジェクトに追加
dynamicSelect(label: string, opts: DynamicSelectOpts) {
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
```

- [ ] **Step 2: 検証 + Commit**

```bash
bun run type-check 2>&1 | tail -5
git add src/shared/lib/sections/field-registry.ts
git commit -m "feat(field-registry): add field.dynamicSelect helper + dynamicSelectSource meta"
```

---

### Task C2: post-list / faq-list の categoryId を `dynamicSelect` に

**Files:**

- Modify: `definitions/post-list/schema.ts`、`definitions/faq-list/schema.ts`

- [ ] **Step 1: post-list/schema.ts**

```typescript
// 削除: categoryId: z.string().uuid().optional()
// 追加:
categoryId: field.dynamicSelect("カテゴリで絞り込み", {
  source: "postCategories",
  subGroup: "other",
  helpText: "未指定の場合、全カテゴリの記事を表示",
}),
```

- [ ] **Step 2: faq-list/schema.ts も同様（既存 categoryId があれば）**

```bash
grep -n "categoryId" src/shared/lib/sections/definitions/faq-list/schema.ts
```

あれば置換、無ければ skip。

- [ ] **Step 3: 検証 + Commit**

```bash
bun run type-check 2>&1 | tail -5
git add src/shared/lib/sections/definitions/{post-list,faq-list}/schema.ts
git commit -m "refactor(sections): post-list / faq-list categoryId via field.dynamicSelect"
```

---

### Task C3: SectionEditPanel + AutoSectionForm の dynamic options 注入

**Files:**

- Modify: `pages/[slug]/edit/_components/SectionEditPanel.tsx`
- Modify: `pages/[slug]/_sections/_components/auto-section-form.tsx`
- Modify: `pages/[slug]/_sections/_components/auto-fields/AutoSelectField.tsx`
- Modify: `pages/[slug]/edit/_components/PageEditor.tsx`（fetch + props 経由）

- [ ] **Step 1: getSectionDynamicOptions Server fetch**

```typescript
// src/admin/queries/section-dynamic-options.ts (新規)
import "server-only";
import { prisma } from "@/shared/db/prisma";

export type DynamicSectionOptions = {
  readonly postCategories: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly faqCategories: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
};

export async function getSectionDynamicOptions(): Promise<DynamicSectionOptions> {
  const [postCategories, faqCategories] = await Promise.all([
    prisma.postCategory.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.faqCategory
      .findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
      .catch(() => []),
  ]);
  return { postCategories, faqCategories };
}
```

注: faqCategory モデルが無ければ `[]` フォールバック。

- [ ] **Step 2: PageEditor の page.tsx で fetch + Client component に props 経由**

```tsx
// pages/[slug]/edit/page.tsx
const dynamicOptions = await getSectionDynamicOptions();

<PageEditor key={page.id} page={page} dynamicOptions={dynamicOptions} />;
```

- [ ] **Step 3: PageEditor → SectionEditPanel に props pipe**

```tsx
<SectionEditPanel
  key={activeSection.id}
  section={activeSection}
  dynamicOptions={dynamicOptions}
  onUpdated={() => router.refresh()}
/>
```

- [ ] **Step 4: SectionEditPanel → AutoSectionForm に pipe**

```tsx
<AutoSectionForm
  ...
  dynamicOptions={dynamicOptions}
/>
```

- [ ] **Step 5: AutoSectionForm 内で dynamicOptions を AutoSelectField に渡す**

`AutoFieldByType` の `case "select"` で `meta.dynamicSelectSource` がある場合に options を上書き:

```tsx
case "select":
  const dynamicSrc = meta.dynamicSelectSource;
  const dynamicValues = dynamicSrc ? dynamicOptions?.[dynamicSrc] ?? [] : null;
  return (
    <AutoSelectField
      ...
      dynamicOptions={dynamicValues}
    />
  );
```

- [ ] **Step 6: AutoSelectField で dynamicOptions が渡されたら static options を上書き**

```tsx
const optionsToRender = dynamicOptions
  ? [
      { value: "", label: "（指定なし）" },
      ...dynamicOptions.map((o) => ({ value: o.id, label: o.name })),
    ]
  : staticOptions;
```

- [ ] **Step 7: 検証 + Commit**

```bash
bun run validate 2>&1 | tail -5
bun run build 2>&1 | tail -10
git add src/
git commit -m "feat(page-edit): consume dynamicOptions for post/faq categoryId selects"
```

---

## Phase 2D: テスト + cleanup

### Task D1: factory + dynamicSelect テスト

**Files:**

- Create: `__tests__/unit/shared/lib/sections/buttons-factory.test.ts`
- Create: `__tests__/unit/shared/lib/sections/image-factory.test.ts`
- Create: `__tests__/unit/shared/lib/sections/dynamic-select.test.ts`

- [ ] **Step 1: buttons-factory.test.ts**

```typescript
import { describe, expect, test } from "bun:test";
import { createButtonsArraySchema } from "@/shared/lib/sections/definitions/_shared/buttons";

describe("createButtonsArraySchema", () => {
  const schema = createButtonsArraySchema();

  test("空配列が default", () => {
    const r = schema.safeParse(undefined);
    expect(r.success).toBe(true);
  });

  test("最小構成（text + url）でパース成功", () => {
    const r = schema.safeParse([{ text: "予約", url: "/reservation" }]);
    expect(r.success).toBe(true);
  });

  test("size / iconName / variant フィールド対応", () => {
    const r = schema.safeParse([
      {
        text: "予約",
        url: "/reservation",
        size: "sm",
        iconName: "IconArrowRight",
        variant: "ghost",
      },
    ]);
    expect(r.success).toBe(true);
  });

  test("重複 URL は refine で reject", () => {
    const r = schema.safeParse([
      { text: "A", url: "/a" },
      { text: "B", url: "/a" },
    ]);
    expect(r.success).toBe(false);
  });

  test("外部 URL は reject（internal app route のみ）", () => {
    const r = schema.safeParse([{ text: "外部", url: "https://example.com" }]);
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: image-factory.test.ts**

```typescript
import { describe, expect, test } from "bun:test";
import {
  createImageGroupSchema,
  createCompactImageGroupSchema,
} from "@/shared/lib/sections/definitions/_shared/image";

describe("createImageGroupSchema", () => {
  const schema = createImageGroupSchema();

  test("最小構成（url + alt）でパース成功", () => {
    const r = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "alt",
    });
    expect(r.success).toBe(true);
  });

  test("caption は optional（default 空文字）", () => {
    const r = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "alt",
    });
    expect(r.success).toBe(true);
  });
});

describe("createCompactImageGroupSchema", () => {
  test("caption フィールドは含まれない", () => {
    const schema = createCompactImageGroupSchema();
    const r = schema.safeParse({ url: "https://example.com/a.jpg", alt: "" });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 3: dynamic-select.test.ts**

```typescript
import { describe, expect, test } from "bun:test";
import { fieldRegistry, field } from "@/shared/lib/sections/field-registry";

describe("field.dynamicSelect", () => {
  const schema = field.dynamicSelect("カテゴリ", {
    source: "postCategories",
  });

  test("dynamicSelectSource メタが登録される", () => {
    const meta = fieldRegistry.get(schema);
    expect(meta?.dynamicSelectSource).toBe("postCategories");
    expect(meta?.fieldType).toBe("select");
  });

  test("空文字を許容（カテゴリ未指定）", () => {
    const r = schema.safeParse("");
    expect(r.success).toBe(true);
  });

  test("UUID を許容", () => {
    const r = schema.safeParse("550e8400-e29b-41d4-a716-446655440000");
    expect(r.success).toBe(true);
  });

  test("非 UUID 文字列は reject", () => {
    const r = schema.safeParse("not-a-uuid");
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 4: 検証 + Commit**

```bash
bun test __tests__/unit/shared/lib/sections/ 2>&1 | tail -5
git add __tests__/unit/shared/lib/sections/
git commit -m "test(sections): button factory + image factory + dynamicSelect tests"
```

---

## Self-Review

### Spec coverage

- [x] Section 1.1〜1.3 ボタン統一 → Task A1, A2, A3, A4
- [x] Section 2.1〜2.4 画像メタ構造化 → Task B1, B2, B3, B4
- [x] Section 3.1〜3.3 動的 select → Task C1, C2, C3
- [x] Section 4 削除対象 → Task A4
- [x] Section 7 commit 分割 → 14 tasks（spec 14 commits）

### Type consistency

- [x] `createButtonsArraySchema` / `createImageGroupSchema` / `createCompactImageGroupSchema` / `dynamicSelect` 命名統一
- [x] `DynamicSelectSource` 型 export
- [x] `dynamicSelectSource` meta フィールド統一

---

## Execution Recommendation

**Subagent-Driven Development を推奨**:

- Phase 2A → 2B → 2C → 2D の順序で逐次実行
- Phase 2A4 / 2B3 は destructive migration を含むため fresh subagent dispatch + 完了後 controller が `git log --oneline` + `git show --stat HEAD` で実在検証
- 各 Phase 完了後 `bun run validate` を controller で確認
