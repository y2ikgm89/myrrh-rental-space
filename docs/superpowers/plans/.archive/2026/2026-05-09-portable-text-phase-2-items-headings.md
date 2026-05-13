# Portable Text Phase 2: items[] 内見出しを PortableTextSpan[] に統一 — Implementation Plan

> **Snapshot: 2026-05-13** — Implementation completed, archived as historical reference.
> **Completed: 2026-05-09** — Implemented in commit `2e7591c9 refactor(db): migrate Section items[] heading fields to PortableTextSpan[] (Phase 2 Task 1)`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Section の `items[]` array 内見出しフィールド 5 件 (features.items[].title / testimonial.items[].authorName, authorTitle / faq-list.items[].question / value-props.items[].title) を `string` → `PortableTextSpan[]` に clean break で移行。

**Architecture:** Phase 0/1 で確立した `@/shared/lib/portable-text` SSoT を流用。schema は `field.portableTextInline(...)` で items[] 内 field を rename、公開描画は `<PortableTextSpans>` で wrap、長文 textarea (description / answer / content) は Phase 4 territory として touch しない。DB migration は単一 SQL ファイルで section type 別に items[] を walk して jsonb 配列内 field を書き換え。

**Tech Stack:** Zod 4 / Prisma 7 / Next.js 16 / React 19 / Sanity Portable Text

**Spec:** `docs/superpowers/specs/2026-05-09-section-rich-label-architecture.md`

---

## File Structure（変更）

### 新規作成

```
prisma/migrations/<ts>_section_items_headings_to_portable_text/migration.sql
```

### 変更（schema 4 + 公開 component 4 + tests）

**Schema files:**

```
src/shared/lib/sections/definitions/features/schema.ts       # items[].title
src/shared/lib/sections/definitions/testimonial/schema.ts    # items[].authorName, items[].authorTitle
src/shared/lib/sections/definitions/faq-list/schema.ts       # items[].question
src/shared/lib/sections/definitions/value-props/schema.ts    # items[].title
```

**Public consumers:**

```
src/app/(public)/_components/features/_features-grid.tsx
src/app/(public)/_components/features/_features-numbered-editorial.tsx
src/app/(public)/_components/features/_features-numbered-steps.tsx
src/app/(public)/_components/TestimonialSection.tsx
src/app/(public)/_components/FaqListSection.tsx
src/app/(public)/_components/value-props/* (もしくは ValuePropsSection.tsx)
```

**Default / seed data:**

```
src/shared/lib/constants/default-page-sections.ts (DEFAULT_PAGE_SECTIONS の features.items[].title / value-props.items[].title 等)
prisma/seed.ts (faq-list seed の items[].question, testimonial seed の items[].authorName/authorTitle 等)
```

**Tests:**

```
__tests__/unit/lib/validations/section.test.ts (既存 fixture の items[] field 値を span[] 化)
__tests__/unit/architecture-boundaries.test.ts (Phase 2 boundary entry 追加)
.claude/rules/ssot-singletons.md (Phase 2 完了マーカー)
```

---

## Task 1: DB migration（items[] 内 field 一括変換）

**Files:**

- Create: `prisma/migrations/<ts>_section_items_headings_to_portable_text/migration.sql`

### Step 1.1: Migration SQL を python3 で書き出し

