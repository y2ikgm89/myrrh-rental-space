# Page Template Architecture — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to dispatch a single implementer for this 1-commit BREAKING phase. Steps use checkbox (`- [ ]`) syntax for tracking. **Implementer must NOT run `git add` / `git commit` / `git push`** — controller will create the final commit after validation.

**Goal:** Homepage 特例（`getHomepagePublicData()` / `HomepageSections.tsx` / `homepage-*` 4 type）を完全削除し、ホームページ `/` を全公開ページと同じ「`getPageSectionsWithFallback("home")` + `SectionRenderer`」テンプレートで描画する clean break。

**Architecture:** spec `docs/superpowers/specs/2026-05-05-page-template-architecture-design.md` §Phase 2 に従い、(1) DB の既存 `homepage-*` Section を destructive migration で `features` / `space-showcase` / `cta` に rewrite、(2) registry / page-templates / section-styles / DEFAULT_PAGE_SECTIONS / queries.ts / admin-queries.ts / preview / system-pages-commands から `homepage-*` 参照を完全除去、(3) `src/app/(public)/page.tsx` を統一テンプレート化、(4) 既存テスト 3 件を更新、で構成する単一 commit BREAKING phase。

**Tech Stack:** Next.js 16 (PPR / `cacheComponents`)、Prisma 7（destructive migration）、Zod 4、bun:test、TypeScript 6.0。

**Snapshot:**

- Phase 1 完了 main commit: `2cf4475e feat(pages): introduce Page.template + PAGE_TEMPLATES SSoT`
- Worktree: 本 plan 実装直前に `superpowers:using-git-worktrees` で `feature/page-template-arch-phase-2` を切る
- 期待最終 commit message: `refactor(sections): merge homepage-* into standard section types`

**Commit policy（最重要）:**

- このプラン全体を **1 commit** にまとめる（spec §Phase 2 が指定）
- 中間状態で `bun run type-check` が壊れることは許容（commit 前の最終 validate でクリーンになれば OK）
- implementer は `git add` / `git commit` / `git push` / `git tag` を **絶対に実行しない**
- 実装完了後、controller が `bun run validate && bun run build` を確認 → 1 commit 作成 → main へ FF merge

---

## File Structure（新規 / 変更 / 削除）

### Migration（新規 1 ディレクトリ）

- **Create**: `prisma/migrations/<TIMESTAMP>_homepage_sections_to_standard_types/migration.sql`
  - `<TIMESTAMP>` は `python3 -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'))"` で発行
  - `prisma/migrations/*.sql` は PreToolUse hook で Write/Edit 禁止のため、必ず Python `open(path, 'w', encoding='utf-8').write(sql)` で書き出す（Bash redirect も可だが Python の方が改行コードを制御しやすい）

### Modify（13 files）

| ファイル                                            | 変更内容                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/lib/sections/registry.ts`               | `homepage-*` 4 import + `definitions[...]` 4 entries 削除（24 → 20）                                                                                               |
| `src/shared/lib/sections/page-templates.ts`         | `home.allowedSectionTypes` から `homepage-*` 4 type 削除 + JUSTIFIED DEVIATION コメント削除                                                                        |
| `src/shared/lib/constants/default-page-sections.ts` | `home` entry を `features` / `space-showcase` / `cta` で書き直し                                                                                                   |
| `src/shared/domain/sections/queries.ts`             | `HomepagePublicData` type / `getHomepagePublicData()` / `getHomepageSections()` 削除                                                                               |
| `src/shared/domain/sections/admin-queries.ts`       | `getHomepageSectionsQuery` / `getPublicHomepageSectionsQuery` / `getHomepageSectionQuery` / `getHomepageSectionByTypeQuery` 削除                                   |
| `src/shared/domain/section-styles/types.ts`         | `SECTION_TYPE_STYLES` から `homepage-*` 4 entries 削除                                                                                                             |
| `src/shared/domain/pages/system-pages-commands.ts`  | `ensureHomepageSectionsCommand` + `migrateHomepageSectionsToPageId` 関数削除、`bootstrapSystemPagesCommand` 内の `if (definition.slug === "home")` 分岐 2 箇所削除 |
| `src/shared/domain/pages/system-pages.ts`           | `ensureHomepageSectionsCommand` re-export 削除                                                                                                                     |
| `src/shared/lib/section-defaults.ts`                | `ensureHomepageSections` / `ensureHomepageSectionsCommand` import + export 削除                                                                                    |
| `src/app/(public)/page.tsx`                         | `getHomepagePublicData()` + `<HomepageSections>` 経路を、`getPageSectionsWithFallback("home")` + `<SectionRenderer>` 経路に書き換え                                |
| `src/app/(preview)/preview/pages/[slug]/page.tsx`   | `<HomepageSections>` 分岐削除、全 slug を `<ManagedPageSections>` 単一経路に統一                                                                                   |
| `__tests__/unit/domain/sections/registry.test.ts`   | 24 → 20 / `homepage-*` 4 type を `expectedTypes` から削除 / 集計合計を 20 に修正                                                                                   |
| `__tests__/integration/actions/homepage.test.ts`    | `home defaults (Phase A)` describe の assertion を更新（旧 `homepage-hero` チェック → `homepage-*` 全 4 type 不在チェック）                                        |

### Delete（13 paths — files + directories）

```
src/shared/lib/sections/definitions/homepage-how-it-works/  (schema.ts + metadata.ts)
src/shared/lib/sections/definitions/homepage-spaces/        (schema.ts + metadata.ts)
src/shared/lib/sections/definitions/homepage-features/      (schema.ts + metadata.ts)
src/shared/lib/sections/definitions/homepage-cta/           (schema.ts + metadata.ts)
src/app/(public)/_shared/components/homepage/HomepageSections.tsx
src/app/(public)/_components/homepage/how-it-works-section.tsx
src/app/(public)/_components/homepage/spaces-section.tsx
src/app/(public)/_components/homepage/features-section.tsx
src/app/(public)/_components/homepage/cta-section.tsx
src/app/(public)/_components/homepage/spaces-carousel.tsx
src/app/(admin)/admin/api/homepage-sections/route.ts
src/app/(admin)/admin/(dashboard)/_shared/queries/homepage-settings.ts
```

ディレクトリ自体（`src/shared/lib/sections/definitions/homepage-*/` × 4、`src/app/(public)/_shared/components/homepage/`、`src/app/(public)/_components/homepage/`、`src/app/(admin)/admin/api/homepage-sections/`）も配下が空になるため削除する。MINGW64 で `rm -rf` は deny されているため、削除は `python3 -c "import shutil; shutil.rmtree(r'<absolute path>', ignore_errors=True)"` を使う（追跡ファイルは事前に `git rm -r <path>` で除去）。

---

## Migration 設計（field mapping）

旧 `homepage-*` config の構造（Phase 1 までは `definitions/homepage-*/schema.ts` で定義されていた）を新 type にマップする。

### `homepage-how-it-works` → `features`

旧 config: `{ label, title, steps: [{title, description}], valueProps: [{title}], layout }`

新 config (`features`): `{ sectionLabel, title, items: [{icon?, title, description?}], columns, itemLayout, layout }`

Mapping:

- `label` → `sectionLabel`
- `title` → `title`
- `steps` → `items`（要素の `title` / `description` をそのまま採用、`icon` は空文字で省略可）
- `valueProps` は **drop**（標準 `features` schema に対応 field 無し。clean-break の視覚 regression として spec §11 で許容済み）
- `columns: 3`（spec §1.3「numbered-list 同等表現」を `itemLayout: "icon-left"` で近似）
- `itemLayout: "icon-left"`
- `layout` は spec §Phase 3 ([\_shared/layout.ts](_shared/layout.ts)) で全 sections 共通の SSoT 化済 — 旧 config から取り出して同形でコピーする

SQL:

```sql
UPDATE sections SET
  type = 'features',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'How to Reserve'),
    'title', COALESCE(config->>'title', 'ご利用の流れ'),
    'items', CASE
      WHEN jsonb_typeof(config->'steps') = 'array' THEN config->'steps'
      ELSE '[]'::jsonb
    END,
    'columns', 3,
    'itemLayout', 'icon-left',
    'layout', COALESCE(config->'layout', '{}'::jsonb)
  )
