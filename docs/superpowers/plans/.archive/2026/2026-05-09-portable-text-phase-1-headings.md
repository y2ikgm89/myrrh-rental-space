# Portable Text Phase 1: Section 見出し系を PortableTextSpan[] に統一 — Implementation Plan

> **Snapshot: 2026-05-13** — Implementation completed, archived as historical reference.
> **Completed: 2026-05-09** — Implemented in commit `8facddd7 refactor(db): migrate Section heading fields string→PortableTextSpan[] (Phase 1 Task 2)`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 20 Section 定義の見出し系フィールド（`title` / `heading` / `tagline` / `label` / `overviewHeadline` / `globalContactHeadline`）を `string` から `PortableTextSpan[]` に clean break で移行し、公開描画にアイコンを inline 配置可能にする。

**Architecture:** Phase 0 で確立した `@/shared/lib/portable-text` SSoT を流用。schema layer は `field.portableTextInline(...)` に置換、公開描画は `<PortableTextSpans>` または新 `<SplitTextSpans>`（GSAP char-split + iconInline 保持）に置換。SEO / metadata / OGP / JSON-LD 派生は `spansToPlainText()` で plain text 化。DB migration は単一 SQL ファイルで全フィールド一括変換。

**Tech Stack:** Zod 4 / Prisma 7 / Next.js 16 / React 19 / GSAP 3.14 / Sanity Portable Text

**Spec:** `docs/superpowers/specs/2026-05-09-section-rich-label-architecture.md`

---

## File Structure（新規 / 変更 / 削除）

### 新規作成

```
src/app/(public)/_shared/components/animations/split-text-spans.tsx
prisma/migrations/<ts>_section_headings_to_portable_text/migration.sql
__tests__/unit/components/split-text-spans.test.ts
```

### 変更（20 schema.ts + 20 defaults.ts + 20+ public component）

**Schema files**（`field.text` → `field.portableTextInline`）:

```
src/shared/lib/sections/definitions/{concept,contact-form,cta,embed,event-calendar,
  faq-list,features,gallery,hero,hero-parallax,instagram,location-list,map,news-list,
  page-hero,post-list,reservation-form,space-list,space-showcase,testimonial}/schema.ts
```

**Defaults files**（plain string → `[createSpan(...)]`）:

```
src/shared/lib/sections/definitions/<type>/defaults.ts (存在する file のみ)
prisma/seed.ts (DEFAULT_PAGE_SECTIONS の各 config 内 title/heading 等)
```

**Public consumers**（`<SplitText>{title}</SplitText>` / `<Heading>{title}</Heading>` / `{title}` → `<SplitTextSpans>` / `<PortableTextSpans>`）:

`grep -rln "config\.\(title\|heading\|tagline\|label\|overviewHeadline\|globalContactHeadline\)" src/app/\(public\)/` で実体検出。

代表例:

- `src/app/(public)/_components/StandardHeroSection.tsx`
- `src/app/(public)/_components/CTASection.tsx`
- `src/app/(public)/_components/HeroParallaxSection.tsx`
- `src/app/(public)/_shared/components/page-hero/EditorialSplitHero.tsx` ほか variant
- 各 list/showcase セクション (`SpaceListSection.tsx` 等)

**SEO / metadata 派生**:

```
src/app/(public)/<route>/page.tsx (generateMetadata 内で title/description 抽出)
src/app/(public)/_shared/lib/seo/* (もし section title 由来の SEO がある場合)
src/app/feed.xml/route.ts (RSS の title)
```

### 削除

なし（field.text は他用途で残るため削除しない）。

---

## Task 1: `<SplitTextSpans>` 共有 Client Component を作成

**Files:**

- Create: `src/app/(public)/_shared/components/animations/split-text-spans.tsx`
- Test: `__tests__/unit/components/split-text-spans.test.ts`

### Step 1.1: 既存 `split-text.tsx` を Read して GSAP / matchMedia / split ロジックを把握

```bash
cat 'src/app/(public)/_shared/components/animations/split-text.tsx'
```

### Step 1.2: `<SplitTextSpans>` を実装