```bash
TS=$(date -u +%Y%m%d%H%M%S)
mkdir -p "prisma/migrations/${TS}_section_items_headings_to_portable_text"
TS=$TS python3 << 'PYEOF'
import os
sql = '''-- Phase 2: Section items[] 内見出し系 string -> PortableTextSpan[]
-- 対象:
--   features.items[].title
--   testimonial.items[].authorName, items[].authorTitle
--   faq-list.items[].question
--   value-props.items[].title
-- 各セクション type ごとに items 配列を walk、対象 field を CASE 分岐で配列化、
-- idempotent (jsonb_typeof で string チェック)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION wrap_string_to_portable_span_v2(value TEXT)
RETURNS JSONB AS $func$
BEGIN
  IF value IS NULL OR value = '' THEN
    RETURN '[]'::JSONB;
  END IF;
  RETURN jsonb_build_array(
    jsonb_build_object(
      '_key', gen_random_uuid()::text,
      '_type', 'span',
      'text', value
    )
  );
END;
$func$ LANGUAGE plpgsql IMMUTABLE;

DO $do$
DECLARE
  sec RECORD;
  item_keys TEXT[];
  k TEXT;
  new_items JSONB;
BEGIN
  FOR sec IN SELECT id, type, config FROM sections WHERE jsonb_typeof(config -> 'items') = 'array' LOOP
    item_keys := CASE sec.type
      WHEN 'features' THEN ARRAY['title']
      WHEN 'testimonial' THEN ARRAY['authorName', 'authorTitle']
      WHEN 'faq-list' THEN ARRAY['question']
      WHEN 'value-props' THEN ARRAY['title']
      ELSE ARRAY[]::TEXT[]
    END;

    IF array_length(item_keys, 1) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT jsonb_agg(
      (
        SELECT jsonb_object_agg(key, value)
        FROM (
          SELECT key,
            CASE
              WHEN key = ANY(item_keys) AND jsonb_typeof(value) = 'string'
                THEN wrap_string_to_portable_span_v2(value #>> '{}')
              ELSE value
            END AS value
          FROM jsonb_each(item)
        ) updated
      )
    ) INTO new_items
    FROM jsonb_array_elements(sec.config -> 'items') item;

    UPDATE sections
    SET config = jsonb_set(config, '{items}', new_items)
    WHERE id = sec.id;
  END LOOP;
END $do$;

DROP FUNCTION wrap_string_to_portable_span_v2(TEXT);
'''
ts = os.environ['TS']
path = f'prisma/migrations/{ts}_section_items_headings_to_portable_text/migration.sql'
with open(path, 'w', encoding='utf-8') as f:
    f.write(sql)
print('Created:', path)
PYEOF
```

### Step 1.2: dev DB に適用

```bash
TS=$(ls prisma/migrations | grep section_items_headings_to_portable_text | head -1)
bunx --bun prisma db execute --file "prisma/migrations/${TS}/migration.sql"
bunx --bun prisma migrate resolve --applied "${TS}"
```

### Step 1.3: 適用確認

```bash
cat > scripts/_tmp-verify-items.ts << 'EOF'
import { PrismaClient } from "@generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
const sample = await p.section.findMany({
  where: { type: { in: ["features", "testimonial", "faq-list", "value-props"] } },
  select: { id: true, type: true, config: true },
  take: 8,
});
for (const s of sample) {
  const config = s.config as Record<string, unknown>;
  const items = config["items"];
  if (Array.isArray(items) && items[0]) {
    console.log(s.type, "first item:", JSON.stringify(items[0]));
  }
}
await p.$disconnect();
EOF
bun run scripts/_tmp-verify-items.ts
python3 -c "import os; os.remove('scripts/_tmp-verify-items.ts')"
```

Expected: 各 items[0] の対象 field が `[{_key, _type, text}]` 形式。

### Step 1.4: Commit

```bash
git add prisma/migrations/${TS}_section_items_headings_to_portable_text/
git commit -m "$(cat <<'EOF'
refactor(db): migrate Section items[] heading fields to PortableTextSpan[] (Phase 2 Task 1)

5 フィールド × 4 sections（features.items[].title / testimonial.items[].authorName, authorTitle /
faq-list.items[].question / value-props.items[].title）を一括 jsonb 配列化。

- pgcrypto + gen_random_uuid() で _key 注入
- jsonb_typeof で string のみ対象（idempotent）
- DO ブロックで section type 別の item_keys 配列を分岐、jsonb_each でアイテムごと scan

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Schema layer 更新（4 schema.ts）

**Files:**

- Modify: `src/shared/lib/sections/definitions/features/schema.ts` (items[].title)
- Modify: `src/shared/lib/sections/definitions/testimonial/schema.ts` (items[].authorName, items[].authorTitle)
- Modify: `src/shared/lib/sections/definitions/faq-list/schema.ts` (items[].question)
- Modify: `src/shared/lib/sections/definitions/value-props/schema.ts` (items[].title)

### Step 2.1: 各 schema.ts で対象 field を `field.portableTextInline` に rename

**features/schema.ts:**

```typescript
// Before
items: field.array("特徴", {
  fields: {
    icon: field.icon("アイコン"),
    title: field.text("項目の見出し"),
    description: field.textarea("説明文"),
  },
}),