WHERE type = 'homepage-how-it-works';
```

### `homepage-spaces` → `space-showcase`

旧 config: `{ label, title, count, autoPlayInterval, layout }`

新 config (`space-showcase`): `{ sectionLabel, title, maxItems, showOnlyPublished, columns, cardStyle, imageAspect, layout }`

Mapping:

- `label` → `sectionLabel`
- `title` → `title`
- `count` → `maxItems`（cap at 12 = `LEAST((config->>'count')::int, 12)`）
- `autoPlayInterval` は **drop**（標準 `space-showcase` に対応 field 無し、carousel UI 自体が削除されるため）
- `showOnlyPublished: true`、`columns: 3`、`cardStyle: "bordered"`、`imageAspect: "4:3"` を default 補完
- `layout` は同形コピー

SQL:

```sql
UPDATE sections SET
  type = 'space-showcase',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'Selected Spaces'),
    'title', COALESCE(config->>'title', '厳選スペース'),
    'maxItems', LEAST(COALESCE((config->>'count')::int, 6), 12),
    'showOnlyPublished', true,
    'columns', 3,
    'cardStyle', 'bordered',
    'imageAspect', '4:3',
    'layout', COALESCE(config->'layout', '{}'::jsonb)
  )
WHERE type = 'homepage-spaces';
```

### `homepage-features` → `features`

旧 config: `{ label, title, items: [{title, description}], layout }`

新 config (`features`): `{ sectionLabel, title, items: [{icon?, title, description?}], columns, itemLayout, layout }`

Mapping:

- `label` → `sectionLabel`
- `title` → `title`
- `items` → `items`（既に `{title, description}` 構造で互換、`icon` 補完不要）
- `columns: 2`、`itemLayout: "equal-grid"`（spec §1.3「variant=grid 同等表現」）
- `layout` は同形コピー

SQL:

```sql
UPDATE sections SET
  type = 'features',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'Why Myrrh'),
    'title', COALESCE(config->>'title', '選ばれる理由'),
    'items', CASE
      WHEN jsonb_typeof(config->'items') = 'array' THEN config->'items'
      ELSE '[]'::jsonb
    END,
    'columns', 2,
    'itemLayout', 'equal-grid',
    'layout', COALESCE(config->'layout', '{}'::jsonb)
  )
WHERE type = 'homepage-features';
```

### `homepage-cta` → `cta`

旧 config: `{ label, title, description, buttons, layout }`

新 config (`cta`): `{ sectionLabel, title, description?, buttons, backgroundColor?, variant, layout }`

Mapping:

- `label` → `sectionLabel`
- `title` → `title`（必須）
- `description` → `description`
- `buttons` → `buttons`（同形コピー）
- `variant: "default"`、`backgroundColor` は省略
- `layout` は同形コピー

SQL:

```sql
UPDATE sections SET
  type = 'cta',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'Reservation'),
    'title', COALESCE(config->>'title', 'あなたに最適な空間を'),
    'description', COALESCE(config->>'description', '空き状況の確認から予約まで、オンラインで完結。まずは空間をご覧ください。'),
    'buttons', COALESCE(config->'buttons', '[]'::jsonb),
    'variant', 'default',
    'layout', COALESCE(config->'layout', '{}'::jsonb)
  )
