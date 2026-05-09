# Portable Text Phase 4: Long-form textarea → PortableTextBlock[] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Section の長文 textarea 14 fields × 11 sections を `PortableTextBlock[]` に統一し、Lexical wrapper editor (`PortableTextBlockEditor`) で編集 / 公開ページで `<PortableText>` SC 描画する。

**Architecture:** Sanity Portable Text 公式 spec 準拠の `_type: "block"` discriminated block array を SSoT とし、Lexical EditorState ↔ PortableTextBlock[] 双方向 serializer で既存 Lexical エコシステムを流用。`field.textarea` → `field.portableTextBlock` への schema 切替 + DB migration（PL/pgSQL で改行を block 分割）+ AutoSectionForm dispatch + 14 consumer 公開描画切替。`embed.embedCode` のみ HTML/iframe 埋込のため textarea 維持。

**Tech Stack:** Zod 4 discriminated union / Lexical 0.36 (`@lexical/react`) / PostgreSQL 16 jsonb + PL/pgSQL / TypeScript 6.0 / React 19 Server Components.

**Spec:** `docs/superpowers/specs/2026-05-09-section-rich-label-architecture.md` の Phase 4 セクション

**Phase 0/1/2/3 の前例:**

- Phase 0: `260ab928` → `72dd37a6` (5 commits)
- Phase 1: `aeef153c` → `cc5be1e6` (7 commits)
- Phase 2: `3ab88a39` → `e3620f33` (5 commits)
- Phase 3: `dbafaf64` → `cf68031f` (4 commits)

---

## File Structure

### 新規作成

- `src/shared/lib/portable-text/block-schema.ts` — `portableTextBlockSchema` / `createBlock` / `blocksToPlainText` / `createBlockArraySchema()`
- `src/shared/components/portable-text/PortableText.tsx` — 公開描画 Server Component
- `src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/block-editor/PortableTextBlockEditor.tsx` — Lexical wrapper
- `src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/block-editor/IconInlineNode.tsx` — Lexical DecoratorNode（spans の iconInline と互換）
- `src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/block-editor/serialize-blocks.ts` — Lexical EditorState ↔ PortableTextBlock[] 変換
- `prisma/migrations/<TS>_section_textarea_to_portable_text_blocks/migration.sql` — 14 fields の string → blocks 一括変換 PL/pgSQL function

### 修正

- `src/shared/lib/portable-text/index.ts` — block schema を re-export
- `src/shared/lib/sections/field-registry.ts` — `field.portableTextBlock(label, opts)` ヘルパー追加 + `FieldType` に `"portable-text-block"` 追加
- `src/shared/lib/sections/definitions/{concept,contact-form,cta,event-calendar,faq-list,features,hero,hero-parallax,map,page-hero,reservation-form,testimonial}/schema.ts` — 14 fields の `field.textarea` → `field.portableTextBlock` 切替
- `src/shared/lib/validations/section.ts` — re-export shell 整合（schema 変更に伴う型派生）
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx` — `case "portable-text-block"` dispatch 追加
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/AutoArrayField.tsx` — `fieldType === "portable-text-block"` 分岐追加（faq-list.items[].answer / features.items[].description / testimonial.items[].content 用）
- 公開描画 14 consumer:
  - `src/app/(public)/_components/{ConceptSection,ContactFormSection,CTASection,EventCalendarSection,FeaturesSection,HeroSection,HeroParallaxSection,MapSection,ReservationFormSection,TestimonialSection}.tsx`
  - `src/app/(public)/_components/page-hero/{EditorialSplitHero,CompactHero,MinimalHero}.tsx`
  - `src/app/(public)/_components/faq-list-section.tsx`（items[].answer 描画）
- `__tests__/unit/architecture-boundaries.test.ts` — Phase 4 boundary test（schema が string 入力を reject + empty config から `[]` default 生成）
- `__tests__/unit/lib/validations/section.test.ts` — fixture conversion（14 fields）
- `prisma/seed.ts` — `block(...)` helper を追加し DEFAULT_PAGE_SECTIONS / 既存 seed の textarea 値を block 配列化
- `src/shared/lib/constants/default-page-sections.ts` — defaults を block 配列で記述
- `.claude/rules/ssot-singletons.md` — Phase 4 完了反映 + `<PortableText>` SC SSoT エントリ追加
- `.claude/rules/frontend/lexical/conventions.md` — `PortableTextBlockEditor` の位置付け追記