`text` span を文字単位 split して GSAP stagger アニメ、`iconInline` span は char 分割対象外で inline 配置（DOM 順序保持）。

```typescript
// src/app/(public)/_shared/components/animations/split-text-spans.tsx
"use client";

import { useRef, type ReactElement } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { cn } from "@/shared/lib/cn";
import { DURATION, EASE, STAGGER, SCROLL_TRIGGER } from "@/public/lib/animations";
import type { PortableTextSpan } from "@/shared/lib/portable-text";

interface SplitTextSpansProps {
  readonly spans: PortableTextSpan[];
  readonly className?: string;
  readonly iconClassName?: string;
  /** "chars" (1 文字ずつ) | "words" (単語ごと) */
  readonly splitBy?: "chars" | "words";
  /** 入場アニメの delay (sec) */
  readonly delay?: number;
}

export function SplitTextSpans({
  spans,
  className,
  iconClassName,
  splitBy = "chars",
  delay = 0,
}: SplitTextSpansProps): ReactElement {
  const containerRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const root = containerRef.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const targets = root.querySelectorAll<HTMLElement>("[data-split-unit]");
        gsap.fromTo(
          targets,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            stagger:
              splitBy === "chars" ? STAGGER.char : STAGGER.word,
            delay,
            scrollTrigger: {
              trigger: root,
              ...SCROLL_TRIGGER.reveal,
            },
          },
        );
      });
    },
    { scope: containerRef },
  );

  return (
    <span ref={containerRef} className={className}>
      {spans.map((span) => {
        if (span._type === "iconInline") {
          return (
            <CuratedIcon
              key={span._key}
              name={span.name}
              className={cn("inline-block align-[-0.125em]", iconClassName)}
              aria-hidden="true"
            />
          );
        }
        const units =
          splitBy === "chars"
            ? Array.from(span.text)
            : span.text.split(/(\s+)/u);
        return (
          <span key={span._key}>
            {units.map((unit, i) => (
              <span
                key={`${span._key}-${i}`}
                data-split-unit=""
                className="inline-block whitespace-pre"
              >
                {unit}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}
```

### Step 1.3: Test を書く（DOM smoke test、JSDOM）

```typescript
// __tests__/unit/components/split-text-spans.test.ts
import { describe, expect, test, beforeAll } from "bun:test";
import { renderToString } from "react-dom/server";
import { installJSDOMForTests } from "../../setup-dom";
import { createSpan, createInlineIcon } from "@/shared/lib/portable-text";
import { SplitTextSpans } from "@/public/components/animations/split-text-spans";

beforeAll(() => {
  installJSDOMForTests();
});

describe("SplitTextSpans (SSR)", () => {
  test("text span は char ごとに data-split-unit を持つ <span> に分割される", () => {
    const html = renderToString(
      <SplitTextSpans spans={[createSpan("Hi")]} />,
    );
    expect(html).toContain('data-split-unit=""');
    expect((html.match(/data-split-unit/gu) ?? []).length).toBe(2);
  });

  test("iconInline span は <svg> として inline 描画される", () => {
    const html = renderToString(
      <SplitTextSpans spans={[createInlineIcon("IconHeart")]} />,
    );
    expect(html).toMatch(/<svg/u);
    expect(html).not.toContain("data-split-unit");
  });

  test("text + icon + text の順序が保持される", () => {
    const html = renderToString(
      <SplitTextSpans
        spans={[
          createSpan("A"),
          createInlineIcon("IconStar"),
          createSpan("B"),
        ]}
      />,
    );
    const aIdx = html.indexOf(">A<");
    const svgIdx = html.indexOf("<svg");
    const bIdx = html.indexOf(">B<");
    expect(aIdx).toBeGreaterThan(-1);
    expect(svgIdx).toBeGreaterThan(aIdx);
    expect(bIdx).toBeGreaterThan(svgIdx);
  });
});
```

### Step 1.4: Test を実行して PASS を確認

```bash
bun test __tests__/unit/components/split-text-spans.test.ts
```

Expected: 3/3 pass

### Step 1.5: type-check + lint

```bash
bun run validate
```

Expected: exit 0