WHERE type = 'homepage-cta';
```

これら 4 UPDATE を 1 つの `migration.sql` ファイル（同一トランザクション）に並べる。

---

## Tasks

### Task 1: Worktree 切り出し前の確認（implementer 起動前 — controller 作業）

**この Task は controller が plan 着手前に実行する**。implementer dispatch 時には既に worktree が存在し CWD が worktree 配下になっている前提。

- [ ] **Step 1.1: 既存 worktree / branch の cleanup**

```bash
git worktree list
git branch --list "worktree-*"
# 既に閉じている worktree があれば:
git worktree remove .claude/worktrees/feature+page-template-arch-phase-2 --force 2>&1 || true
git branch -D worktree-feature+page-template-arch-phase-2 2>&1 || true
git worktree prune
```

- [ ] **Step 1.2: superpowers:using-git-worktrees skill で worktree 作成**

Skill 経由で `feature/page-template-arch-phase-2` を切る（`EnterWorktree` native tool が `.claude/worktrees/feature+page-template-arch-phase-2/` に作成、branch 名 `worktree-feature+page-template-arch-phase-2`）。

- [ ] **Step 1.3: implementer dispatch 用プロンプト準備**

`superpowers:subagent-dispatch-template` skill を参照し、git 全面禁止 + plan deviation policy + 完了報告フォーマットを明記した dispatch prompt を組み立てる。

---

### Task 2: Destructive Migration を作成（DB に未適用）

**Files:**

- Create: `prisma/migrations/<TIMESTAMP>_homepage_sections_to_standard_types/migration.sql`

Migration SQL を Python script で生成する（`prisma/migrations/*.sql` は PreToolUse hook で Write/Edit 禁止のため Python 経由でのみ書き込み可能）。

- [ ] **Step 2.1: Timestamp と migration ディレクトリを作成**

```bash
TS=$(python3 -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'))")
echo "TS=$TS"
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_homepage_sections_to_standard_types', exist_ok=True)"
ls prisma/migrations/${TS}_homepage_sections_to_standard_types/
```

期待: ディレクトリが作成され、`ls` で空ディレクトリが表示される。`$TS` の値を以降の手順でも使うので Bash セッション内で保持する（または `date -u +%Y%m%d%H%M%S` 等で再生成しても可）。

- [ ] **Step 2.2: migration.sql を Python で書き出す**

```bash
TS=$(ls prisma/migrations/ | grep "_homepage_sections_to_standard_types$" | tail -1 | cut -d_ -f1)
python3 << 'PY'
import os
ts = sorted([d for d in os.listdir("prisma/migrations") if d.endswith("_homepage_sections_to_standard_types")])[-1]
sql = r"""-- Migration: homepage-* Section types を標準 type に rewrite（destructive、Phase 2 BREAKING）
-- spec: docs/superpowers/specs/2026-05-05-page-template-architecture-design.md §Phase 2

-- homepage-how-it-works → features (numbered-list 同等表現は itemLayout: icon-left で近似)
UPDATE sections SET
  type = 'features',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'How to Reserve'),
    'title', COALESCE(config->>'title', 'ご利用の流れ'),
    'items', CASE
      WHEN jsonb_typeof(config->'steps') = 'array' THEN config->'steps'
      ELSE '[]'::jsonb
    END,
    'columns', 3,
    'itemLayout', 'icon-left',
    'layout', COALESCE(config->'layout', '{}'::jsonb)
  )
WHERE type = 'homepage-how-it-works';

-- homepage-spaces → space-showcase
UPDATE sections SET
  type = 'space-showcase',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'Selected Spaces'),
    'title', COALESCE(config->>'title', '厳選スペース'),
    'maxItems', LEAST(COALESCE((config->>'count')::int, 6), 12),
    'showOnlyPublished', true,
    'columns', 3,
    'cardStyle', 'bordered',
    'imageAspect', '4:3',
    'layout', COALESCE(config->'layout', '{}'::jsonb)
  )
WHERE type = 'homepage-spaces';

-- homepage-features → features (variant=grid 同等表現は itemLayout: equal-grid)
UPDATE sections SET
  type = 'features',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'Why Myrrh'),
    'title', COALESCE(config->>'title', '選ばれる理由'),
    'items', CASE
      WHEN jsonb_typeof(config->'items') = 'array' THEN config->'items'
      ELSE '[]'::jsonb
    END,
    'columns', 2,
    'itemLayout', 'equal-grid',
    'layout', COALESCE(config->'layout', '{}'::jsonb)
  )
WHERE type = 'homepage-features';

-- homepage-cta → cta
UPDATE sections SET
  type = 'cta',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'Reservation'),
    'title', COALESCE(config->>'title', 'あなたに最適な空間を'),
    'description', COALESCE(config->>'description', '空き状況の確認から予約まで、オンラインで完結。まずは空間をご覧ください。'),
    'buttons', COALESCE(config->'buttons', '[]'::jsonb),
    'variant', 'default',
    'layout', COALESCE(config->'layout', '{}'::jsonb)
  )
WHERE type = 'homepage-cta';
"""
path = f"prisma/migrations/{ts}/migration.sql"
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(sql)
print(f"Wrote {path} ({len(sql)} chars)")
PY
```

期待: `Wrote prisma/migrations/<TS>_homepage_sections_to_standard_types/migration.sql (... chars)`。

- [ ] **Step 2.3: migration.sql の冒頭を確認（meta 行混入チェック）**

```bash
head -3 prisma/migrations/*_homepage_sections_to_standard_types/migration.sql
```

期待: 1 行目が `-- Migration: homepage-*` で始まる。`◇ injected env` 等のメタ行が混入していたら delete してやり直し（Python heredoc は dotenvx 影響を受けない仕様だが念のため検証）。

- [ ] **Step 2.4: migration.sql を DB に適用**

```bash
bunx --bun prisma db execute --file prisma/migrations/$(ls prisma/migrations/ | grep "_homepage_sections_to_standard_types$" | tail -1)/migration.sql
```

期待: エラーなしで完了。`Script executed successfully.` 等。`prisma db execute` は SELECT 結果を返さないため、Step 2.5 の検証で実データの type 変換を確認する。

- [ ] **Step 2.5: DB 上で homepage-\* type が消滅したことを検証**

```bash
bun -e "const { PrismaClient } = require('./generated/prisma/client'); const { PrismaPg } = require('@prisma/adapter-pg'); const { Pool } = require('pg'); const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const p = new PrismaClient({ adapter: new PrismaPg(pool) }); (async () => { const r = await p.section.findMany({ where: { type: { startsWith: 'homepage-' } }, select: { id: true, type: true } }); console.log('remaining homepage-* sections:', JSON.stringify(r)); const newCounts = await p.section.groupBy({ by: ['type'], _count: { type: true }, where: { type: { in: ['features', 'space-showcase', 'cta'] } } }); console.log('new type counts:', JSON.stringify(newCounts)); await p.\$disconnect(); })();"
```

期待: `remaining homepage-* sections: []`（空配列）。`new type counts:` に `features` / `space-showcase` / `cta` の `_count` が表示される。

- [ ] **Step 2.6: prisma migrate resolve --applied で migration を mark**

```bash
bunx --bun prisma migrate resolve --applied $(ls prisma/migrations/ | grep "_homepage_sections_to_standard_types$" | tail -1)
```

期待: `Migration ... marked as applied.`

---

### Task 3: PAGE_TEMPLATES から `homepage-*` を削除

**Files:**

- Modify: `src/shared/lib/sections/page-templates.ts:36-52`

- [ ] **Step 3.1: `home.allowedSectionTypes` を整理**

`src/shared/lib/sections/page-templates.ts` の `home` template entry（Line 29-55）を以下に書き換える:

```typescript
  home: {
    id: "home",
    label: "ホーム",
    description: "トップページ — Hero + 特集セクション",
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
      "gallery",
    ],
    defaultSections: DEFAULT_PAGE_SECTIONS["home"] ?? [],
    requiredSectionTypes: ["page-hero"],
  },
```

JUSTIFIED DEVIATION コメント（line 33-35）と `homepage-*` 4 entries を完全削除し、20 標準 type のサブセットのみで構成する。

---

### Task 4: DEFAULT_PAGE_SECTIONS["home"] を新 type で書き直し

**Files:**

- Modify: `src/shared/lib/constants/default-page-sections.ts:71-164`

- [ ] **Step 4.1: `home` entry を新 type で再構成**

`DEFAULT_PAGE_SECTIONS` オブジェクトの `home` entry（Line 71-164）を以下に置き換える。`features` schema の `items` は `{title, description}` のみで OK（`icon` は optional）。`layout` field は schema 側の `prefault({})` が default を補完するため省略可。

```typescript
  home: [
    {
      type: "features",
      title: null,
      config: {
        sectionLabel: "How to Reserve",
        title: "ご利用の流れ",
        items: [
          {
            title: "スペースを選ぶ",
            description: "用途や人数に合った空間を見つける",
          },
          {
            title: "日時を決める",
            description: "カレンダーから空き状況を確認",
          },
          {
            title: "オンラインで予約",
            description: "最短1分で予約完了",
          },
        ],
        columns: 3,
        itemLayout: "icon-left",
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "space-showcase",
      title: null,
      config: {
        sectionLabel: "Selected Spaces",
        title: "厳選スペース",
        maxItems: 6,
        showOnlyPublished: true,
        columns: 3,
        cardStyle: "bordered",
        imageAspect: "4:3",
      },
      content: null,
      order: 1,
      isActive: true,
    },
    {
      type: "features",
      title: null,
      config: {
        sectionLabel: "Why Myrrh",
        title: "選ばれる理由",
        items: [
          {
            title: "自然光設計",
            description:
              "全室に大きな窓を配置。時間帯で変化する光が、空間に深みを与えます。",
          },
          {
            title: "遮音性能",
            description:
              "プロフェッショナル水準の遮音設計。外部の喧騒を遮断し、深い集中を可能にします。",
          },
          {
            title: "即日予約",
            description:
              "オンラインで空き状況確認から決済まで完結。当日予約にも対応しています。",
          },
          {
            title: "柔軟なレイアウト",
            description:
              "可動式の家具と設備で、会議・撮影・イベントなど用途に合わせた配置変更が可能です。",
          },
        ],
        columns: 2,
        itemLayout: "equal-grid",
      },
      content: null,
      order: 2,
      isActive: true,
    },
    {
      type: "cta",
      title: null,
      config: {
        sectionLabel: "Reservation",
        title: "あなたに最適な空間を",
        description:
          "空き状況の確認から予約まで、オンラインで完結。まずは空間をご覧ください。",
        buttons: [
          {
            text: "View All Spaces",
            url: "/spaces",
            variant: "primary",
            size: "lg",
            iconName: "",
            openInNewTab: false,
          },
        ],
        variant: "default",
      },
      content: null,
      order: 3,
      isActive: true,
    },
  ],
```

旧 `homepage-cta` config の `buttonText` / `buttonUrl` フィールドは破棄し、新 `cta` schema の `buttons[]` 配列に変換する（CTA URL `/spaces` を採用）。

---

### Task 5: registry.ts から `homepage-*` 4 entries 削除

**Files:**

- Modify: `src/shared/lib/sections/registry.ts:46-53, 165-184`

- [ ] **Step 5.1: import 文 4 行削除**

`src/shared/lib/sections/registry.ts` の Line 46-53（`homepageHowItWorksConfigSchema` / `homepageHowItWorksMetadata` / `homepageSpacesConfigSchema` / `homepageSpacesMetadata` / `homepageFeaturesConfigSchema` / `homepageFeaturesMetadata` / `homepageCtaConfigSchema` / `homepageCtaMetadata` の 8 import）を削除する。

- [ ] **Step 5.2: `definitions` レコードから 4 entries 削除**

Line 165-184 の `"homepage-how-it-works"` / `"homepage-spaces"` / `"homepage-features"` / `"homepage-cta"` の 4 entries を削除する。

- [ ] **Step 5.3: コメント "全 24 セクション定義" を "全 20 セクション定義" に修正**

Line 3 (`// セクションレジストリ — 全 24 セクション定義を集約し、ルックアップ・バリデーション関数を提供する。`) と Line 63 (`/** 全 24 セクション定義（page-hero 含む） */`) の `24` を `20` に書き換える。

---

### Task 6: section-styles/types.ts から `homepage-*` 4 entries 削除

**Files:**

- Modify: `src/shared/domain/section-styles/types.ts:122-125`

- [ ] **Step 6.1: `SECTION_TYPE_STYLES` から `homepage-*` 4 entries 削除**

Line 122-125 の `"homepage-cta": CTA_SECTION_STYLE,` / `"homepage-features": DEFAULT_SECTION_STYLE,` / `"homepage-how-it-works": COMPACT_CENTER_STYLE,` / `"homepage-spaces": FULL_BLEED_STYLE,` の 4 行を削除する。`COMPACT_CENTER_STYLE` 定数（Line 83-89）は他で参照されていないため同時に削除。

- [ ] **Step 6.2: `COMPACT_CENTER_STYLE` の参照確認後、定数も削除**

```bash
grep -rn "COMPACT_CENTER_STYLE" src/
```

`types.ts` 内のみで参照されていることを確認したら、Line 83-89 の定数定義も削除する。

---

### Task 7: definitions/homepage-\* 4 ディレクトリを削除

**Files:**

- Delete: `src/shared/lib/sections/definitions/homepage-how-it-works/` (schema.ts + metadata.ts)
- Delete: `src/shared/lib/sections/definitions/homepage-spaces/` (schema.ts + metadata.ts)
- Delete: `src/shared/lib/sections/definitions/homepage-features/` (schema.ts + metadata.ts)
- Delete: `src/shared/lib/sections/definitions/homepage-cta/` (schema.ts + metadata.ts)

- [ ] **Step 7.1: 追跡ファイルを git rm で除去**

```bash
git rm -r src/shared/lib/sections/definitions/homepage-how-it-works
git rm -r src/shared/lib/sections/definitions/homepage-spaces
git rm -r src/shared/lib/sections/definitions/homepage-features
git rm -r src/shared/lib/sections/definitions/homepage-cta
```

期待: 各 `git rm` で `rm 'src/shared/lib/sections/definitions/<name>/schema.ts'` + `rm 'src/shared/lib/sections/definitions/<name>/metadata.ts'` の 2 行ずつ表示。**implementer は git add / commit を実行しないが、`git rm` は worktree のファイル削除のために必要なので OK**（後で controller がまとめて commit する）。

---

### Task 8: HomepageSections.tsx + 5 \_components/homepage/\*.tsx を削除

**Files:**

- Delete: `src/app/(public)/_shared/components/homepage/HomepageSections.tsx`
- Delete: `src/app/(public)/_components/homepage/how-it-works-section.tsx`
- Delete: `src/app/(public)/_components/homepage/spaces-section.tsx`
- Delete: `src/app/(public)/_components/homepage/features-section.tsx`
- Delete: `src/app/(public)/_components/homepage/cta-section.tsx`
- Delete: `src/app/(public)/_components/homepage/spaces-carousel.tsx`

- [ ] **Step 8.1: 追跡ファイルを git rm で除去**

```bash
git rm 'src/app/(public)/_shared/components/homepage/HomepageSections.tsx'
git rm 'src/app/(public)/_components/homepage/how-it-works-section.tsx'
git rm 'src/app/(public)/_components/homepage/spaces-section.tsx'
git rm 'src/app/(public)/_components/homepage/features-section.tsx'
git rm 'src/app/(public)/_components/homepage/cta-section.tsx'
git rm 'src/app/(public)/_components/homepage/spaces-carousel.tsx'
```

MINGW64 で `(public)` パスは Bash がサブシェルと解釈するためシングルクォートで囲む必須。

- [ ] **Step 8.2: 空ディレクトリも削除**

`git rm` 後、ディレクトリは空になっても worktree 上に残ることがある。`python3 -c "import shutil; shutil.rmtree(...)"` で物理削除する:

```bash
python3 -c "import shutil; shutil.rmtree(r'src/app/(public)/_shared/components/homepage', ignore_errors=True); shutil.rmtree(r'src/app/(public)/_components/homepage', ignore_errors=True)"
```

- [ ] **Step 8.3: 削除確認**

```bash
ls 'src/app/(public)/_shared/components/' 2>&1 | grep -i homepage || echo "OK: no homepage dir"
ls 'src/app/(public)/_components/' 2>&1 | grep -i homepage || echo "OK: no homepage dir"
```

期待: 両方とも `OK: no homepage dir`。

---

### Task 9: src/app/(public)/page.tsx を統一テンプレート化

**Files:**

- Modify: `src/app/(public)/page.tsx`

- [ ] **Step 9.1: ホームページを統一テンプレートに書き換え**

`src/app/(public)/page.tsx` 全体を以下に置き換える:

```typescript
/**
 * Homepage — 統一テンプレート（Page Template Architecture Phase 2）
 *
 * 全公開ページと同じく `getPageSectionsWithFallback("home")` + `SectionRenderer` で描画する。
 * 旧 `getHomepagePublicData()` / `HomepageSections` 経路は Phase 2 で完全削除。
 * PageHero は order=-1 の `page-hero` Section として SectionRenderer 内で描画される。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";

import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { WebSiteJsonLd } from "@/public/components/seo/json-ld";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getWebSiteJsonLdData } from "@/public/lib/seo";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("home");
}

export default async function HomePage(): Promise<ReactElement> {
  await connection();

  const [webSiteData, sections] = await Promise.all([
    getWebSiteJsonLdData(),
    getPageSectionsWithFallback("home"),
  ]);

  return (
    <>
      <WebSiteJsonLd
        name={webSiteData.name}
        description={webSiteData.description}
        url={webSiteData.url}
      />
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
```

注意: `SectionRenderer` の正確な props は実装で確認する。`section-renderer.tsx` の export signature が `<SectionRenderer section={...} />` の形式であることを `Read` で確認してから書き換える。`PageLayout` 等の追加 wrapper は spec §4.2 では推奨されているが、現行 page.tsx は wrapper なしで Fragment を返している。**implementer はまず現行 `section-renderer.tsx` の使い方（他ページ `src/app/(public)/about/page.tsx` 等）を Read で確認し、同一パターンに揃える**。

---

### Task 10: src/app/(preview)/preview/pages/[slug]/page.tsx を統一描画に統一

**Files:**

- Modify: `src/app/(preview)/preview/pages/[slug]/page.tsx`

- [ ] **Step 10.1: HomepageSections 分岐を削除**

`src/app/(preview)/preview/pages/[slug]/page.tsx` の Line 7（`HomepageSections` import）と Line 43-51（`page.slug === "home" ? <HomepageSections> : <ManagedPageSections>` 分岐）を削除し、全 slug を `<ManagedPageSections sections={activeSections} />` 単一経路に統一する。書き換え後の全文:

```typescript
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPageBySlug } from "@/admin/queries/page";
import { getPageForEdit } from "@/admin/queries/page-section";
import { ManagedPageSections } from "@/public/components/pages/ManagedPageSections";
import { PreviewBanner } from "@/public/components/ui/preview-banner";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "ページプレビュー",
  robots: { index: false, follow: false },
};

export default async function ManagedPagePreviewPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();

  const { slug } = await params;
  const pageMeta = await getPageBySlug(slug);

  if (!pageMeta) {
    notFound();
  }

  const page = await getPageForEdit(slug);

  if (!page) {
    notFound();
  }

  const activeSections = page.sections.filter((section) => section.isActive);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PreviewBanner />
      <ManagedPageSections sections={activeSections} />
    </div>
  );
}
```

注意: `ManagedPageSections` が `homepage-hero` フィルタを内部で行っているか確認する。Phase 1 後 `homepage-hero` type は registry に存在しないため、DB に残っていなければ filter 不要。残っている可能性があれば `ManagedPageSections` 側で対応するか、ここで `activeSections.filter((s) => s.type !== "homepage-hero")` を残す。**implementer は `src/app/(public)/_shared/components/pages/ManagedPageSections.tsx` を Read で確認**してから決める。

---

### Task 11: queries.ts から homepage-\* 関連関数 / type 削除

**Files:**

- Modify: `src/shared/domain/sections/queries.ts`

- [ ] **Step 11.1: `HomepagePublicData` type / `getHomepagePublicData` / `getHomepageSections` を削除**

`src/shared/domain/sections/queries.ts` の Line 48-120（`export type HomepagePublicData = ...` から `export async function getHomepageSections() ...` の閉じ括弧まで）を削除する。

`getShowcaseSpaces`（Line 122 〜）と `getPageSections` / `getPageSectionsWithFallback` 等は **保持**（他経路で使われる可能性があるため）。

- [ ] **Step 11.2: 削除後、`getShowcaseSpaces` の呼び出し元を確認**

```bash
grep -rn "getShowcaseSpaces" src/
```

期待: `src/app/(public)/_shared/components/sections/section-renderer.tsx` で 2 回参照されている（Line 34, 123, 144）。`HomepageSections.tsx` 削除後に section-renderer のみで参照される形になる。`getShowcaseSpaces` が `space-showcase` section 描画でも使われる場合は保持、未使用なら削除（後者の場合は section-renderer の中身を Read で確認）。

- [ ] **Step 11.3: `CACHE_TAGS.HOMEPAGE_SECTIONS` の参照確認**

```bash
grep -rn "HOMEPAGE_SECTIONS" src/ __tests__/
```

`src/shared/lib/constants/cache.ts` に定義（Line 116）。他で参照がなければ削除候補。`getHomepagePublicData` 削除後に他参照がなければ Task 11 内で `cache.ts` から `HOMEPAGE_SECTIONS: "homepage-sections",` 行を削除する。**保守的に、参照が `cache.ts` の自己定義のみなら削除**（dead code 禁止の `implementation-quality.md` 適用）。

---

### Task 12: admin-queries.ts から homepage-\* 関連関数削除

**Files:**

- Modify: `src/shared/domain/sections/admin-queries.ts`

- [ ] **Step 12.1: 4 関数を削除**

`src/shared/domain/sections/admin-queries.ts` の Line 60-125（`async function getHomePageId()` から `getHomepageSectionByTypeQuery` の閉じ括弧まで）を削除する。`getHomePageId` ヘルパーは 4 関数のみで使われているため同時削除。

`getPageSectionsQuery` / `getPublicPageSectionsQuery` / `getPageWithSectionsQuery` / `getPageForEditQuery` / `getPageSectionQuery` は保持。

- [ ] **Step 12.2: 削除前に呼び出し元を確認**

```bash
grep -rnE "getHomepageSectionsQuery|getPublicHomepageSectionsQuery|getHomepageSectionQuery|getHomepageSectionByTypeQuery" src/
```

期待: `src/app/(admin)/admin/api/homepage-sections/route.ts` (Task 13 で削除) と `src/app/(admin)/admin/(dashboard)/_shared/queries/homepage-settings.ts` (Task 14 で削除) のみがヒット。これらは Task 13 / 14 で削除されるため、Task 12 単体では一時的に呼び出し元が壊れる（中間 type-check fail は許容、`bun run validate` は最終 commit 前のみ確認）。

---

### Task 13: src/app/(admin)/admin/api/homepage-sections/route.ts を削除

**Files:**

- Delete: `src/app/(admin)/admin/api/homepage-sections/route.ts`

- [ ] **Step 13.1: ファイルを git rm**

```bash
git rm 'src/app/(admin)/admin/api/homepage-sections/route.ts'
python3 -c "import shutil; shutil.rmtree(r'src/app/(admin)/admin/api/homepage-sections', ignore_errors=True)"
```

- [ ] **Step 13.2: API endpoint の呼び出し元 grep で残骸チェック**

```bash
grep -rn "/admin/api/homepage-sections" src/
```

期待: ヒットなし。あれば（Client Component が fetch している等）該当箇所も同時修正する。

---

### Task 14: src/app/(admin)/admin/(dashboard)/\_shared/queries/homepage-settings.ts を削除

**Files:**

- Delete: `src/app/(admin)/admin/(dashboard)/_shared/queries/homepage-settings.ts`

- [ ] **Step 14.1: ファイルを git rm**

```bash
git rm 'src/app/(admin)/admin/(dashboard)/_shared/queries/homepage-settings.ts'
```

- [ ] **Step 14.2: 呼び出し元 grep**

```bash
grep -rnE "getHomepageSections|getPublicHomepageSections|getHomepageSection\b|getHomepageSectionByType" 'src/app/(admin)/'
```

`src/app/(admin)/admin/(dashboard)/_shared/queries/homepage-settings.ts` 削除後、admin 側で残骸が出たら（page.tsx 等が import している可能性）、該当箇所を Read で確認し、新しい統一 page-section query (`getPageWithSectionsQuery("home")` 等) に置き換える。**この置き換えが大規模ならスコープ外として記録し、controller に escalate**。

---

### Task 15: system-pages-commands.ts / system-pages.ts / section-defaults.ts から homepage 関連削除

**Files:**

- Modify: `src/shared/domain/pages/system-pages-commands.ts`
- Modify: `src/shared/domain/pages/system-pages.ts`
- Modify: `src/shared/lib/section-defaults.ts`

Phase 1 で `pageId: null` の orphan section を `home` Page に紐付ける移行ロジック (`migrateHomepageSectionsToPageId`) と `ensureHomepageSectionsCommand` ラッパーは Phase 2 では不要（Phase 1 で全て移行済み・新 type 化後は通常の `ensurePageSectionsCommand` で対処可能）。

- [ ] **Step 15.1: `system-pages-commands.ts` から `ensureHomepageSectionsCommand` + `migrateHomepageSectionsToPageId` を削除**

`src/shared/domain/pages/system-pages-commands.ts` の Line 77-90（`export async function ensureHomepageSectionsCommand` 全体）と Line 145-166（`async function migrateHomepageSectionsToPageId` 全体）を削除。

`bootstrapSystemPagesCommand`（Line 92-143）内の Line 110-112 と Line 130-132 の `if (definition.slug === "home") { await migrateHomepageSectionsToPageId(...) }` 呼び出しも 2 箇所削除する。

- [ ] **Step 15.2: `system-pages.ts` から `ensureHomepageSectionsCommand` re-export を削除**

`src/shared/domain/pages/system-pages.ts` の Line 6 (`ensureHomepageSectionsCommand as ensureHomepageSectionsCommandWithDb,`) と Line 17-19 (`export async function ensureHomepageSectionsCommand` 全体) を削除する。

- [ ] **Step 15.3: `section-defaults.ts` から `ensureHomepageSections` を削除**

`src/shared/lib/section-defaults.ts` の Line 17 (`ensureHomepageSectionsCommand,` import) と Line 38-49 (`export async function ensureHomepageSections` 全体 + その上のコメント) を削除する。

- [ ] **Step 15.4: 呼び出し元の grep で残骸チェック**

```bash
grep -rnE "ensureHomepageSections(Command)?|migrateHomepageSectionsToPageId" src/
```

期待: ヒットなし（自分自身を削除した結果 0 ヒット）。`/admin/pages/home/edit/page.tsx` 等で `ensureHomepageSections()` を呼んでいた可能性があるため要確認。呼び出し元があれば代わりに `ensurePageSections(homePageId, "home")` または上位の `bootstrapSystemPagesCommand()` で代替可能。

---

### Task 16: テスト 3 件を更新

**Files:**

- Modify: `__tests__/unit/domain/sections/registry.test.ts`
- Modify: `__tests__/integration/actions/homepage.test.ts`
- Modify: `__tests__/unit/shared/lib/sections/buttons-factory.test.ts`

- [ ] **Step 16.1: registry.test.ts を更新（24 → 20）**

`__tests__/unit/domain/sections/registry.test.ts` の以下を書き換え:

| 場所       | 旧                                                                                         | 新                                                                 |
| ---------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Line 49    | `test("24 件のセクション定義を返す（page-hero + 既存 23 タイプ）"`                         | `test("20 件のセクション定義を返す（page-hero + 既存 19 タイプ）"` |
| Line 51    | `expect(defs).toHaveLength(24);`                                                           | `expect(defs).toHaveLength(20);`                                   |
| Line 65    | `test("page-hero / 既存 19 標準タイプ / 4 homepage-* タイプが含まれる"`                    | `test("page-hero + 既存 19 標準タイプが含まれる"`                  |
| Line 90-93 | `"homepage-how-it-works", "homepage-spaces", "homepage-features", "homepage-cta",` の 4 行 | 削除                                                               |
| Line 158   | `test("全カテゴリの合計件数が 24 件になる"`                                                | `test("全カテゴリの合計件数が 20 件になる"`                        |
| Line 167   | `expect(total).toBe(24);`                                                                  | `expect(total).toBe(20);`                                          |

- [ ] **Step 16.2: homepage.test.ts の `home defaults (Phase A)` を更新**

`__tests__/integration/actions/homepage.test.ts` の Line 22-37 の describe ブロックを以下に置き換え:

```typescript
describe("home defaults (Phase A + B)", () => {
  test("DEFAULT_PAGE_SECTIONS.home に homepage-* type が含まれない", () => {
    const home = DEFAULT_PAGE_SECTIONS["home"];
    expect(home).toBeDefined();
    const homepagePrefixed =
      home?.filter((s) => s.type.startsWith("homepage-")) ?? [];
    expect(homepagePrefixed).toHaveLength(0);
  });

  test("home デフォルトセクションは order が重複しない非負整数", () => {
    const home = DEFAULT_PAGE_SECTIONS["home"];
    expect(home).toBeDefined();
    const orders = home!.map((s) => s.order);
    expect(new Set(orders).size).toBe(orders.length);
    for (const o of orders) {
      expect(o).toBeGreaterThanOrEqual(0);
    }
  });

  test("home デフォルトセクションは標準 type のみで構成される", () => {
    const home = DEFAULT_PAGE_SECTIONS["home"] ?? [];
    const allowedTypes = new Set([
      "page-hero",
      "hero",
      "hero-parallax",
      "features",
      "space-showcase",
      "post-list",
      "news-list",
      "cta",
      "concept",
      "instagram",
      "testimonial",
      "gallery",
      "custom",
    ]);
    for (const section of home) {
      expect(allowedTypes.has(section.type)).toBe(true);
    }
  });
});
```

- [ ] **Step 16.3: buttons-factory.test.ts のコメント更新**

`__tests__/unit/shared/lib/sections/buttons-factory.test.ts` Line 4 のコメントから `homepage-cta` を削除:

旧:

```typescript
 * 5 sections (cta/hero/hero-parallax/homepage-cta + buttons array consumer) で共有される
```

新:

```typescript
 * 4 sections (cta/hero/hero-parallax + buttons array consumer) で共有される
```

(`buttons-factory.test.ts` の本体は import や assertion レベルで homepage-cta を直接参照していないため、コメント修正のみで OK)

- [ ] **Step 16.4: homepage-section.test.ts は変更不要を確認**

`__tests__/unit/lib/validations/homepage-section.test.ts` は `@/admin/lib/validations/homepage-section` の re-export 検証。このモジュール自体（`src/shared/lib/validations/section.ts` から re-export している admin alias）は `homepage-*` schema を直接 export していないため、Phase 2 で**変更不要**。`describe` ブロック名 "homepage-section re-export" は misleading だが正常に動作する。

```bash
grep -n "homepageHowItWorks\|homepageSpaces\|homepageFeatures\|homepageCta" __tests__/unit/lib/validations/homepage-section.test.ts
```

期待: ヒットなし（テスト本体に homepage-\* schema 直接参照なし）。ヒットあれば追加修正が必要。

---

### Task 17: 中間 type-check で漏れを洗い出す

- [ ] **Step 17.1: type-check 単発実行**

```bash
bun run type-check 2>&1 | tail -100
```

期待される出力: エラーが残っていれば該当箇所を Read で確認し、`homepage-*` 参照の取りこぼし or import 不整合を修正する。よくあるパターン:

1. `Module not found` — Task 7/8/13/14 で削除したファイルの import が残っている
2. `Property 'getHomepageSectionsQuery' does not exist` — Task 12/14 で削除した関数を参照している
3. `Type ... not assignable to ...` — Task 4 で書き直した `DEFAULT_PAGE_SECTIONS["home"]` の config が schema と非互換

各エラーを `grep -rn "<symbol>" src/` で残骸を発見し、適切に修正する。

- [ ] **Step 17.2: 関連 grep で残存ゼロ確認**

```bash
grep -rnE "homepage-(how-it-works|spaces|features|cta)" src/ __tests__/ 2>&1 | grep -v "node_modules\|\.next" | head -50
```

期待: ヒット 0（homepage-hero への参照は Phase 1 で削除済み、Phase 2 は homepage-\* 全体を消す）。残存は dead code として削除。

- [ ] **Step 17.3: HomepageSections / getHomepagePublicData の grep**

```bash
grep -rnE "HomepageSections|getHomepagePublicData|HomepagePublicData|ensureHomepageSections|migrateHomepageSectionsToPageId|getHomepageSection" src/ __tests__/ 2>&1 | grep -v "node_modules\|\.next" | head -50
```

期待: ヒット 0。残存は前 Task で漏れた箇所として修正する。

---

### Task 18: 最終 validate + build

**Implementer はこの Task で「実装完了報告」を出して終了する。実装中の commit は禁止。**

- [ ] **Step 18.1: validate**

```bash
bun run validate 2>&1 | tail -50
```

期待: `EXIT=0`。エラーが残っていれば Task 17 に戻ってエラーパターンごとに修正する。

- [ ] **Step 18.2: build**

```bash
bun run build 2>&1 | tail -30
```

期待: `EXIT=0`。Next.js 16 の standalone build まで通過すること。

- [ ] **Step 18.3: 該当テストのみピンポイント実行**

per-directory バッチではなく単一ファイル指定で確認:

```bash
bun test __tests__/unit/domain/sections/registry.test.ts
bun test __tests__/integration/actions/homepage.test.ts
bun test __tests__/unit/shared/lib/sections/page-templates.test.ts
bun test __tests__/unit/shared/lib/sections/buttons-factory.test.ts
bun test __tests__/unit/lib/validations/homepage-section.test.ts
```

期待: 全 5 ファイル pass。

- [ ] **Step 18.4: 完了報告**

implementer は完了報告を以下フォーマットで返す（subagent-dispatch-template の規律）:

```
## 完了報告
- Task 1-18 を完了。
- ファイル変更: <files modified count> / 削除: <files deleted count>
- bun run validate: EXIT=<code>
- bun run build: EXIT=<code>
- bun test （5 ファイル）: <pass/fail summary>
- DEVIATION: <plan からの逸脱があれば箇条書き、なければ "なし">
- BLOCKED: <implementer 単独で解決できなかった事項、なければ "なし">
- 注意点: <controller が commit 前に確認すべきこと>

git status / git add / git commit / git push は実行していません。
```

---

### Task 19: Controller による最終検証 + commit（implementer 完了後）

**この Task は implementer 実行後に controller が行う**。

- [ ] **Step 19.1: 報告内容の独立検証**

```bash
git status --short
git diff --stat HEAD
git log --oneline -5
```

implementer 報告と git state を照合する。捏造の signs（変更件数の食い違い等）があれば再 dispatch。

- [ ] **Step 19.2: validate + build を controller 自身で再実行**

```bash
bun run validate && bun run build
echo "FINAL EXIT=$?"
```

期待: `FINAL EXIT=0`。

- [ ] **Step 19.3: 1 commit を作成**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(sections): merge homepage-* into standard section types

Phase 2 of Page Template Architecture (spec 2026-05-05). Removes Homepage
特例 (`getHomepagePublicData()` / `HomepageSections.tsx` / `homepage-*` 4
section types) and migrates the homepage to the unified
`getPageSectionsWithFallback("home")` + `<SectionRenderer>` template.

- Destructive migration rewrites existing `homepage-*` Section rows to
  `features` / `space-showcase` / `cta` (clean break, visual regression
  on `valueProps` band and carousel autoplay accepted per spec §11).
- Deletes 4 `definitions/homepage-*/` schemas, 5 `_components/homepage/`
  components, `HomepageSections.tsx`, admin homepage API route +
  `homepage-settings.ts` queries, `ensureHomepageSectionsCommand` /
  `migrateHomepageSectionsToPageId` helpers.
- Updates registry (24 → 20 section types), `PAGE_TEMPLATES.home`,
  `DEFAULT_PAGE_SECTIONS.home`, `SECTION_TYPE_STYLES`, registry +
  homepage + buttons-factory unit tests.
- `src/app/(public)/page.tsx` and `(preview)/preview/pages/[slug]/page.tsx`
  now use the unified rendering path with no slug-specific branches.

ref: docs/superpowers/specs/2026-05-05-page-template-architecture-design.md
spec: docs/superpowers/plans/2026-05-05-page-template-arch-phase-2.md
EOF
)"
```