---

## Tasks

### Task 1: `PortableTextBlock` SSoT スキーマ + factory + 共有 SC

**Files:**

- Create: `src/shared/lib/portable-text/block-schema.ts`
- Create: `src/shared/components/portable-text/PortableText.tsx`
- Modify: `src/shared/lib/portable-text/index.ts`

- [ ] **Step 1: `portableTextBlockSchema` を Zod 4 discriminated union で定義**

```typescript
// src/shared/lib/portable-text/block-schema.ts
import { z } from "zod";
import { portableTextSpanSchema } from "./schema";

export const portableTextBlockSchema = z.discriminatedUnion("_type", [
  z.object({
    _key: z.string().min(1),
    _type: z.literal("block"),
    style: z.enum(["normal"]).default("normal"),
    children: z.array(portableTextSpanSchema).default([]),
  }),
]);

export type PortableTextBlock = z.infer<typeof portableTextBlockSchema>;

export function createBlock(
  children: PortableTextSpan[] = [],
  style: "normal" = "normal",
): PortableTextBlock {
  return {
    _key: crypto.randomUUID(),
    _type: "block",
    style,
    children,
  };
}

export function blocksToPlainText(blocks: PortableTextBlock[]): string {
  return blocks
    .map((block) =>
      block.children.map((c) => (c._type === "span" ? c.text : "")).join(""),
    )
    .join("\n");
}

export function createBlockArraySchema(opts?: {
  maxBlocks?: number;
  required?: boolean;
}) {
  const { maxBlocks = 100, required = false } = opts ?? {};
  const base = z.array(portableTextBlockSchema).max(maxBlocks);
  return required ? base.min(1) : base.default([]).catch([]);
}
```

- [ ] **Step 2: 公開描画 SC `<PortableText>` を作成**

```tsx
// src/shared/components/portable-text/PortableText.tsx
import { cn } from "@/shared/lib/cn";
import { PortableTextSpans } from "./PortableTextSpans";
import type { PortableTextBlock } from "@/shared/lib/portable-text";

interface PortableTextProps {
  readonly blocks: PortableTextBlock[];
  readonly className?: string;
  readonly iconClassName?: string;
}

export function PortableText({
  blocks,
  className,
  iconClassName,
}: PortableTextProps) {
  if (blocks.length === 0) return null;
  return blocks.map((block) => (
    <p key={block._key} className={className}>
      <PortableTextSpans spans={block.children} iconClassName={iconClassName} />
    </p>
  ));
}
```

- [ ] **Step 3: barrel index で re-export**

```typescript
// src/shared/lib/portable-text/index.ts
export * from "./schema";
export * from "./block-schema"; // 追加
export * from "./factory";
export * from "./text";
```

- [ ] **Step 4: bun:test で `safeParse({})` / `createBlock()` / `blocksToPlainText` をユニットテスト**

```typescript
// __tests__/unit/lib/portable-text/block-schema.test.ts
import { describe, expect, test } from "bun:test";
import {
  portableTextBlockSchema,
  createBlock,
  blocksToPlainText,
  createBlockArraySchema,
} from "@/shared/lib/portable-text";

test("createBlock generates _key + style normal + children array", () => {
  const block = createBlock([]);
  expect(block._type).toBe("block");
  expect(block.style).toBe("normal");
  expect(block._key).toMatch(/^[0-9a-f-]{36}$/i);
});

test("createBlockArraySchema().safeParse(undefined) defaults to []", () => {
  const schema = createBlockArraySchema();
  const result = schema.safeParse(undefined);
  expect(result.success).toBe(true);
  if (result.success) expect(result.data).toEqual([]);
});

test("blocksToPlainText concatenates spans + newline between blocks", () => {
  const blocks = [
    createBlock([{ _key: "a", _type: "span", text: "Line 1" }]),
    createBlock([{ _key: "b", _type: "span", text: "Line 2" }]),
  ];
  expect(blocksToPlainText(blocks)).toBe("Line 1\nLine 2");
});
```

- [ ] **Step 5: validate + commit**