### Step 1.6: Commit

```bash
git add src/app/\(public\)/_shared/components/animations/split-text-spans.tsx \
        __tests__/unit/components/split-text-spans.test.ts
git commit -m "$(cat <<'EOF'
feat(public): add <SplitTextSpans> for animated PortableTextSpan rendering (Phase 1)

- text span は char/word 単位 split + GSAP stagger アニメ
- iconInline span は inline 配置（DOM 順序保持、char 分割対象外）
- gsap.matchMedia + prefers-reduced-motion ガード

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: DB migration（全 Section 見出しフィールド一括変換）

**Files:**

- Create: `prisma/migrations/<ts>_section_headings_to_portable_text/migration.sql`

### Step 2.1: 対象フィールドを spec から確認

20 セクション × 該当フィールドのマッピング:

| Section type     | 対象フィールド (key)                                 |
| ---------------- | ---------------------------------------------------- |
| concept          | `heading`                                            |
| contact-form     | `title`                                              |
| cta              | `title`                                              |
| embed            | `title`                                              |
| event-calendar   | `title`                                              |
| faq-list         | `title`                                              |
| features         | `title`                                              |
| gallery          | `title`                                              |
| hero             | `title`                                              |
| hero-parallax    | `tagline`, `title`                                   |
| instagram        | `title`                                              |
| location-list    | `title`, `overviewHeadline`, `globalContactHeadline` |
| map              | `title`                                              |
| news-list        | `title`                                              |
| page-hero        | `label`, `title` (3 variants 全て同 keys)            |
| post-list        | `title`                                              |
| reservation-form | `title`                                              |
| space-list       | `title`                                              |
| space-showcase   | `title`                                              |
| testimonial      | `title`                                              |

合計 28 フィールド（page-hero は variant 共通 keys のため 1 セクションで 2 keys 計上）。

### Step 2.2: Migration SQL を python3 で書き出し

```bash
TS=$(date -u +%Y%m%d%H%M%S)
mkdir -p "prisma/migrations/${TS}_section_headings_to_portable_text"
TS=$TS python3 << 'PYEOF'
import os
sql = '''-- Phase 1: Section 見出し系 string → PortableTextSpan[]
-- 対象: title / heading / tagline / label / overviewHeadline / globalContactHeadline
-- 各セクション type ごとに配列化、idempotent (jsonb_typeof で string チェック)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION wrap_string_to_portable_span(value TEXT)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql IMMUTABLE;

-- ヘルパ: section.config の対象 key が string なら配列に変換
DO $do$
DECLARE
  sec RECORD;
  k TEXT;
  field_keys TEXT[];
BEGIN
  -- セクション type ごとに対象 keys を定義
  FOR sec IN SELECT id, type, config FROM sections LOOP
    field_keys := CASE sec.type
      WHEN 'concept' THEN ARRAY['heading']
      WHEN 'contact-form' THEN ARRAY['title']
      WHEN 'cta' THEN ARRAY['title']
      WHEN 'embed' THEN ARRAY['title']
      WHEN 'event-calendar' THEN ARRAY['title']
      WHEN 'faq-list' THEN ARRAY['title']
      WHEN 'features' THEN ARRAY['title']
      WHEN 'gallery' THEN ARRAY['title']
      WHEN 'hero' THEN ARRAY['title']
      WHEN 'hero-parallax' THEN ARRAY['tagline', 'title']
      WHEN 'instagram' THEN ARRAY['title']
      WHEN 'location-list' THEN ARRAY['title', 'overviewHeadline', 'globalContactHeadline']
      WHEN 'map' THEN ARRAY['title']
      WHEN 'news-list' THEN ARRAY['title']
      WHEN 'page-hero' THEN ARRAY['label', 'title']
      WHEN 'post-list' THEN ARRAY['title']
      WHEN 'reservation-form' THEN ARRAY['title']
      WHEN 'space-list' THEN ARRAY['title']
      WHEN 'space-showcase' THEN ARRAY['title']
      WHEN 'testimonial' THEN ARRAY['title']
      ELSE ARRAY[]::TEXT[]
    END;

    FOREACH k IN ARRAY field_keys LOOP
      IF jsonb_typeof(sec.config -> k) = 'string' THEN
        UPDATE sections
        SET config = jsonb_set(
          config,
          ARRAY[k],
          wrap_string_to_portable_span(config ->> k)
        )
        WHERE id = sec.id;
      END IF;
    END LOOP;
  END LOOP;
END $do$;

DROP FUNCTION wrap_string_to_portable_span(TEXT);
'''
ts = os.environ['TS']
path = f'prisma/migrations/{ts}_section_headings_to_portable_text/migration.sql'
with open(path, 'w', encoding='utf-8') as f:
    f.write(sql)