注意: implementer は git 全面禁止。**controller のみが commit を作成する**。

- [ ] **Step 19.4: main へ FF merge + handoff memory 更新**

worktree 上で commit 後、controller が main に切り替えて FF merge:

```bash
git -C . checkout main
git -C . merge --ff-only worktree-feature+page-template-arch-phase-2
git worktree remove .claude/worktrees/feature+page-template-arch-phase-2 --force
git branch -d worktree-feature+page-template-arch-phase-2
git worktree prune
```

main の handoff memory (`~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_page-template-arch-handoff.md`) を Phase 2 完了状態に更新（Phase 2 行を「main `<SHA>` で merge 済」、Phase 3 を次セッションのターゲットに）。

---

## Self-Review（plan 作成者最終チェック）

1. **Spec coverage（spec §Phase 2 の各項目を本 plan のどの Task が実装するか）**
   - destructive migration: Task 2
   - `definitions/homepage-*/` 4 ディレクトリ削除: Task 7
   - `registry.ts` から該当 import 削除: Task 5
   - `HomepageSections.tsx` / `getHomepagePublicData()` / `_components/homepage/*` 削除: Task 8 / 11
   - `src/app/(public)/page.tsx` 統一テンプレート化: Task 9
   - 既存 unit / integration テストの homepage-related を削除/更新 + 新規 smoke test 追加: Task 16（plan は新規 smoke test を追加せず、既存 homepage.test.ts の Phase A describe を Phase B 拡張で代用 — 実質的に smoke test の役割を果たす）

