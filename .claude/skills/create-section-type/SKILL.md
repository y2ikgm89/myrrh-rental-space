---
name: create-section-type
description: Use when explicitly adding a new section type. Scaffolds schema.ts, metadata.ts, public component stub, and registry entry.
when_to_use: 新しい Section type を Dynamic Section Architecture に追加するとき。明示的にユーザが invoke した場合のみ実行。
disable-model-invocation: true
user-invocable: true
argument-hint: "<type-name-kebab-case>"
---

# create-section-type

新しいセクションタイプ定義を file-based registry パターンでスキャフォールドする。

## 引数

`<type>` — kebab-case のセクションタイプ名 (例: `pricing-table`)

## 生成ファイル

### 1. `src/shared/lib/sections/definitions/<type>/schema.ts`

```typescript
import { z } from "zod";

import { field } from "../../field-registry";

export const <camelCase>ConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", { maxLength: 50, default: "<Title Case>" }),
  title: field.text("見出し", { maxLength: 100, default: "<日本語デフォルト>" }),
  // TODO: フィールドを追加
  // group 振り分け: "content" (default) / "design" / "advanced"
  // 例: variant: field.select("レイアウトの種類", { options: [...], default: "...", group: "design" }),
});
```

### 2. `src/shared/lib/sections/definitions/<type>/metadata.ts`

```typescript
import type { SectionMetadata } from "../../types";

export const <camelCase>Metadata: SectionMetadata = {
  label: "<日本語ラベル>",
  description: "<日本語説明>",
  icon: "IconSparkles", // @tabler/icons-react から適切なアイコンに変更
  category: "content",  // "hero" | "content" | "list" | "functional" | "media"
};
```

### 3. `src/app/(public)/_components/<PascalCase>Section.tsx`

```tsx
import type { <PascalCase>Config } from "@/shared/lib/validations/section";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import { parseSectionDesign } from "@/shared/lib/validations/section";

type Props = {
  config: <PascalCase>Config;
  design: unknown;
  section: { id: string; title: string | null; contentHtml: string; isActive: boolean };
};

export function <PascalCase>Section({ config, design, section }: Props) {
  const designParsed = parseSectionDesign(design);

  return (
    <SectionWrapper design={designParsed} sectionLabel={config.sectionLabel}>
      {/* TODO: セクションコンテンツを実装 */}
      <div className="text-center text-muted-foreground">
        <p>{config.title}</p>
      </div>
    </SectionWrapper>
  );
}
```

### 4. `src/shared/lib/sections/registry.ts` に追加

```typescript
import { <camelCase>ConfigSchema } from "./definitions/<type>/schema";
import { <camelCase>Metadata } from "./definitions/<type>/metadata";

// definitions Record に追加:
"<type>": {
  type: "<type>",
  configSchema: <camelCase>ConfigSchema,
  metadata: <camelCase>Metadata,
},
```

## 追加で必要な手動作業

1. **section.ts** — `SectionType` const に `<UPPER_SNAKE>: "<type>"` を追加（admin コンポーネントが参照）
2. **section.ts** — config スキーマの re-export と output 型エクスポートを追加
3. **section.ts** — `sectionConfigSchemas` マップにエントリ追加
4. **section-defaults.ts** — `defaultSectionConfigs` にデフォルト値追加
5. **section-defaults.ts** — `get<PascalCase>Config` getter 追加
6. **SectionRenderer.tsx** — switch case 追加
7. **section-metadata.ts** — labels/descriptions/icons/categories にエントリ追加（registry 移行完了まで）
8. **page-templates.ts** — 新規型を必ず分類する（**欠落で `page-templates.test.ts` の no-orphans test が fail**）:
   - **universal**（hero/cta/gallery/embed/concept 等のプレゼンテーション系、データ結合なし・どのページでも安全） → `UNIVERSAL_SECTION_TYPES` に追加（全テンプレに自動付与）
   - **page-specific**（listing/form/calendar/location-list 等、特定ページ専用 or 二重表示リスクあり） → 追加を許可するテンプレの `additionalSectionTypes` にのみ追加（universal には入れない、排他）

## 命名規則

| 入力 (kebab)    | schema 変数                | metadata 変数          | コンポーネント        |
| --------------- | -------------------------- | ---------------------- | --------------------- |
| `pricing-table` | `pricingTableConfigSchema` | `pricingTableMetadata` | `PricingTableSection` |
| `team-members`  | `teamMembersConfigSchema`  | `teamMembersMetadata`  | `TeamMembersSection`  |

## 検証

```bash
bun run type-check  # 型エラーなし
bun run validate    # lint 通過
```