// After
items: field.array("特徴", {
  fields: {
    icon: field.icon("アイコン"),
    title: field.portableTextInline("項目の見出し"),
    description: field.textarea("説明文"),  // Phase 4 territory、touch しない
  },
}),
```

**testimonial/schema.ts:**

```typescript
items: field.array("レビュー", {
  fields: {
    avatarUrl: field.image("アバター画像"),
    content: field.textarea("レビュー内容"),  // Phase 4
    authorName: field.portableTextInline("お客様の名前"),
    authorTitle: field.portableTextInline("肩書き"),
    rating: field.number("評価"),
  },
}),
```

**faq-list/schema.ts:**

```typescript
items: field
  .array("カスタム項目", {
    subGroup: "text",
    fields: {
      question: field.portableTextInline("質問"),
      answer: field.textarea("回答"),  // Phase 4
    },
  })
  .optional(),
```

**value-props/schema.ts:**

```typescript
items: field.array("項目", {
  // ... eyebrow は除外（Phase 1/2 対象外）
  fields: {
    icon: field.icon("アイコン"),
    eyebrow: field.text("英語ラベル (eyebrow)", {
      maxLength: 24,
      helpText: "serif italic で表示される短い英語ラベル（例: Speed）",
    }),
    title: field.portableTextInline("日本語ラベル", {
      helpText: "sans-serif で表示されるラベル（例: 最短1時間から）",
    }),
  },
}),
```

注意: `maxLength` option は portableTextInline で drop（Phase 1 と同方針）、`default` option も drop。

### Step 2.2: type-check 確認

```bash
bun run type-check 2>&1 | tail -10
```

Expected: schema 自体は exit 0、consumer + defaults 側にエラー集中。

### Step 2.3: Commit

```bash
git add src/shared/lib/sections/definitions/{features,testimonial,faq-list,value-props}/schema.ts
git commit -m "$(cat <<'EOF'
refactor(sections): rename items[] heading fields to portableTextInline (Phase 2 Task 2)

5 フィールド × 4 sections の `field.text` → `field.portableTextInline`。
maxLength + default option は drop（per-span 500 char hardcoded）。
description / answer / content (textarea) は Phase 4 territory、touch しない。

中間状態で type-check は consumer + defaults 側にエラー集中（Task 3-4 で解消）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: defaults / seed 更新

**Files:**

- Modify: `src/shared/lib/constants/default-page-sections.ts` (DEFAULT_PAGE_SECTIONS の items[] 内対象 field を `[{...span literal...}]` に)
- Modify: `prisma/seed.ts` (もし features / testimonial / faq-list / value-props の seed inline literal あれば)

### Step 3.1: default-page-sections.ts の対象 field を変換

`DEFAULT_PAGE_SECTIONS` 内で features / value-props 等の `items: [...]` 配列内の対象 field を span literal 化。

**例**:

```typescript
// Before
{
  type: "features",
  config: {
    title: [{ _key: ..., _type: "span", text: "ご利用の流れ" }], // Phase 1 で済
    items: [
      { icon: "IconSearch", title: "スペースを選ぶ", description: "..." },
      // ...
    ],
  },
},

// After (Phase 2)
{
  type: "features",
  config: {
    title: [{ _key: ..., _type: "span", text: "ご利用の流れ" }],
    items: [
      {
        icon: "IconSearch",
        title: [{ _key: crypto.randomUUID(), _type: "span" as const, text: "スペースを選ぶ" }],
        description: "用途や人数に合った空間を見つける",  // Phase 4 territory
      },
      // ...
    ],
  },
},
```

