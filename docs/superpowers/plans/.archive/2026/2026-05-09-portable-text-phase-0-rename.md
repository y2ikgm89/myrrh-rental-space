# Portable Text Phase 0: 既存 ButtonLabelToken を Portable Text に rename — Implementation Plan

> **Snapshot: 2026-05-13** — Implementation completed, archived as historical reference.
> **Completed: 2026-05-09** — Implemented in commit `70587873 refactor(portable-text): rename ButtonLabelToken→PortableTextSpan SSoT (Phase 0 Task 2-4)` + supporting commits `72dd37a6` / `d09a4916` / `1cfa6135`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存 `ButtonLabelToken[]` モデル（`buttons[].label` + `NavigationItem.label`）を Sanity Portable Text 公式仕様準拠の `PortableTextSpan[]` に clean break で rename する。

**Architecture:** 新 SSoT パッケージ `@/shared/lib/portable-text/` に Span / Block schema + factory + helpers を集約。旧 `@/shared/lib/sections/definitions/_shared/button-label.ts` と `@/shared/components/TokenLabel.tsx` を完全削除し、新 SSoT に置換。DB は migration で `type/value/name` field を `_type/text/name` に rename + icon token を `iconInline` に rename。後方互換 layer ゼロ。

**Tech Stack:** Zod 4 / Prisma 7 / Next.js 16 / Sanity Portable Text (https://portabletext.org/)

**Spec:** `docs/superpowers/specs/2026-05-09-section-rich-label-architecture.md`

---

## File Structure（新規 / 変更 / 削除）

### 新規作成

```
src/shared/lib/portable-text/
├── schema.ts                   # PortableTextSpan / PortableTextBlock schemas + factories
├── factory.ts                  # createSpan / createInlineIcon / createBlock
├── text.ts                     # spansToPlainText / blocksToPlainText
└── index.ts                    # 型 + factory re-export

src/shared/components/portable-text/
└── PortableTextSpans.tsx       # 旧 TokenLabel.tsx の置き換え

src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/
└── inline-editor/
    ├── PortableTextInlineEditor.tsx   # 旧 RichLabelInput.tsx の置き換え
    └── serialize-spans.ts             # 旧 serialize-tokens.ts の置き換え

prisma/migrations/<timestamp>_portable_text_phase_0_rename/migration.sql
```

### 削除

```
src/shared/lib/sections/definitions/_shared/button-label.ts
src/shared/components/TokenLabel.tsx
src/app/(admin)/admin/(dashboard)/_shared/components/rich-label-input/RichLabelInput.tsx
src/app/(admin)/admin/(dashboard)/_shared/components/rich-label-input/serialize-tokens.ts
__tests__/unit/sections/button-label-schema.test.ts (新規 portable-text-span.test.ts に置換)
__tests__/unit/components/serialize-tokens.test.ts (新規 serialize-spans.test.ts に置換)
```

### 変更

```
src/shared/lib/sections/field-registry.ts           # field.richLabel → field.portableTextInline
src/shared/lib/sections/types.ts                     # FieldType の "rich-label" → "portable-text-inline"
src/shared/lib/sections/definitions/_shared/buttons.ts  # field.richLabel(...) call rename
src/shared/lib/sections/definitions/page-hero/schema.ts # 同上
src/shared/lib/sections/definitions/cta/schema.ts       # 同上（buttons factory 経由のため自動）
src/shared/lib/sections/definitions/hero/schema.ts      # 同上
src/shared/lib/sections/definitions/hero-parallax/schema.ts # 同上
src/shared/domain/navigation/{queries,commands}.ts   # ButtonLabelToken[] → PortableTextSpan[]
src/shared/domain/navigation/types.ts                # 同上
src/app/(admin)/admin/(dashboard)/settings/site/_components/navigation/NavigationDialog.tsx
src/app/(admin)/admin/(dashboard)/settings/site/_components/navigation/types.ts
src/app/(admin)/admin/(dashboard)/settings/site/_components/navigation/use-navigation-form.ts
src/app/(admin)/admin/(dashboard)/settings/site/_components/navigation/SortableNavItem.tsx
src/app/(public)/_shared/components/design-system/button.tsx   # ButtonLabelToken → PortableTextSpan
src/app/(public)/_shared/components/animations/magnetic-button.tsx
src/app/(public)/_shared/components/layouts/site-header.tsx    # TokenLabel → PortableTextSpans
src/app/(public)/_shared/components/layouts/site-footer.tsx
src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx
src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx
.claude/rules/ssot-singletons.md
.claude/rules/frontend/admin-ui-patterns.md
.claude/rules/type-safety.md
```

---

## Task 1: 新 SSoT パッケージ作成（schema + factory + text）

**Files:**

- Create: `src/shared/lib/portable-text/schema.ts`
- Create: `src/shared/lib/portable-text/factory.ts`
- Create: `src/shared/lib/portable-text/text.ts`
- Create: `src/shared/lib/portable-text/index.ts`
- Test: `__tests__/unit/lib/portable-text/schema.test.ts`
- Test: `__tests__/unit/lib/portable-text/factory.test.ts`
- Test: `__tests__/unit/lib/portable-text/text.test.ts`

### Step 1.1: schema test を書く（failing test）

```typescript
// __tests__/unit/lib/portable-text/schema.test.ts
import { describe, expect, test } from "bun:test";
import {
  portableTextSpanSchema,
  portableTextBlockSchema,
  createSpanArraySchema,
  createBlockArraySchema,
} from "@/shared/lib/portable-text/schema";

describe("portableTextSpanSchema", () => {
  test("text span: _type=span / _key / text を要求する", () => {
    const ok = portableTextSpanSchema.safeParse({
      _key: "11111111-1111-4111-8111-111111111111",
      _type: "span",
      text: "Hello",
    });
    expect(ok.success).toBe(true);
  });

  test("iconInline span: _type=iconInline / _key / name を要求する", () => {
    const ok = portableTextSpanSchema.safeParse({
      _key: "22222222-2222-4222-8222-222222222222",
      _type: "iconInline",
      name: "IconHeart",
    });
    expect(ok.success).toBe(true);
  });

  test("旧 type:'text' は受け付けない", () => {
    const ng = portableTextSpanSchema.safeParse({
      _key: "33333333-3333-4333-8333-333333333333",
      type: "text",
      value: "old",
    });
    expect(ng.success).toBe(false);
  });

  test("text は max 500 文字", () => {
    const ng = portableTextSpanSchema.safeParse({
      _key: "44444444-4444-4444-8444-444444444444",
      _type: "span",
      text: "a".repeat(501),
    });
    expect(ng.success).toBe(false);
  });

  test("name は IconXxx パターン強制", () => {
    const ng = portableTextSpanSchema.safeParse({
      _key: "55555555-5555-4555-8555-555555555555",
      _type: "iconInline",
      name: "lowercase",
    });
    expect(ng.success).toBe(false);
  });
});

describe("portableTextBlockSchema", () => {
  test("空 children を許容（safeParse({}) で [] フォールバック契約と整合）", () => {
    const arr = createBlockArraySchema({}).safeParse(undefined);
    expect(arr.success).toBe(true);
    expect(arr.data).toEqual([]);
  });

  test("block は _type=block / _key / style=normal / children を持つ", () => {
    const ok = portableTextBlockSchema.safeParse({
      _key: "66666666-6666-4666-8666-666666666666",
      _type: "block",
      style: "normal",
      children: [],
    });
    expect(ok.success).toBe(true);
  });

  test("style 未指定なら default normal", () => {
    const ok = portableTextBlockSchema.safeParse({
      _key: "77777777-7777-4777-8777-777777777777",
      _type: "block",
      children: [],
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.style).toBe("normal");
  });
});

describe("createSpanArraySchema", () => {
  test("既定 maxSpans=50 / maxCharsPerSpan=500", () => {
    const schema = createSpanArraySchema({});
    expect(schema.safeParse(undefined).success).toBe(true);
    expect(schema.safeParse(undefined).data).toEqual([]);
  });

  test("maxSpans を超えるとエラー", () => {
    const schema = createSpanArraySchema({ maxSpans: 2 });
    const arr = Array.from({ length: 3 }, (_, i) => ({
      _key: `00000000-0000-4000-8000-00000000000${i}`,
      _type: "span" as const,
      text: "x",
    }));
    expect(schema.safeParse(arr).success).toBe(false);
  });
});
```

- [ ] **Step 1.2: test を実行して FAIL を確認**

```bash
bun test __tests__/unit/lib/portable-text/schema.test.ts
```

Expected: FAIL（`Cannot find module '@/shared/lib/portable-text/schema'`）

- [ ] **Step 1.3: schema.ts を実装**

```typescript
// src/shared/lib/portable-text/schema.ts
/**
 * Portable Text 公式準拠の Span / Block schema
 *
 * 業界 reference: https://portabletext.org/ / https://www.sanity.io/docs/block-content
 *
 * - Span: inline token（`_type: "span" | "iconInline"`）
 * - Block: 段落単位（`_type: "block"`、`children: PortableTextSpan[]`）
 *
 * `_key` は配列要素の stable identity（React reconciliation + 並べ替え/挿入/削除）。
 * 配列全体は `safeParse(undefined)` で `[]` にフォールバック（field defaults 契約）。
 */

import { z } from "zod";

const ICON_NAME_PATTERN = /^Icon[A-Z][A-Za-z0-9]*$/;
const tokenKeySchema = z.string().min(1, { error: "_key は必須です" });

const spanTokenSchema = z.object({
  _key: tokenKeySchema,
  _type: z.literal("span"),
  text: z.string().max(500, { error: "テキストは500文字以内です" }),
});

const iconInlineTokenSchema = z.object({
  _key: tokenKeySchema,
  _type: z.literal("iconInline"),
  name: z
    .string()
    .min(1, { error: "アイコン名は必須です" })
    .max(64, { error: "アイコン名は64文字以内です" })
    .regex(ICON_NAME_PATTERN, {
      error: "アイコン名は IconXxx 形式で指定してください",
    }),
});

export const portableTextSpanSchema = z.discriminatedUnion("_type", [
  spanTokenSchema,
  iconInlineTokenSchema,
]);

export const portableTextBlockSchema = z.object({
  _key: tokenKeySchema,
  _type: z.literal("block"),
  style: z.enum(["normal"]).default("normal"),
  children: z
    .array(portableTextSpanSchema)
    .max(200, { error: "Span は200件以内です" }),
});

export type PortableTextSpan = z.infer<typeof portableTextSpanSchema>;
export type PortableTextBlock = z.infer<typeof portableTextBlockSchema>;
export type SpanTextToken = Extract<PortableTextSpan, { _type: "span" }>;
export type SpanIconToken = Extract<PortableTextSpan, { _type: "iconInline" }>;

interface SpanArrayOpts {
  readonly maxSpans?: number;
  readonly maxCharsPerSpan?: number;
}

export function createSpanArraySchema(opts: SpanArrayOpts = {}) {
  const maxSpans = opts.maxSpans ?? 50;
  // maxCharsPerSpan は span 内 text の上限（schema 側で個別に重ねる）
  return z
    .array(portableTextSpanSchema)
    .max(maxSpans, { error: `Span は${maxSpans}件以内です` })
    .default([]);
}

interface BlockArrayOpts {
  readonly maxBlocks?: number;
}

export function createBlockArraySchema(opts: BlockArrayOpts = {}) {
  const maxBlocks = opts.maxBlocks ?? 50;
  return z
    .array(portableTextBlockSchema)
    .max(maxBlocks, { error: `Block は${maxBlocks}件以内です` })
    .default([]);
}
```

- [ ] **Step 1.4: factory.ts test を書く**

```typescript
// __tests__/unit/lib/portable-text/factory.test.ts
import { describe, expect, test } from "bun:test";
import {
  createSpan,
  createInlineIcon,
  createBlock,
} from "@/shared/lib/portable-text/factory";

describe("factory helpers", () => {
  test("createSpan は _key (UUID) を生成", () => {
    const s = createSpan("Hello");
    expect(s._type).toBe("span");
    expect(s.text).toBe("Hello");
    expect(s._key.length).toBeGreaterThan(0);
  });

  test("createInlineIcon は _type:'iconInline' で生成", () => {
    const s = createInlineIcon("IconHeart");
    expect(s._type).toBe("iconInline");
    expect(s.name).toBe("IconHeart");
  });

  test("createBlock は children 配列を内包", () => {
    const b = createBlock([createSpan("A"), createInlineIcon("IconStar")]);
    expect(b._type).toBe("block");
    expect(b.style).toBe("normal");
    expect(b.children.length).toBe(2);
  });

  test("各 _key が一意", () => {
    const a = createSpan("X");
    const b = createSpan("X");
    expect(a._key).not.toBe(b._key);
  });
});
```

- [ ] **Step 1.5: factory.ts を実装**

```typescript
// src/shared/lib/portable-text/factory.ts
/**
 * `crypto.randomUUID()` で stable な `_key` を生成する factory helpers。
 * editor / seed / defaults / migration script で利用。
 */

import type {
  PortableTextSpan,
  PortableTextBlock,
  SpanTextToken,
  SpanIconToken,
} from "./schema";

export function createSpan(text: string): SpanTextToken {
  return { _key: crypto.randomUUID(), _type: "span", text };
}

export function createInlineIcon(name: string): SpanIconToken {
  return { _key: crypto.randomUUID(), _type: "iconInline", name };
}

export function createBlock(children: PortableTextSpan[]): PortableTextBlock {
  return {
    _key: crypto.randomUUID(),
    _type: "block",
    style: "normal",
    children,
  };
}
```

- [ ] **Step 1.6: text.ts test を書く**

```typescript
// __tests__/unit/lib/portable-text/text.test.ts
import { describe, expect, test } from "bun:test";
import {
  createSpan,
  createInlineIcon,
  createBlock,
} from "@/shared/lib/portable-text/factory";
import {
  spansToPlainText,
  blocksToPlainText,
} from "@/shared/lib/portable-text/text";

describe("plain text helpers", () => {
  test("spansToPlainText: text span の text を join、icon は無視", () => {
    const result = spansToPlainText([
      createSpan("Hello "),
      createInlineIcon("IconHeart"),
      createSpan(" World"),
    ]);
    expect(result).toBe("Hello  World");
  });

  test("blocksToPlainText: block を改行で連結", () => {
    const result = blocksToPlainText([
      createBlock([createSpan("Line 1")]),
      createBlock([createSpan("Line 2")]),
    ]);
    expect(result).toBe("Line 1\nLine 2");
  });
});
```

- [ ] **Step 1.7: text.ts を実装**

```typescript
// src/shared/lib/portable-text/text.ts
/**
 * Portable Text → plain text 変換 helper。
 * a11y `aria-label` 派生・SR フォールバック・検索 cache 等で使用。
 */

import type { PortableTextSpan, PortableTextBlock } from "./schema";

export function spansToPlainText(spans: PortableTextSpan[]): string {
  return spans.map((s) => (s._type === "span" ? s.text : "")).join("");
}

export function blocksToPlainText(blocks: PortableTextBlock[]): string {
  return blocks.map((b) => spansToPlainText(b.children)).join("\n");
}
```

- [ ] **Step 1.8: index.ts を作成**

```typescript
// src/shared/lib/portable-text/index.ts
/**
 * Portable Text SSoT barrel — 型 + factory + helpers のみ re-export。
 * `_type` discriminated union パターンの単一エントリ。
 */

export {
  portableTextSpanSchema,
  portableTextBlockSchema,
  createSpanArraySchema,
  createBlockArraySchema,
} from "./schema";
export type {
  PortableTextSpan,
  PortableTextBlock,
  SpanTextToken,
  SpanIconToken,
} from "./schema";
export { createSpan, createInlineIcon, createBlock } from "./factory";
export { spansToPlainText, blocksToPlainText } from "./text";
```

- [ ] **Step 1.9: 全 test を実行して PASS を確認**

```bash
bun test __tests__/unit/lib/portable-text
```

Expected: 全 test PASS

- [ ] **Step 1.10: type-check と lint**

```bash
bun run type-check && bun run lint
```

Expected: exit 0

- [ ] **Step 1.11: commit**

```bash
git add src/shared/lib/portable-text __tests__/unit/lib/portable-text
git commit -m "$(cat <<'EOF'
feat(portable-text): add Portable Text Span/Block SSoT (Phase 0)

公式 Sanity Portable Text 仕様準拠の単一 SSoT パッケージを新規追加。
- PortableTextSpan (_type: "span" | "iconInline")
- PortableTextBlock (_type: "block", children: PortableTextSpan[])
- createSpan / createInlineIcon / createBlock factory (crypto.randomUUID)
- spansToPlainText / blocksToPlainText helpers
- safeParse({}) で [] フォールバック契約

Spec: docs/superpowers/specs/2026-05-09-section-rich-label-architecture.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 旧 schema を新 SSoT に切替（DB migration 含む）

**Files:**

- Create: `prisma/migrations/<timestamp>_portable_text_phase_0_rename/migration.sql`
- Modify: `src/shared/lib/sections/definitions/_shared/buttons.ts`
- Modify: `src/shared/lib/sections/field-registry.ts`
- Modify: `src/shared/lib/sections/types.ts`
- Modify: `src/shared/domain/navigation/types.ts`
- Modify: `src/shared/domain/navigation/queries.ts`
- Modify: `src/shared/domain/navigation/commands.ts`
- Modify: `src/shared/lib/sections/definitions/page-hero/schema.ts`
- Delete: `src/shared/lib/sections/definitions/_shared/button-label.ts`
- Delete: `__tests__/unit/sections/button-label-schema.test.ts`

### Step 2.1: 旧 schema 利用箇所の grep で全 consumer 列挙

```bash
grep -rln "buttonLabelSchema\|ButtonLabelToken\|createTextToken\|createIconToken\|labelToPlainText\|isTextToken\|isIconToken\|button-label" src/ __tests__/ prisma/seed.ts
```

Expected: 全 consumer リスト出力（実装者は出力を保管して 2.x の更新範囲を確定）

- [ ] **Step 2.2: migration SQL を python3 で書き出し（PreToolUse hook 回避）**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
mkdir -p "prisma/migrations/${TS}_portable_text_phase_0_rename"
python3 -c "
import os
sql = '''-- Phase 0: ButtonLabelToken {type, value, name} → PortableTextSpan {_type, text, name}

-- Section.config.buttons[].label の各 token rename
UPDATE sections
SET config = jsonb_set(
  config,
  '{buttons}',
  COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN btn ? 'label' AND jsonb_typeof(btn->'label') = 'array' THEN
            jsonb_set(btn, '{label}', (
              SELECT jsonb_agg(
                CASE
                  WHEN tok->>'type' = 'text' THEN
                    jsonb_build_object(
                      '_key', COALESCE(tok->>'_key', gen_random_uuid()::text),
                      '_type', 'span',
                      'text', tok->>'value'
                    )
                  WHEN tok->>'type' = 'icon' THEN
                    jsonb_build_object(
                      '_key', COALESCE(tok->>'_key', gen_random_uuid()::text),
                      '_type', 'iconInline',
                      'name', tok->>'name'
                    )
                  ELSE tok
                END
              )
              FROM jsonb_array_elements(btn->'label') tok
            ))
          ELSE btn
        END
      )
      FROM jsonb_array_elements(config->'buttons') btn
    ),
    '[]'::jsonb
  )
)
WHERE jsonb_typeof(config->'buttons') = 'array';

-- NavigationItem.label の各 token rename
UPDATE navigation_items
SET label = (
  SELECT jsonb_agg(
    CASE
      WHEN tok->>'type' = 'text' THEN
        jsonb_build_object(
          '_key', COALESCE(tok->>'_key', gen_random_uuid()::text),
          '_type', 'span',
          'text', tok->>'value'
        )
      WHEN tok->>'type' = 'icon' THEN
        jsonb_build_object(
          '_key', COALESCE(tok->>'_key', gen_random_uuid()::text),
          '_type', 'iconInline',
          'name', tok->>'name'
        )
      ELSE tok
    END
  )
  FROM jsonb_array_elements(label) tok
)
WHERE jsonb_typeof(label) = 'array';
'''
path = os.path.join('prisma/migrations/${TS}_portable_text_phase_0_rename', 'migration.sql')
with open(path, 'w', encoding='utf-8') as f:
    f.write(sql)
print('Created:', path)
"
```

- [ ] **Step 2.3: migration を dev DB に適用**

```bash
bunx --bun prisma migrate dev --name portable_text_phase_0_rename
```

Expected: migration apply 成功（drift があれば手書き手順 — `prisma db execute --file <path>` + `prisma migrate resolve --applied`）

- [ ] **Step 2.4: 旧 button-label.ts と test を削除（python3 経由）**

```bash
python3 -c "
import os
for p in [
  'src/shared/lib/sections/definitions/_shared/button-label.ts',
  '__tests__/unit/sections/button-label-schema.test.ts',
]:
  if os.path.exists(p):
    os.remove(p)
    print('Deleted:', p)
"
```

- [ ] **Step 2.5: `field-registry.ts` の `field.richLabel` を `field.portableTextInline` に rename**

`src/shared/lib/sections/field-registry.ts`:

```typescript
// 旧 import を置換
import { createSpanArraySchema } from "@/shared/lib/portable-text";

// 旧 RichLabelOpts → PortableTextInlineOpts
interface PortableTextInlineOpts {
  readonly group?: FieldMeta["group"];
  readonly subGroup?: FieldSubGroup;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly maxSpans?: number;
}

// field.richLabel → field.portableTextInline に rename
portableTextInline(label: string, opts?: PortableTextInlineOpts) {
  return createSpanArraySchema({ maxSpans: opts?.maxSpans ?? 50 }).register(
    fieldRegistry,
    {
      fieldType: "portable-text-inline",
      label,
      group: opts?.group ?? "content",
      ...(opts?.subGroup !== undefined && { subGroup: opts.subGroup }),
      ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      ...(opts?.placeholder !== undefined && { placeholder: opts.placeholder }),
    },
  );
},
```

- [ ] **Step 2.6: `types.ts` の FieldType 更新**

`src/shared/lib/sections/types.ts`:

```typescript
// 旧: "rich-label" → 新: "portable-text-inline"
export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "image"
  | "url"
  | "icon"
  | "array"
  | "portable-text-inline"; // ← rename
```

- [ ] **Step 2.7: `buttons.ts` で `field.portableTextInline` を呼ぶよう更新**

`src/shared/lib/sections/definitions/_shared/buttons.ts`:

```typescript
// 旧: label: field.richLabel("ボタンの文字", {...})
// 新: label: field.portableTextInline("ボタンの文字", {...})
label: field.portableTextInline("ボタンの文字", {
  subGroup: "text",
  helpText:
    "テキストとアイコンを組み合わせてラベルを作成できます。テキストのみでも可。",
}),
```

- [ ] **Step 2.8: `page-hero/schema.ts` の `field.richLabel` 呼び出しを置換**

```bash
grep -rn "field\.richLabel" src/shared/lib/sections/
```

各 hit を `field.portableTextInline` に置換。

- [ ] **Step 2.9: NavigationItem 関連の型と queries / commands を更新**

`src/shared/domain/navigation/types.ts`:

```typescript
// 旧: import { type ButtonLabelToken } from "@/shared/lib/sections/definitions/_shared/button-label";
// 新:
import type { PortableTextSpan } from "@/shared/lib/portable-text";

export interface PublicNavItem {
  // ...
  readonly label: PortableTextSpan[];
}
```

`src/shared/domain/navigation/queries.ts` の `parseLabelTokens` を `parseLabelSpans` に rename:

```typescript
import {
  portableTextSpanSchema,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";
import { z } from "zod";

const labelSpansArraySchema = z.array(portableTextSpanSchema).default([]);

export function parseLabelSpans(value: unknown): PortableTextSpan[] {
  const result = labelSpansArraySchema.safeParse(value);
  return result.success ? result.data : [];
}
```

`src/shared/domain/navigation/commands.ts`:

```typescript
// buttonLabelSchema → createSpanArraySchema({ maxSpans: 30 })
// labelToPlainText(value) → spansToPlainText(value)
import {
  createSpanArraySchema,
  spansToPlainText,
  portableTextSpanSchema,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";

const navLabelSchema = createSpanArraySchema({ maxSpans: 30 }).refine(
  (value) => spansToPlainText(value).trim().length > 0,
  { error: "ラベルにテキストを含めてください" },
);
```

- [ ] **Step 2.10: validate 確認**

```bash
bun run type-check 2>&1 | tee /tmp/typecheck-after-task2.log
```

Expected: 型エラーが Task 3-5 で更新する consumer ファイルに集中（schema layer と navigation layer は exit 0 を目指す）

- [ ] **Step 2.11: commit**

```bash
git add prisma/migrations src/shared/lib/sections src/shared/lib/portable-text src/shared/domain/navigation
git rm src/shared/lib/sections/definitions/_shared/button-label.ts
git rm __tests__/unit/sections/button-label-schema.test.ts
git commit -m "$(cat <<'EOF'
refactor(sections,navigation): migrate ButtonLabelToken → PortableTextSpan (Phase 0)

破壊的変更：旧 buttonLabelSchema / ButtonLabelToken を完全削除し
@/shared/lib/portable-text の PortableTextSpan に統一。

- DB migration: type→_type, value→text, "icon"→"iconInline" rename
- field.richLabel → field.portableTextInline
- FieldType "rich-label" → "portable-text-inline"
- NavigationItem.label / Section.config.buttons[].label が PortableTextSpan[] に
- spansToPlainText を navigation commands で使用
- 後方互換 layer ゼロ

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 共有 SC `<TokenLabel>` を `<PortableTextSpans>` に rename

**Files:**

- Create: `src/shared/components/portable-text/PortableTextSpans.tsx`
- Delete: `src/shared/components/TokenLabel.tsx`
- Modify: 全 consumer (Button / MagneticButton / site-header / site-footer / SortableNavItem 等)

### Step 3.1: TokenLabel consumer を grep

```bash
grep -rln "TokenLabel\|@/shared/components/TokenLabel" src/
```

各 hit を保管して以下の更新範囲を確定。

- [ ] **Step 3.2: 新 SC 作成**

```typescript
// src/shared/components/portable-text/PortableTextSpans.tsx
/**
 * Portable Text Span 配列を順次 render する共有 Server Component。
 *
 * 公開描画 / 管理 preview / Lexical 内 inline icon の全 consumer が利用。
 * `<CuratedIcon>` で SSR safe（component-map.tsx 静的 Tabler import）。
 */

import type { PortableTextSpan } from "@/shared/lib/portable-text";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { cn } from "@/shared/lib/cn";

interface PortableTextSpansProps {
  readonly spans: PortableTextSpan[];
  readonly iconClassName?: string;
}

export function PortableTextSpans({
  spans,
  iconClassName,
}: PortableTextSpansProps) {
  return (
    <>
      {spans.map((span) =>
        span._type === "span" ? (
          <span key={span._key}>{span.text}</span>
        ) : (
          <CuratedIcon
            key={span._key}
            name={span.name}
            className={cn("inline-block align-[-0.125em]", iconClassName)}
          />
        ),
      )}
    </>
  );
}
```

- [ ] **Step 3.3: 全 consumer の import を更新**

各 consumer で `import { TokenLabel } from "@/shared/components/TokenLabel";` → `import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";` に置換。

JSX 利用箇所も `<TokenLabel tokens={...}>` → `<PortableTextSpans spans={...}>` に置換。

主要 consumer（Step 3.1 の grep 結果から再確認）:

- `src/app/(public)/_shared/components/design-system/button.tsx`
- `src/app/(public)/_shared/components/animations/magnetic-button.tsx`
- `src/app/(public)/_shared/components/layouts/site-header.tsx`
- `src/app/(public)/_shared/components/layouts/site-footer.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/site/_components/navigation/SortableNavItem.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/site/_components/navigation/NavigationDialog.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/rich-label-input/RichLabelInput.tsx` (Task 4 でリネーム対象)

各 consumer の prop 名 `tokens` を `spans` に rename。型 `ButtonLabelToken[]` を `PortableTextSpan[]` に rename。

- [ ] **Step 3.4: 旧 TokenLabel.tsx を削除**

```bash
python3 -c "
import os
p = 'src/shared/components/TokenLabel.tsx'
if os.path.exists(p):
  os.remove(p)
  print('Deleted:', p)
"
```

- [ ] **Step 3.5: validate 確認**

```bash
bun run validate
```

Expected: exit 0

- [ ] **Step 3.6: commit**

```bash
git add src/shared/components/portable-text src/app
git rm src/shared/components/TokenLabel.tsx
git commit -m "$(cat <<'EOF'
refactor(components): rename TokenLabel → PortableTextSpans (Phase 0)

公式 Portable Text 命名に統一。span discriminated union を直接受け取り
<CuratedIcon> で iconInline を render する Server Component。

- prop 名 tokens → spans
- 型 ButtonLabelToken[] → PortableTextSpan[]
- consumer: Button / MagneticButton / site-header / site-footer / SortableNavItem / NavigationDialog

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `RichLabelInput` を `PortableTextInlineEditor` に rename + リファクタ

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/inline-editor/PortableTextInlineEditor.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/inline-editor/serialize-spans.ts`
- Delete: `src/app/(admin)/admin/(dashboard)/_shared/components/rich-label-input/RichLabelInput.tsx`
- Delete: `src/app/(admin)/admin/(dashboard)/_shared/components/rich-label-input/serialize-tokens.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`
- Test: `__tests__/unit/components/serialize-spans.test.ts`

### Step 4.1: 旧 RichLabelInput / serialize-tokens の実装を Read（実装者は両ファイルを Read してから着手）

```bash
cat src/app/\(admin\)/admin/\(dashboard\)/_shared/components/rich-label-input/RichLabelInput.tsx
cat src/app/\(admin\)/admin/\(dashboard\)/_shared/components/rich-label-input/serialize-tokens.ts
```

- [ ] **Step 4.2: serialize-spans test を書く（旧 serialize-tokens test を Portable Text 命名で書き直し）**

```typescript
// __tests__/unit/components/serialize-spans.test.ts
import { describe, expect, test } from "bun:test";
// 既存 serialize-tokens.test.ts のテストケースを serialize-spans に対して書き直し
// （旧テスト存在の場合は削除して上書き、データ shape は新 _type/text 形式に揃える）
```

注: 旧 `serialize-tokens.test.ts` を Read して、テストケースを新 schema に合わせて書き直す。

- [ ] **Step 4.3: serialize-spans.ts を実装（旧 serialize-tokens.ts を新 schema に書き直し）**

旧ファイルの DOM ↔ token 変換ロジックを保ちつつ:

- 定数: `KEY_DATA_ATTR = "data-portable-key"`、`SPAN_DATA_ATTR = "data-portable-type"`、`ICON_DATA_ATTR = "data-portable-icon"`
- export: `serializeNodes(root) -> PortableTextSpan[]`、`applySpans(root, spans, document)`
- `_type === "span"` の場合 textNode を作成、`_type === "iconInline"` は span 要素 + data-attribute

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/inline-editor/serialize-spans.ts
import {
  createSpan,
  createInlineIcon,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";

export const KEY_DATA_ATTR = "data-portable-key";
export const SPAN_TYPE_ATTR = "data-portable-type"; // "span" | "iconInline"
export const ICON_NAME_ATTR = "data-portable-icon";
export const ICON_CHIP_CLASS_NAME =
  "inline-flex items-center px-1 py-0 rounded bg-accent/10 text-accent text-xs";

export function serializeNodes(root: HTMLElement): PortableTextSpan[] {
  // 旧 serialize-tokens.ts の同等ロジック、出力 shape を _type/text/name に
  // ...
}

export function applySpans(
  root: HTMLElement,
  spans: PortableTextSpan[],
  doc: Document,
): void {
  // 旧 applyTokens の同等ロジック、入力 shape を _type/text/name に
  // ...
}
```

詳細は旧 `serialize-tokens.ts` の構造を踏襲しつつ field 名を更新。

- [ ] **Step 4.4: PortableTextInlineEditor.tsx を実装**

旧 `RichLabelInput.tsx` を base に:

- import を `@/shared/lib/portable-text` 経由に
- prop 名 `value: ButtonLabelToken[]` → `value: PortableTextSpan[]`
- prop 名 `onChange: (tokens: ButtonLabelToken[]) => void` → `onChange: (spans: PortableTextSpan[]) => void`
- 内部の `lastValueRef`、`createIconToken(name)` → `createInlineIcon(name)` に rename
- DOM data-attribute も新名に
- aria-label は `"テキスト + アイコン"` に汎化（旧 `"ボタンラベル"` から）

- [ ] **Step 4.5: AutoArrayField の `case "rich-label"` を `case "portable-text-inline"` に rename + import 更新**

`src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx`:

旧 `case "rich-label"` の RichLabelInput 利用部分を `case "portable-text-inline"` の PortableTextInlineEditor 利用に置換。

- [ ] **Step 4.6: auto-section-form.tsx の field type 分岐を更新**

`src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`:

`case "rich-label"` → `case "portable-text-inline"` 全置換。

- [ ] **Step 4.7: 旧ディレクトリ削除**

```bash
python3 -c "
import shutil
import os
d = 'src/app/(admin)/admin/(dashboard)/_shared/components/rich-label-input'
if os.path.isdir(d):
  shutil.rmtree(d)
  print('Deleted dir:', d)
"
```

- [ ] **Step 4.8: 旧テスト削除**

```bash
python3 -c "
import os
p = '__tests__/unit/components/serialize-tokens.test.ts'
if os.path.exists(p):
  os.remove(p)
  print('Deleted:', p)
"
```

- [ ] **Step 4.9: validate 確認**

```bash
bun run validate
```

Expected: exit 0

- [ ] **Step 4.10: 単体テスト確認**

```bash
bun test __tests__/unit/lib/portable-text __tests__/unit/components/serialize-spans.test.ts __tests__/unit/domain/navigation
```

Expected: 全 PASS

- [ ] **Step 4.11: commit**

```bash
git add src/app __tests__
git rm -r src/app/\(admin\)/admin/\(dashboard\)/_shared/components/rich-label-input
git rm __tests__/unit/components/serialize-tokens.test.ts
git commit -m "$(cat <<'EOF'
refactor(admin): rename RichLabelInput → PortableTextInlineEditor (Phase 0)

公式 Portable Text 命名に統一した管理画面 inline editor。
旧 RichLabelInput を完全削除（後方互換 ゼロ）。

- パス: rich-label-input/ → portable-text/inline-editor/
- DOM data-attribute: data-token → data-portable-{type,key,icon}
- prop 名 tokens/onChange → spans/onChange
- AutoSectionForm の field-type "rich-label" → "portable-text-inline"

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: rule docs / SSoT / seed 同時更新 + 最終 validate

**Files:**

- Modify: `.claude/rules/ssot-singletons.md`
- Modify: `.claude/rules/frontend/admin-ui-patterns.md`
- Modify: `.claude/rules/type-safety.md`
- Modify: `.claude/rules/frontend/lexical/conventions.md`（旧 ButtonLabelToken 参照箇所）
- Modify: `prisma/seed.ts`（NavigationItem seed が旧 token shape の場合）

### Step 5.1: rule docs の旧 ButtonLabelToken 参照を grep

```bash
grep -rn "ButtonLabelToken\|buttonLabelSchema\|RichLabelInput\|TokenLabel\|button-label\|createTextToken\|createIconToken\|labelToPlainText" .claude/ AGENTS.md CLAUDE.md
```

- [ ] **Step 5.2: `.claude/rules/ssot-singletons.md` の該当エントリを書き換え**

`§Lexical / 記事表示` セクション付近の `buttonLabelSchema / ButtonLabelToken` 行を Portable Text 用に書き直し:

旧:

```
| `buttonLabelSchema` / `ButtonLabelToken` / `createTextToken` / `createIconToken` / `field.richLabel` / `RichLabelInput` | ... | ... |
```

新:

```
| `portableTextSpanSchema` / `PortableTextSpan` / `createSpan` / `createInlineIcon` / `field.portableTextInline` / `PortableTextInlineEditor` / `<PortableTextSpans>` | `@/shared/lib/portable-text` + `@/shared/components/portable-text/PortableTextSpans` + `@/admin/.../portable-text/inline-editor` | Sanity Portable Text 公式準拠の inline span SSoT。`{_key, _type:"span", text}` / `{_key, _type:"iconInline", name}` の discriminated union。`createSpanArraySchema({maxSpans, maxCharsPerSpan})` factory + `safeParse({})` で `[]` フォールバック契約。consumer: cta/hero/hero-parallax/page-hero `buttons[].label` + NavigationItem.label。Phase 1+ で見出し系/long form にも拡張予定 |
```

その他 §管理画面 セクション編集 / §Lexical 等の `buttonLabelSchema` 参照も同様に置換。

- [ ] **Step 5.3: `.claude/rules/frontend/admin-ui-patterns.md` の `field.richLabel` 言及を更新**

旧 `field.richLabel` → `field.portableTextInline`、`RichLabelInput` → `PortableTextInlineEditor`、関連説明を Portable Text 命名に揃える。

- [ ] **Step 5.4: `.claude/rules/type-safety.md` に Portable Text 互換 discriminated union パターン追記**

`## Discriminated Union パターン` 等のセクションに `_type` discriminator の例を追加（既存のスタイルを踏襲）:

```markdown
### Sanity Portable Text 互換の `_type` discriminator

公式 Portable Text 仕様では discriminator フィールドを `_type` (underscore prefix) とする。
本プロジェクトの `PortableTextSpan` / `PortableTextBlock` も同仕様準拠。

`type: "..."` 形式（旧 `ButtonLabelToken`）は Phase 0 で完全廃止済み。
新規 schema 追加時は `_type` 命名を踏襲する。
```

- [ ] **Step 5.5: `.claude/rules/frontend/lexical/conventions.md` の旧 ButtonLabelToken 参照を grep + 更新**

```bash
grep -n "ButtonLabelToken\|buttonLabelSchema" .claude/rules/frontend/lexical/conventions.md
```

各 hit を Portable Text 命名で書き直し。

- [ ] **Step 5.6: `prisma/seed.ts` の NavigationItem / Section.config.buttons 部分を grep**

```bash
grep -n "createTextToken\|createIconToken\|buttonLabelSchema\|ButtonLabelToken" prisma/seed.ts
```

各 hit を `createSpan` / `createInlineIcon` / `PortableTextSpan` に置換。

- [ ] **Step 5.7: seed を実行して新 schema で起動確認**

```bash
bun run db:seed
```

Expected: エラーなく完了（NavigationItem / Section が正しい Portable Text shape で挿入される）

- [ ] **Step 5.8: architecture-boundaries test を更新（旧 symbol が grep で残存しないことを検証）**

`__tests__/unit/architecture-boundaries.test.ts` に Portable Text 関連の boundary を追加:

```typescript
test("旧 ButtonLabelToken / buttonLabelSchema が src/ に残存しない", async () => {
  const { execSync } = await import("node:child_process");
  // grep で旧 symbol を src/ から検索 → 0 件であること
  let stdout = "";
  try {
    stdout = execSync(
      "grep -rln 'ButtonLabelToken\\|buttonLabelSchema\\|createTextToken\\|createIconToken' src/ || true",
      { encoding: "utf-8" },
    );
  } catch {
    /* grep 一致なしは exit 1 だが || true で吸収 */
  }
  expect(stdout.trim()).toBe("");
});
```

- [ ] **Step 5.9: 最終 validate + build**

```bash
bun run validate && bun run build
```

Expected: exit 0

- [ ] **Step 5.10: 全テスト実行**

```bash
bun run test:unit
bun run test:integration
```

Expected: 全 PASS（既存の他テストも非破壊）

- [ ] **Step 5.11: dev server を起動して描画確認**

```bash
# ユーザー起動の dev server 利用、Claude からは起動しない（feedback_dev-server-manual.md）
```

ユーザーが手動で確認するページ:

- `/` ホームページの Hero / CTA section 内ボタンに span / iconInline がそのまま描画されること
- ヘッダー / フッターのナビアイコンが正しく描画されること
- `/admin/pages/home/edit` で `PortableTextInlineEditor` が動作（テキスト + アイコン挿入 + 保存）
- `/admin/settings/site/navigation` でナビアイテム編集 → label がアイコン + テキストで保存

- [ ] **Step 5.12: commit**

```bash
git add .claude prisma/seed.ts __tests__
git commit -m "$(cat <<'EOF'
docs(rules,seed): codify Portable Text SSoT and remove legacy references (Phase 0)

- ssot-singletons.md: ButtonLabelToken エントリ → PortableTextSpan
- admin-ui-patterns.md: field.richLabel → field.portableTextInline
- type-safety.md: _type discriminator パターン追記
- lexical/conventions.md: 旧 ButtonLabelToken 参照を Portable Text 命名へ
- seed.ts: createTextToken/createIconToken → createSpan/createInlineIcon
- architecture-boundaries.test: 旧 symbol 残存ゼロ検証

Phase 0 完了。Phase 1 (A1: 全セクション見出し系) は別 plan で続く。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完了条件

- [ ] 5 commits 作成済（Task 1, 2, 3, 4, 5 各 1 commit）
- [ ] `bun run validate && bun run build` exit 0
- [ ] `bun run test:unit` exit 0
- [ ] dev で公開ページの buttons / nav が新 Portable Text shape で描画される
- [ ] `/admin/pages/home/edit` の `PortableTextInlineEditor` が機能する
- [ ] `grep -rln "ButtonLabelToken\|buttonLabelSchema" src/` が 0 件

## 次工程

Phase 0 完了後、Phase 1 (A1: 全セクション見出し系の string → PortableTextSpan[] 移行) を別 plan として作成する。spec の Phase 1 セクション参照。