2. **Placeholder scan**: TBD / TODO / 「適切に修正する」等の placeholder は **Step 17.1** にのみ残る（lint エラー個別対応は plan で全列挙不可能なため、type-check 出力ベースの判断にするのは許容）。

3. **Type consistency**: features schema の `itemLayout` 値は `featuresLayoutValues` (= `"hero-first" | "equal-grid" | "icon-left"`) と整合。space-showcase の `imageAspect` 値は `showcaseImageAspectValues` で確認済み。Migration SQL の field 名は新 schema と完全一致。

4. **追加 grep 検証（plan 内未記載）**: Implementer は Step 17.2-17.3 で homepage 関連シンボルが完全消滅したことを確認するため、grep ベースの dead code 検出フローが組み込まれている。

---

## Risks / Trade-offs

| リスク                                                                                         | 対策                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `homepage-how-it-works` の `valueProps` 帯（4 文字列ピル）が drop され視覚 regression          | spec §11 で許容済（clean break）。必要なら Phase 4 以降で `features` schema に `valueProps` field を新設                           |
| `homepage-spaces` の `autoPlayInterval`（自動回転 carousel）が drop されホームの動き感が消える | spec §11 で許容済。`space-showcase` に carousel variant を追加するのは Phase 4 のスコープ                                          |
| Migration `LEAST(count, 12)` で `count > 12` だった既存 home page の表示数が 12 に縮小         | seed 既定値 6 のため実害は本番 instance のみ。手動 Section 編集で復旧可能                                                          |
| `getShowcaseSpaces` が他経路で使用されている前提が崩れた場合                                   | Step 11.2 で grep 確認、ヒット 0 なら同時削除（dead code 禁止）                                                                    |
| `homepage-settings.ts` 削除で admin 側が壊れる                                                 | Step 14.2 で呼び出し元 grep、残骸あれば controller に escalate                                                                     |
| Migration が staging / 本番の DB に未適用のまま CI が通る                                      | Cloud Build が `prisma-migrate` Cloud Run Job を deploy 前に自動実行するため、CI/CD 経路で適用される（`docs/how-to/deploy.md` §6） |

---

## Out of Scope（Phase 2 では対応しない）

- `space-showcase` への carousel variant 追加（Phase 4）
- `features` への numbered-list 専用 variant 追加（Phase 3 / 4）
- 7 公開 page.tsx の `trailingSections` filter 撤廃（Phase 6）
- `AddSectionDialog` の template-aware フィルタ（Phase 6）
- `SectionType` (in `validations/section.ts`) の export からの `HOMEPAGE_*` 値削除 — そもそも存在しない（Phase 1 で homepage-\* は SectionType enum 外にあった）

---

## 参考

- spec: `docs/superpowers/specs/2026-05-05-page-template-architecture-design.md`
- Phase 1 commit: `2cf4475e feat(pages): introduce Page.template + PAGE_TEMPLATES SSoT`
- handoff memory: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_page-template-arch-handoff.md`
- subagent dispatch 規律: `.claude/skills/subagent-dispatch-template/SKILL.md`