```bash
bun run validate && bun test __tests__/unit/lib/portable-text/
git add src/shared/lib/portable-text/block-schema.ts src/shared/lib/portable-text/index.ts src/shared/components/portable-text/PortableText.tsx __tests__/unit/lib/portable-text/block-schema.test.ts
git commit -m "feat(portable-text): add PortableTextBlock SSoT schema + factory + PortableText SC (Phase 4 Task 1)"
```

---

### Task 2: DB migration — 14 fields の string → PortableTextBlock[]

**Files:**

- Create: `prisma/migrations/<TS>_section_textarea_to_portable_text_blocks/migration.sql`

- [ ] **Step 1: PL/pgSQL function で string → blocks 変換 helper を migration 内に定義**

```sql
-- 改行で分割し、空行を除いて各行を 1 block ({_key, _type:"block", style:"normal", children: [{_key, _type:"span", text}]}) に変換
CREATE OR REPLACE FUNCTION pg_temp.text_to_portable_blocks(input text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  line text;
BEGIN
  IF input IS NULL OR length(trim(input)) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR line IN SELECT unnest(string_to_array(input, E'\n'))
  LOOP
    IF length(trim(line)) > 0 THEN
      result := result || jsonb_build_array(jsonb_build_object(
        '_key', gen_random_uuid()::text,
        '_type', 'block',
        'style', 'normal',
        'children', jsonb_build_array(jsonb_build_object(
          '_key', gen_random_uuid()::text,
          '_type', 'span',
          'text', line
        ))
      ));
    END IF;
  END LOOP;
  RETURN result;
END;
$$;
```

- [ ] **Step 2: 14 fields × 11 sections に対し `jsonb_set` で string → blocks 変換**

対象（root-level + items[] 内 一括）:

```sql
-- root-level fields (concept.body / contact-form.description / cta.description /
--   event-calendar.description / hero.subtitle / hero-parallax.subtitle /
--   map.address / page-hero.description / reservation-form.description)
UPDATE "Section"
SET config = jsonb_set(config, '{description}', pg_temp.text_to_portable_blocks(config->>'description'))
WHERE type IN ('contact-form', 'cta', 'event-calendar', 'page-hero', 'reservation-form')
  AND jsonb_typeof(config->'description') = 'string';

UPDATE "Section"
SET config = jsonb_set(config, '{body}', pg_temp.text_to_portable_blocks(config->>'body'))
WHERE type = 'concept'
  AND jsonb_typeof(config->'body') = 'string';

UPDATE "Section"
SET config = jsonb_set(config, '{subtitle}', pg_temp.text_to_portable_blocks(config->>'subtitle'))
WHERE type IN ('hero', 'hero-parallax')
  AND jsonb_typeof(config->'subtitle') = 'string';

UPDATE "Section"
SET config = jsonb_set(config, '{address}', pg_temp.text_to_portable_blocks(config->>'address'))
WHERE type = 'map'
  AND jsonb_typeof(config->'address') = 'string';

-- items[] 内 (faq-list.items[].answer / features.items[].description / testimonial.items[].content)
-- jsonb_each + jsonb_array_elements で walk して変換
DO $$
DECLARE
  rec RECORD;
  new_items jsonb;
  item jsonb;
  field_path text;
  target_type text;
BEGIN
  FOR rec IN SELECT id, type, config FROM "Section"
    WHERE type IN ('faq-list', 'features', 'testimonial')
      AND jsonb_typeof(config->'items') = 'array'
  LOOP
    new_items := '[]'::jsonb;
    FOR item IN SELECT * FROM jsonb_array_elements(rec.config->'items')
    LOOP
      CASE rec.type
        WHEN 'faq-list' THEN
          IF jsonb_typeof(item->'answer') = 'string' THEN
            item := jsonb_set(item, '{answer}', pg_temp.text_to_portable_blocks(item->>'answer'));
          END IF;
        WHEN 'features' THEN
          IF jsonb_typeof(item->'description') = 'string' THEN
            item := jsonb_set(item, '{description}', pg_temp.text_to_portable_blocks(item->>'description'));
          END IF;
        WHEN 'testimonial' THEN
          IF jsonb_typeof(item->'content') = 'string' THEN
            item := jsonb_set(item, '{content}', pg_temp.text_to_portable_blocks(item->>'content'));
          END IF;
      END CASE;
      new_items := new_items || jsonb_build_array(item);
    END LOOP;
    UPDATE "Section" SET config = jsonb_set(rec.config, '{items}', new_items) WHERE id = rec.id;
  END LOOP;
END;
$$;
```