value-props も同様（items[].title）:

```typescript
// After
items: [
  { icon: "IconClock", eyebrow: "Speed", title: [{ _key: crypto.randomUUID(), _type: "span" as const, text: "最短1時間から" }] },
  // ...
],
```

### Step 3.2: seed.ts の対象を grep + 変換

```bash
grep -nE "authorName:\s*\"|authorTitle:\s*\"|question:\s*\"" prisma/seed.ts
```

各 hit を span literal 化（testimonial.items[].authorName/authorTitle、faq-list.items[].question 等）。

注意: 多くの場合 seed.ts は別 DB モデル (Post, News, Event, Review 等) の `title:` を持つ。Section.config 内の items[] のみが対象。

### Step 3.3: seed 実行 + idempotency 確認

```bash
bun run db:seed && bun run db:seed 2>&1 | tail -5
```

### Step 3.4: Commit

```bash
git add src/shared/lib/constants/default-page-sections.ts prisma/seed.ts
git commit -m "$(cat <<'EOF'
refactor(defaults,seed): convert items[] heading defaults to PortableTextSpan[] (Phase 2 Task 3)

DEFAULT_PAGE_SECTIONS の features.items[].title / value-props.items[].title 等の
string defaults を inline `[{ _key, _type: "span", text }]` literal に変換。
seed.ts の testimonial / faq-list items inline data も同様に。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 公開 component 更新

**Files:**

- Modify: `src/app/(public)/_components/features/_features-grid.tsx`
- Modify: `src/app/(public)/_components/features/_features-numbered-editorial.tsx`
- Modify: `src/app/(public)/_components/features/_features-numbered-steps.tsx`
- Modify: `src/app/(public)/_components/TestimonialSection.tsx`
- Modify: `src/app/(public)/_components/FaqListSection.tsx`
- Modify: ValuePropsSection 系（path は grep で検出）

### Step 4.1: 全 consumer を grep で列挙

```bash
grep -rln "item\.title\|item\.authorName\|item\.authorTitle\|item\.question\|items\[.*\]\.\(title\|authorName\|authorTitle\|question\)" src/app/\(public\)/ 2>&1 | head -20
grep -rln "ValueProps" src/app/\(public\)/ 2>&1 | head
```

### Step 4.2: 各 consumer で `<PortableTextSpans>` wrap を適用

**Pattern:**

```tsx
// Before
<h3>{item.title}</h3>
<p className="author">{item.authorName}</p>
<button>{item.question}</button>

// After
<h3><PortableTextSpans spans={item.title} /></h3>
<p className="author"><PortableTextSpans spans={item.authorName} /></p>
<button><PortableTextSpans spans={item.question} /></button>
```

string context (key, aria-label, alt 等) は `spansToPlainText(item.X)`。

例: faq-list 用 React `key` がもし `item.question` 由来なら:

```tsx
// Before
<details key={item.question}>

// After (better: use a stable id)
<details key={item._key ?? spansToPlainText(item.question)}>
```

ただし items[] 要素自体に `_key` 属性があれば（field.array が自動付与）それを優先。

### Step 4.3: type-check + lint

```bash
bun run validate 2>&1 | tail -10
```

Expected: exit 0

### Step 4.4: Commit

```bash
git add src/app/\(public\)/
git commit -m "$(cat <<'EOF'
refactor(public): switch items[] heading rendering to PortableTextSpans (Phase 2 Task 4)

5 フィールド × 4 sections の公開描画を Portable Text 対応に切替。

- features.items[].title → <PortableTextSpans> in features-grid / numbered-* views
- testimonial.items[].authorName, authorTitle → TestimonialSection
- faq-list.items[].question → FaqListSection
- value-props.items[].title → ValuePropsSection 系
- string context (key, aria-label) は spansToPlainText で派生

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: tests / boundary / rule docs 同期 + 最終 validate