print('Created:', path)
PYEOF
```

### Step 2.3: dev DB に migration 適用

```bash
TS=$(ls prisma/migrations | grep section_headings_to_portable_text | head -1)
bunx --bun prisma db execute --file "prisma/migrations/${TS}/migration.sql"
bunx --bun prisma migrate resolve --applied "${TS}"
```

Expected: `Script executed successfully.` + `Migration ... marked as applied.`

### Step 2.4: 適用後の jsonb 状態を verify

```bash
cat > scripts/_tmp-verify-headings.ts << 'EOF'
import { PrismaClient } from "@generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
const sample = await p.section.findMany({
  where: { type: { in: ["cta", "hero", "page-hero"] } },
  select: { id: true, type: true, config: true },
  take: 3,
});
for (const s of sample) {
  console.log(s.type, JSON.stringify((s.config as Record<string, unknown>).title ?? null));
}
await p.$disconnect();
EOF
bun run scripts/_tmp-verify-headings.ts
python3 -c "import os; os.remove('scripts/_tmp-verify-headings.ts')"
```

Expected: 各 title が `[{_key, _type:"span", text:"..."}]` 形式に変換済

### Step 2.5: Commit

```bash
git add prisma/migrations/${TS}_section_headings_to_portable_text/
git commit -m "$(cat <<'EOF'
refactor(db): migrate Section heading fields string → PortableTextSpan[] (Phase 1)

20 セクション × 28 フィールド（title / heading / tagline / label /
overviewHeadline / globalContactHeadline）を一括 jsonb 配列化。

- pgcrypto + gen_random_uuid() で _key 注入
- jsonb_typeof で string のみ対象（idempotent）
- DO ブロックで section type 別の field_keys 配列を分岐

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Schema layer 更新（20 schema.ts ファイル）

**Files:**

- Modify: `src/shared/lib/sections/definitions/<type>/schema.ts` × 20

### Step 3.1: 各 schema.ts の対象フィールドを `field.portableTextInline` に置換

`field.text("見出し", { ... })` パターンを `field.portableTextInline("見出し", { ... })` に rename。`maxLength` option は drop（PortableTextSpan は span 単位 500 文字で hardcoded、Phase 1 は per-section 制約を緩和して回帰許容）。

**例: `concept/schema.ts`**

```typescript
// Before
heading: field.text("見出し", {
  maxLength: 100,
  subGroup: "text",
}),

// After
heading: field.portableTextInline("見出し", {
  subGroup: "text",
}),
```

**例: `cta/schema.ts`**

```typescript
// Before
title: field.text("見出し", { maxLength: 100, subGroup: "text" }),

// After
title: field.portableTextInline("見出し", { subGroup: "text" }),
```

**例: `hero-parallax/schema.ts`**

```typescript
// Before
tagline: field.text("タグライン", { maxLength: 100, subGroup: "text" }),
title: field.text("見出し", { maxLength: 200, subGroup: "text" }),

// After
tagline: field.portableTextInline("タグライン", { subGroup: "text" }),
title: field.portableTextInline("見出し", { subGroup: "text" }),
```

**例: `page-hero/schema.ts`**

3 variant 共通の `label` / `title` 両方を rename（`field.text` → `field.portableTextInline`）。

```typescript
// Before
label: field.text("ラベル", { subGroup: "text", maxLength: 200 }),
title: field.text("タイトル", { subGroup: "text", maxLength: 200 }),

// After
label: field.portableTextInline("ラベル", { subGroup: "text" }),
title: field.portableTextInline("タイトル", { subGroup: "text" }),
```