- [ ] **Step 2.5: page-hero variant 内 description (3 variants)**

`page-hero` は discriminated union で `editorial-split` / `compact` / `minimal` の 3 variant。それぞれ root-level `description` を持つため上記 root-level UPDATE で一括変換可能（同じ key path）。

- [ ] **Step 3: migration 適用検証**

```bash
# worktree drift があれば手動 path で適用（git-migration.md §destructive 手順）
bunx --bun prisma db execute --file prisma/migrations/<TS>_section_textarea_to_portable_text_blocks/migration.sql
bunx --bun prisma migrate resolve --applied <TS>_section_textarea_to_portable_text_blocks
bunx --bun prisma generate
```

- [ ] **Step 4: commit**

```bash
git add prisma/migrations/<TS>_section_textarea_to_portable_text_blocks/
git commit -m "refactor(db): migrate Section textarea fields to PortableTextBlock[] (Phase 4 Task 2)"
```

---

### Task 3: Lexical wrapper `PortableTextBlockEditor` + `IconInlineNode` + serializer

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/block-editor/IconInlineNode.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/block-editor/serialize-blocks.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/block-editor/PortableTextBlockEditor.tsx`

- [ ] **Step 1: `IconInlineNode` を Lexical `DecoratorNode` で実装**

`PortableTextInlineEditor` 内の同名 node と互換（`_key` / `name` を NodeState で保持、`<CuratedIcon>` を decorate）。spans の `iconInline` と blocks の `children[].iconInline` で同一 node を共有。

- [ ] **Step 2: `serialize-blocks.ts` で双方向変換**

```typescript
// Lexical EditorState (ParagraphNode + TextNode + IconInlineNode) ↔ PortableTextBlock[]
export function lexicalStateToPortableBlocks(
  editor: LexicalEditor,
): PortableTextBlock[] {
  const root = editor.getEditorState().read(() => $getRoot().getChildren());
  return root
    .filter((node) => node instanceof ParagraphNode)
    .map((para) => {
      const children = para
        .getChildren()
        .map((child) => {
          if (child instanceof TextNode) {
            return createSpan(child.getTextContent());
          }
          if (child instanceof IconInlineNode) {
            return createInlineIcon(child.getName());
          }
          return null;
        })
        .filter(Boolean);
      return createBlock(children);
    });
}