**Files:**

- Modify: `__tests__/unit/lib/validations/section.test.ts` (items[] fixture 更新)
- Modify: `__tests__/unit/architecture-boundaries.test.ts` (Phase 2 boundary 追加)
- Modify: `.claude/rules/ssot-singletons.md` (Phase 2 完了反映)

### Step 5.1: section.test.ts の features / testimonial / faq-list / value-props items fixture 更新

```bash
grep -nE "authorName:\s*\"|authorTitle:\s*\"|question:\s*\"|title:\s*\"" __tests__/unit/lib/validations/section.test.ts | head -20
```

各 hit が items[] 内（features / testimonial / faq-list / value-props の test）であれば span literal 化。

### Step 5.2: architecture-boundaries.test.ts に Phase 2 boundary 追加

```typescript
test("Phase 2 で PortableTextSpan[] 化済の items[] 見出しフィールドは schema で string を受け付けない", async () => {
  const { validateSectionConfig } =
    await import("@/shared/lib/validations/section");
  const targets: { type: string; field: string }[] = [
    { type: "features", field: "title" },
    { type: "testimonial", field: "authorName" },
    { type: "testimonial", field: "authorTitle" },
    { type: "faq-list", field: "question" },
    { type: "value-props", field: "title" },
  ];
  for (const { type, field } of targets) {
    // string items[].field は配列要求で fail
    const stringInItem = validateSectionConfig(type, {
      items: [
        type === "value-props"
          ? { icon: "IconClock", eyebrow: "Speed", [field]: "string-not-array" }
          : { [field]: "string-not-array" },
      ],
    });
    expect(stringInItem.success).toBe(false);
  }
});
```

### Step 5.3: ssot-singletons.md 更新

Phase 2 完了マーカーを Portable Text エントリに追記:

```markdown
**Migration**: ... + `<ts>_section_items_headings_to_portable_text` (Phase 2: items[] 内見出し)。
**Phase 1 完了**: 全セクション top-level 見出し系 → `PortableTextSpan[]`。
**Phase 2 完了**: items[] 内見出し（features.items[].title / testimonial.items[].authorName, authorTitle / faq-list.items[].question / value-props.items[].title）→ `PortableTextSpan[]`。
**Phase 3+ 拡張予定**: viewAllText / submitButtonText 等のリンクテキスト → Phase 3、long-form コンテンツ（description / body / answer 等）→ Phase 4 (`PortableTextBlock[]`)。
```

### Step 5.4: 最終 validate + build + test

```bash
bun run validate && bun run build 2>&1 | tail -10
bun test __tests__/unit/lib/validations/section.test.ts 2>&1 | tail -3
bun test __tests__/unit/architecture-boundaries.test.ts -t "Phase" 2>&1 | tail -3
```

Expected: 全 exit 0 / pass。

### Step 5.5: Commit

```bash
git add __tests__ .claude
git commit -m "$(cat <<'EOF'
docs(rules,test): codify Phase 2 PortableTextSpan items[] headings completion

- ssot-singletons.md: Phase 2 完了反映、Phase 3-4 拡張範囲更新
- architecture-boundaries.test: items[] 見出し系の string→span[] 強制を schema レベルで検証
- section.test.ts: items[] fixture を新形式 (PortableTextSpan[]) に追従

Phase 2 完了 (5 commits)。Phase 3 (B1: viewAllText / submitButtonText) は別 plan で続く。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完了条件

- [ ] 5 commits 作成済（Task 1-5 各 1 commit）
- [ ] `bun run validate && bun run build` exit 0
- [ ] section.test.ts 全 PASS
- [ ] architecture-boundaries.test.ts -t "Phase" 全 PASS
- [ ] `bun run db:seed` 2 連続実行 で idempotent
- [ ] dev で `/` ホーム features section / `/faq` / testimonial section が新形式で描画

## 次工程

Phase 2 完了後、Phase 3 (B1: viewAllText / submitButtonText 等のリンクテキスト) を別 plan として作成する。