各 variant（editorial-split / compact / minimal）で同変換を適用。

**置換対象一覧**（全 28 フィールド、Step 2.1 のテーブルと一致）:

| File                         | 対象 keys                                            |
| ---------------------------- | ---------------------------------------------------- |
| `concept/schema.ts`          | `heading`                                            |
| `contact-form/schema.ts`     | `title`                                              |
| `cta/schema.ts`              | `title`                                              |
| `embed/schema.ts`            | `title`                                              |
| `event-calendar/schema.ts`   | `title`                                              |
| `faq-list/schema.ts`         | `title`                                              |
| `features/schema.ts`         | `title`                                              |
| `gallery/schema.ts`          | `title`                                              |
| `hero/schema.ts`             | `title`                                              |
| `hero-parallax/schema.ts`    | `tagline`, `title`                                   |
| `instagram/schema.ts`        | `title`                                              |
| `location-list/schema.ts`    | `title`, `overviewHeadline`, `globalContactHeadline` |
| `map/schema.ts`              | `title`                                              |
| `news-list/schema.ts`        | `title`                                              |
| `page-hero/schema.ts`        | `label`, `title`（3 variant 全て）                   |
| `post-list/schema.ts`        | `title`                                              |
| `reservation-form/schema.ts` | `title`                                              |
| `space-list/schema.ts`       | `title`                                              |
| `space-showcase/schema.ts`   | `title`                                              |
| `testimonial/schema.ts`      | `title`                                              |

> 注意: `sectionLabel` / `eyebrow` / `viewAllText` / `submitButtonText` / `description` / `subtitle` / `body` / `address` / `containerClass` / `embedCode` / `defaultSpaceId` / `alt` / `caption` / items[] 内 field は **Phase 1 対象外**（Phase 2-4 で順次扱う）。

### Step 3.2: type-check で残エラーを確認

```bash
bun run type-check 2>&1 | tail -40
```

Expected: schema 自体は exit 0、consumer 側で `string` → `PortableTextSpan[]` の不整合が大量に出る（Task 4-5 で解消）

### Step 3.3: Commit

```bash
git add src/shared/lib/sections/definitions
git commit -m "$(cat <<'EOF'
refactor(sections): rename heading fields to portableTextInline (Phase 1 schema)

20 セクション × 28 フィールドの `field.text` → `field.portableTextInline`。
maxLength option は drop（per-span 500 文字 hardcoded で回帰許容）。

中間状態で type-check は consumer 側に集中したエラーを返す（Task 4-5 で解消）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: defaults.ts + seed.ts 更新

**Files:**

- Modify: `src/shared/lib/sections/definitions/<type>/defaults.ts`（存在する file のみ）
- Modify: `prisma/seed.ts`

### Step 4.1: 各 defaults.ts の対象フィールドを `[createSpan(...)]` に変換

**例: `page-hero/defaults.ts`**

Phase 0 で既に `createSpan` import 済。`label` / `title` の string を `[createSpan(...)]` に置換:

```typescript
// Before
import { createSpan } from "@/shared/lib/portable-text";
// ...
export const DEFAULT_PAGE_HERO: PageHeroConfig = {
  variant: "editorial-split",
  label: "Volume One — Spring 2026",
  title: "Where silence works.",
  // ...
};