export function portableBlocksToLexicalState(
  blocks: PortableTextBlock[],
): SerializedEditorState {
  // ...逆方向
}
```

- [ ] **Step 3: `PortableTextBlockEditor` を Lexical wrapper として実装**

`@lexical/react` の `LexicalComposer` + `RichTextPlugin` + `ContentEditable` + `HistoryPlugin` + 自前 `IconInlinePlugin` (spans の `PortableTextInlineEditor` 内 IconInlinePlugin と互換構造)。

- [ ] **Step 4: validate + commit**

```bash
bun run validate
git add src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/block-editor/
git commit -m "feat(portable-text): add Lexical wrapper PortableTextBlockEditor (Phase 4 Task 3)"
```

---

### Task 4: `field.portableTextBlock` ヘルパー + `AutoSectionForm` 配線

**Files:**

- Modify: `src/shared/lib/sections/field-registry.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/AutoArrayField.tsx`

- [ ] **Step 1: `FieldType` に `"portable-text-block"` 追加**

- [ ] **Step 2: `field.portableTextBlock(label, opts)` ヘルパーを実装**

```typescript
export const field = {
  // ...existing
  portableTextBlock: (
    label: string,
    opts?: {
      maxBlocks?: number;
      required?: boolean;
      group?: FieldGroup;
      subGroup?: FieldSubGroup;
    },
  ) => {
    const schema = createBlockArraySchema({
      maxBlocks: opts?.maxBlocks ?? 100,
      required: opts?.required ?? false,
    });
    schema.register(fieldRegistry, {
      fieldType: "portable-text-block",
      label,
      group: opts?.group ?? "content",
      subGroup: opts?.subGroup ?? "text",
    });
    return schema;
  },
};
```

- [ ] **Step 3: `AutoSectionForm` に `case "portable-text-block"` dispatch 追加**

`PortableTextBlockEditor` を dynamic import して Lexical bundle を遅延ロード（`PortableTextInlineEditor` と同パターン）。

- [ ] **Step 4: `AutoArrayField` の inner field 分岐に `fieldType === "portable-text-block"` 追加**

faq-list.items[].answer / features.items[].description / testimonial.items[].content の編集 UI 配線。

- [ ] **Step 5: validate + commit**

```bash
bun run validate
git commit -m "feat(sections): wire field.portableTextBlock + AutoSectionForm dispatch (Phase 4 Task 4)"
```

---

### Task 5: 14 schema.ts の `field.textarea` → `field.portableTextBlock` 切替

**Files:**

- Modify: `src/shared/lib/sections/definitions/{concept,contact-form,cta,event-calendar,faq-list,features,hero,hero-parallax,map,page-hero,reservation-form,testimonial}/schema.ts`
- Modify: `src/shared/lib/validations/section.ts`（re-export shell の型派生整合）

- [ ] **Step 1-14: 各 schema.ts で `field.textarea(...)` を `field.portableTextBlock(...)` に置換**

`embed.embedCode` は HTML/iframe コードのため textarea 維持（対象外）。

- [ ] **Step 15: page-hero (3 variants) の description 更新**

discriminated union variant 内の field 切替も忘れず実施。

- [ ] **Step 16: validate（中間状態で type-check broken は許容）**

- [ ] **Step 17: commit**

```bash
git commit -m "refactor(sections): rename textarea fields to portableTextBlock (Phase 4 Task 5)"
```

---

### Task 6: Defaults / parsers / seed 更新

**Files:**

- Modify: `src/shared/lib/constants/default-page-sections.ts`
- Modify: `prisma/seed.ts`
- Modify: `src/shared/lib/sections/definitions/<type>/defaults.ts`（必要に応じて）

- [ ] **Step 1: seed.ts に `block(text)` helper を追加**

```typescript
function block(text: string) {
  return [createBlock([createSpan(text)])];
}
```

- [ ] **Step 2: `DEFAULT_PAGE_SECTIONS` の textarea 値を block 配列化**

例: `description: "予約のご案内"` → `description: block("予約のご案内")`

- [ ] **Step 3: 既存 seed の textarea 値を全て block 配列化**

- [ ] **Step 4: `bun run db:seed` で seed 動作確認**

- [ ] **Step 5: commit**

```bash
git commit -m "refactor(seed): convert textarea defaults to PortableTextBlock arrays (Phase 4 Task 6)"
```

---

### Task 7: 14 公開描画 consumer の `<p>{text}</p>` → `<PortableText blocks={...} />` 切替

**Files:**

- Modify: 14 files（上記「修正」セクション参照）

- [ ] **Step 1-14: 各 consumer で `config.<field>` を `<PortableText>` で render**

```tsx
// Before:
{
  config.description && <p className="...">{config.description}</p>;
}

// After:
<PortableText
  blocks={config.description}
  className="..."
  iconClassName="h-3.5 w-3.5"
/>;
```

- [ ] **Step 2: items[] 内の answer / description / content も `<PortableText>` で render**

faq-list / features / testimonial。

- [ ] **Step 3: string context 必要箇所は `blocksToPlainText` 派生**

例: aria-label / alt 属性 / json-ld description / RSS feed description 等。

- [ ] **Step 4: validate + browser 確認**

- [ ] **Step 5: commit**

```bash
git commit -m "refactor(public): switch long-form rendering to PortableText (Phase 4 Task 7)"
```

---

### Task 8: Tests + boundary + ssot-singletons.md 同期

**Files:**

- Modify: `__tests__/unit/architecture-boundaries.test.ts`
- Modify: `__tests__/unit/lib/validations/section.test.ts`
- Modify: `.claude/rules/ssot-singletons.md`
- Modify: `.claude/rules/frontend/lexical/conventions.md`

- [ ] **Step 1: Phase 4 boundary test 追加（schema が string 入力を reject + empty config から `[]` default 生成）**

```typescript
test("Phase 4 で PortableTextBlock[] 化済の long-form フィールドは schema で string を受け付けない", async () => {
  const { validateSectionConfig } =
    await import("@/shared/lib/validations/section");
  const targets: { type: string; field: string }[] = [
    { type: "concept", field: "body" },
    { type: "contact-form", field: "description" },
    { type: "cta", field: "description" },
    { type: "event-calendar", field: "description" },
    { type: "hero", field: "subtitle" },
    { type: "hero-parallax", field: "subtitle" },
    { type: "map", field: "address" },
    { type: "page-hero", field: "description" },
    { type: "reservation-form", field: "description" },
  ];
  for (const { type, field } of targets) {
    const empty = validateSectionConfig(type, {});
    expect(empty.success).toBe(true);
    if (empty.success) {
      const value = (empty.data as Record<string, unknown>)[field];
      expect(Array.isArray(value)).toBe(true);
    }
    const stringInput = validateSectionConfig(type, {
      [field]: "string-not-array",
    });
    expect(stringInput.success).toBe(false);
  }
});
```

- [ ] **Step 2: section.test.ts fixture 更新（14 fields）**

- [ ] **Step 3: ssot-singletons.md の Portable Text SSoT エントリ更新**

Phase 4 完了反映 + `<PortableText>` SC + `PortableTextBlockEditor` Lexical wrapper の SSoT 記載。

- [ ] **Step 4: lexical/conventions.md に `PortableTextBlockEditor` の位置付け追記**

- [ ] **Step 5: 最終 validate + build**

```bash
bun run validate && bun run build
```

- [ ] **Step 6: commit**

```bash
git commit -m "docs(rules,test): codify Phase 4 PortableTextBlock long-form completion"
```

---

## Risk / Mitigation

| Risk                                                                     | Mitigation                                                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lexical wrapper の SSR / hydration mismatch                              | `PortableTextBlockEditor` は admin Client Component のみで使用、公開描画は Server Component `<PortableText>` で完全分離                        |
| 改行による意味的差異（"1 行目\n\n2 行目" vs blocks 2 個）                | migration では空行をスキップ。元データで意図的な空行が必要な箇所は手動で確認（admin に再編集依頼）                                             |
| Lexical bundle 増加による admin /pages/[slug]/edit の First Load JS 増加 | `PortableTextBlockEditor` を `dynamic import` で遅延ロード（`PortableTextInlineEditor` と同パターン）。Post/News/Terms 既採用済のため影響軽微  |
| serialize-blocks.ts の round-trip データ欠損                             | unit test で `lexicalStateToPortableBlocks(portableBlocksToLexicalState(blocks))` の equality を検証                                           |
| field.portableTextBlock の `safeParse({})` 契約                          | `createBlockArraySchema()` が `default([]).catch([])` で必ず `[]` を返す。Phase 0/1/2/3 同様の SectionRenderer fallback 互換性を維持           |
| items[] 内 fields の AutoArrayField 配線漏れ                             | Phase 2 で同一パターン（faq-list.items[].question / features.items[].title 等の inline span）を確立済。同 dispatch 構造を block-block にも適用 |

---

## Success Criteria

- [ ] 14 fields × 11 sections 全てが `PortableTextBlock[]` で保存・描画される
- [ ] `bun run validate && bun run build` exit 0
- [ ] `__tests__/unit/architecture-boundaries.test.ts` の Phase 4 boundary test 合格
- [ ] `__tests__/unit/lib/validations/section.test.ts` 全 fixture 更新合格
- [ ] 管理画面で `PortableTextBlockEditor` で編集 → block 追加 → アイコン挿入 → 保存 → 公開ページで反映される
- [ ] migration 後の DB 上の Section.config の jsonb_typeof が全 14 fields で 'array'
- [ ] ssot-singletons.md / lexical/conventions.md の Phase 4 反映

---

## 推定 commit 構成（8 commits）

1. `feat(portable-text): add PortableTextBlock SSoT schema + factory + PortableText SC (Phase 4 Task 1)`
2. `refactor(db): migrate Section textarea fields to PortableTextBlock[] (Phase 4 Task 2)`
3. `feat(portable-text): add Lexical wrapper PortableTextBlockEditor (Phase 4 Task 3)`
4. `feat(sections): wire field.portableTextBlock + AutoSectionForm dispatch (Phase 4 Task 4)`
5. `refactor(sections): rename textarea fields to portableTextBlock (Phase 4 Task 5)`
6. `refactor(seed): convert textarea defaults to PortableTextBlock arrays (Phase 4 Task 6)`
7. `refactor(public): switch long-form rendering to PortableText (Phase 4 Task 7)`
8. `docs(rules,test): codify Phase 4 PortableTextBlock long-form completion (Phase 4 Task 8)`