// After
export const DEFAULT_PAGE_HERO: PageHeroConfig = {
  variant: "editorial-split",
  label: [createSpan("Volume One — Spring 2026")],
  title: [createSpan("Where silence works.")],
  // ...
};
```

他の defaults.ts も `grep -l "title:\|heading:\|tagline:\|label:" src/shared/lib/sections/definitions/*/defaults.ts` で対象抽出 → 同様に変換。

### Step 4.2: `prisma/seed.ts` の `DEFAULT_PAGE_SECTIONS` 各 entry を変換

```bash
grep -nE "title:\s*\"|heading:\s*\"|tagline:\s*\"" prisma/seed.ts | head -30
```

各 hit を `[{ _key: crypto.randomUUID(), _type: "span" as const, text: "..." }]` または同等の helper 経由に変換。

`seedNavigation` で定義済の `t(text)` helper をモジュール上部の共通 helper に昇格させて再利用:

```typescript
// prisma/seed.ts 上部 helper (既存 seedNavigation 内 helper を export 化)
const span = (text: string) => [
  { _key: crypto.randomUUID(), _type: "span" as const, text },
];

// DEFAULT_PAGE_SECTIONS 内
{
  type: "cta",
  config: {
    sectionLabel: "GET STARTED",
    title: span("お気軽にお問い合わせください"),  // 旧: "お気軽にお問い合わせください"
    // ...
  },
}
```

### Step 4.3: seed を実行して新 schema で起動確認

```bash
bun run db:seed 2>&1 | tail -20
```

Expected: エラーなく完了

### Step 4.4: 2 連続実行で idempotency 確認

```bash
bun run db:seed && bun run db:seed 2>&1 | tail -10
```

Expected: 2 回目もエラーなく完了

### Step 4.5: Commit

```bash
git add src/shared/lib/sections/definitions prisma/seed.ts
git commit -m "$(cat <<'EOF'
refactor(sections,seed): convert heading defaults to PortableTextSpan[] (Phase 1)

defaults.ts と prisma/seed.ts の DEFAULT_PAGE_SECTIONS で
title / heading / tagline / label の string defaults を
[createSpan(...)] / span(...) helper 経由の Portable Text 配列に変換。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 公開 component 更新（描画切替）

**Files:**

- Modify: `src/app/(public)/_components/*.tsx`（StandardHeroSection / CTASection / HeroParallaxSection 等）
- Modify: `src/app/(public)/_shared/components/page-hero/*.tsx`（EditorialSplitHero / Compact / Minimal）
- Modify: 各 `*Section.tsx` で `config.title` を render している全 file

### Step 5.1: 全 consumer を grep で列挙

```bash
grep -rln "config\.\(title\|heading\|tagline\|label\|overviewHeadline\|globalContactHeadline\)" \
  src/app/\(public\)/ src/public/ 2>&1 | head -40
```

各 hit を Read して render パターンを把握:

- `<SplitText>{config.title}</SplitText>` → `<SplitTextSpans spans={config.title} />`
- `<Heading>{config.title}</Heading>` → `<Heading><PortableTextSpans spans={config.title} /></Heading>`
- 直接 `{config.title}` → `<PortableTextSpans spans={config.title} />`

### Step 5.2: 各 consumer を順次変換

**例: `StandardHeroSection.tsx`（hero variant）**

```tsx
// Before
import { SplitText } from "@/public/components/animations/split-text";
// ...
<SplitText>{config.title}</SplitText>;

// After
import { SplitTextSpans } from "@/public/components/animations/split-text-spans";
// ...
<SplitTextSpans spans={config.title} />;
```

**例: `CTASection.tsx`**

```tsx
// Before
<Heading level={2}>{config.title}</Heading>;

// After
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
// ...
<Heading level={2}>
  <PortableTextSpans spans={config.title} />
</Heading>;
```

**例: `EditorialSplitHero.tsx`（page-hero）**

`config.label` / `config.title` 両方を変換:

```tsx
// Before
<SplitText>{label}</SplitText>
<SplitText splitBy="words">{title}</SplitText>

// After
<SplitTextSpans spans={label} />
<SplitTextSpans spans={title} splitBy="words" />
```

**例: `Compact` / `Minimal` page-hero variant** も同様。

**例: `LocationListSection.tsx`**

`overviewHeadline` / `globalContactHeadline` も対応:

```tsx
<PortableTextSpans spans={config.overviewHeadline} />
```

### Step 5.3: 既存 `<SplitText>` を残すべき場合の判定

`<SplitText>` は他の文字列表示（例: メタ情報・カテゴリラベル・固定 hardcoded 文字列）でも使われる可能性があるため、**`config.<heading-field>` を render しているケースのみ** を `<SplitTextSpans>` に置換。それ以外は維持。

```bash
# config 由来でない SplitText 使用は touch しない
grep -rln "<SplitText>" src/app/\(public\)/ | xargs grep -L "config\."
```

### Step 5.4: type-check + lint

```bash
bun run validate 2>&1 | tail -15
```

Expected: exit 0

### Step 5.5: Commit

```bash
git add src/app/\(public\)
git commit -m "$(cat <<'EOF'
refactor(public): switch heading rendering to PortableTextSpans / SplitTextSpans (Phase 1)

20 セクション × 28 フィールドの公開描画を Portable Text 対応に切替。

- SplitText 利用箇所 → SplitTextSpans (char split + iconInline 保持)
- Heading children → PortableTextSpans
- StandardHeroSection / CTASection / HeroParallaxSection /
  PageHero variants / LocationListSection 等

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: SEO / metadata layer 更新（`spansToPlainText` 派生）

**Files:**

- Modify: `src/app/(public)/<route>/page.tsx`（`generateMetadata` 内）
- Modify: `src/app/feed.xml/route.ts`（RSS title）
- Modify: `src/public/lib/seo/*.ts`（JSON-LD ヘッダー派生）
- Modify: その他 `getPageSectionsWithFallback` 経由で section.config.title を SEO 用に抽出している箇所

### Step 6.1: 全 SEO 派生箇所を grep

```bash
grep -rln "config\.\(title\|heading\|tagline\)" src/app/ src/public/lib/ src/shared/domain/ 2>&1 \
  | xargs grep -l "metadata\|description\|og:\|jsonLd\|rss\|feed" 2>&1 | head -20
```

### Step 6.2: 各箇所で `spansToPlainText` を挟む

```typescript
// Before
import { getPageSectionsWithFallback } from "@/shared/lib/sections/getPageSections";
// ...
const heroSection = sections.find((s) => s.type === "page-hero");
const title = heroSection?.config?.title; // string

// After
import { spansToPlainText } from "@/shared/lib/portable-text";
// ...
const heroSection = sections.find((s) => s.type === "page-hero");
const titleSpans = heroSection?.config?.title; // PortableTextSpan[]
const title = titleSpans ? spansToPlainText(titleSpans) : "";
```

**主要対象**:

- `src/app/(public)/page.tsx`（home の metadata title）
- `src/app/(public)/spaces/page.tsx` / `/spaces/[slug]/page.tsx`
- `src/app/(public)/posts/page.tsx` / `/posts/[...segments]/page.tsx`
- `src/app/(public)/news/page.tsx` / `/news/[slug]/page.tsx`
- `src/app/(public)/events/page.tsx`
- `src/app/(public)/access/page.tsx` / `/access/[locationSlug]/page.tsx`
- `src/app/(public)/contact/page.tsx`
- `src/app/(public)/faq/page.tsx`
- `src/app/feed.xml/route.ts`
- `src/app/sitemap.ts`

### Step 6.3: type-check + lint

```bash
bun run validate 2>&1 | tail -10
```

Expected: exit 0

### Step 6.4: Commit

```bash
git add src/app src/public src/shared
git commit -m "$(cat <<'EOF'
refactor(seo): derive plain text from PortableTextSpan headings (Phase 1)

公開ページ metadata / RSS / sitemap / JSON-LD で section title 由来の
plain text を spansToPlainText() 経由で派生。

- generateMetadata 各 page.tsx
- /feed.xml route handler
- sitemap.ts (もし title 利用あれば)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Tests / boundary / rule docs / 最終検証

**Files:**

- Modify: `__tests__/unit/sections/<type>-schema.test.ts`（存在する file 全て）
- Modify: `__tests__/unit/architecture-boundaries.test.ts`（旧 string title 検出は不要、既存 Phase 0 boundary は維持）
- Modify: `.claude/rules/ssot-singletons.md`（Phase 1 完了を反映）
- Modify: `prisma/seed.ts` の docstring（必要なら）

### Step 7.1: 各 section schema test を更新

`__tests__/unit/sections/*.test.ts` で `title: "見出し"` のような string fixture が残っていれば `title: [createSpan("見出し")]` に変換。

```bash
grep -rln "title:\s*\"\|heading:\s*\"\|tagline:\s*\"" __tests__/unit/sections/ 2>&1
```

各 hit を Read → fixture 変換。

### Step 7.2: architecture-boundaries.test.ts に Phase 1 boundary を追加

Phase 1 完了後、section.config 内の対象フィールドが string 型として残っていないことを **schema レベル**で検証する test を追加:

```typescript
// __tests__/unit/architecture-boundaries.test.ts 末尾に追加
test("Phase 1 で PortableTextSpan[] 化済の見出しフィールドは schema で string を受け付けない", async () => {
  const { sectionConfigSchemas } =
    await import("@/shared/lib/validations/section");
  const targets: { type: string; field: string }[] = [
    { type: "concept", field: "heading" },
    { type: "cta", field: "title" },
    { type: "hero", field: "title" },
    { type: "page-hero", field: "title" },
    // ... (代表 sample のみ、全 28 列挙不要)
  ];
  for (const { type, field } of targets) {
    const schema = sectionConfigSchemas[type];
    if (!schema) continue;
    const result = schema.safeParse({ [field]: "string-not-array" });
    // string は portable text array に narrow できないため fail を期待
    // (空 config は default で [] になるため別途 success 期待)
    if (result.success) {
      const value = (result.data as Record<string, unknown>)[field];
      expect(Array.isArray(value)).toBe(true);
    }
  }
});
```

### Step 7.3: rule docs 同期

`.claude/rules/ssot-singletons.md` の Portable Text エントリの「Phase 1+ 拡張予定」記述を更新:

```markdown
**Phase 1 完了**: 全セクション見出し系（title / heading / tagline / label / overviewHeadline / globalContactHeadline）を `PortableTextSpan[]` 化済。
**Phase 2+ 拡張予定**: items[] 内見出し、長 form 系（description / body 等）への `PortableTextBlock[]` 適用。
```

### Step 7.4: 最終 validate + build

```bash
bun run validate && bun run build 2>&1 | tail -20
```

Expected: exit 0

### Step 7.5: 全 unit / integration test 実行

```bash
bun run test:unit 2>&1 | tail -10
bun run test:integration 2>&1 | tail -10
```

Expected: 既存 test 全 PASS（追加 fixture 変換が反映済）

### Step 7.6: dev で公開ページ描画確認（手動）

ユーザーが手動で確認:

- `/` ホーム — Hero / CTA / Spaces / Features 各セクションの見出しが描画されること
- `/spaces` / `/posts` / `/news` / `/events` / `/access` / `/contact` / `/faq` の各 hero / list 見出し
- `/admin/pages/home/edit` で `PortableTextInlineEditor` で title 編集 → アイコン挿入 → 保存 → 公開反映確認

### Step 7.7: Commit

```bash
git add __tests__ .claude
git commit -m "$(cat <<'EOF'
docs(rules,test): codify Phase 1 PortableTextSpan headings completion

- ssot-singletons.md: Phase 1 完了を反映、Phase 2+ 拡張範囲を更新
- architecture-boundaries.test: 見出し系 PortableTextSpan[] 化を schema レベルで検証
- セクション schema test fixture を新形式に追従

Phase 1 完了。Phase 2 (A2: items[] 内見出し) は別 plan で続く。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完了条件

- [ ] 7 commits 作成済（Task 1-7 各 1 commit）
- [ ] `bun run validate && bun run build` exit 0
- [ ] `bun run test:unit` exit 0
- [ ] `bun run test:integration` exit 0
- [ ] dev で全公開ページの heading 描画確認（手動）
- [ ] `/admin/pages/<slug>/edit` で section title が PortableTextInlineEditor で編集可能
- [ ] `bun run db:seed` 2 連続実行 で idempotent
- [ ] `grep -rE "config\.\b(title|heading|tagline)\b\s*\}\s*$" src/app/\(public\)/` で raw render 残存ゼロ

## 次工程

Phase 1 完了後、Phase 2 (A2: items[] 内見出し — features.items[].title / testimonial.items[].authorName / faq-list.items[].question 等) を別 plan として作成する。spec の Phase 2 セクション参照。
