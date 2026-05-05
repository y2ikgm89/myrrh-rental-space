# Page Template Architecture — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Page.template` カラム追加 + `PAGE_TEMPLATES` SSoT を導入し、後続 phase の基盤を整備する（既存挙動への影響なし）。

**Architecture:** Sanity / Payload / Contentful の page-builder pattern に準拠。Page template 識別子で `allowedSectionTypes` を declarative に定義する SSoT を `src/shared/lib/sections/page-templates.ts` に新設。Migration で既存 11 ページに slug 別 template 値を割当。

**Tech Stack:** Prisma 7 / TypeScript 6.0 / Zod 4 / bun:test

**Spec:** `docs/superpowers/specs/2026-05-05-page-template-architecture-design.md`

**所要 commit 数:** 1

---

## File Structure

| Path                                                            | Action | 責務                                                                          |
| --------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                          | Modify | `Page` モデルに `template String @db.VarChar(64)` 追加                        |
| `prisma/migrations/<timestamp>_add_page_template/migration.sql` | Create | `template` カラム追加 + 既存レコードへ slug 別 default 値割当                 |
| `src/shared/lib/sections/page-templates.ts`                     | Create | `PageTemplate` 型 + `PAGE_TEMPLATES` const + helper 関数                      |
| `src/shared/lib/sections/types.ts`                              | Modify | `SectionType` の export を確認（既存・無変更想定）                            |
| `__tests__/unit/shared/lib/sections/page-templates.test.ts`     | Create | unit tests                                                                    |
| `src/admin/queries/page.ts`                                     | Modify | `getPagesList` の `select` に `template: true` 追加                           |
| `src/admin/queries/page-section.ts`                             | Modify | `getPageForEdit` / `getPageWithSections` の `select` に `template: true` 追加 |
| `src/shared/domain/pages/types.ts`                              | Modify | Page domain type に `template: string` 追加（存在する場合）                   |

**注**: 公開 page.tsx・SectionRenderer・管理 UI は本 phase で変更しない（既存挙動維持）。

---

## Tasks

### Task 1: Prisma schema 変更 + migration 作成

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_page_template/migration.sql`

- [ ] **Step 1: 現状の `Page` モデルを確認**

```bash
grep -A 30 '^model Page ' prisma/schema.prisma
```

Expected: `model Page { ... }` の field 一覧表示。`template` field がまだ無いことを確認。

- [ ] **Step 2: `Page.template` field 追加**

`prisma/schema.prisma` の `model Page` 内に以下を追加:

```prisma
model Page {
  // ... 既存 field ...
  template  String   @db.VarChar(64)
  // ... 残り field ...
}
```

`@default` は付けない（migration data step で全レコード割当 → NOT NULL 確定するため）。

- [ ] **Step 3: 非対話 migration 作成（CLAUDE.md 規律）**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
mkdir -p "prisma/migrations/${TS}_add_page_template"
```

`prisma/migrations/<timestamp>_add_page_template/migration.sql` に以下を Python で書き出す:

```bash
python3 -c "
import os
ts = os.environ['TS']
sql = '''-- Add Page.template column with slug-based default values
ALTER TABLE \"pages\" ADD COLUMN \"template\" VARCHAR(64);

-- Assign template per slug (clean-break: 既存 11 page slug を全網羅)
UPDATE \"pages\" SET \"template\" = 'home' WHERE \"slug\" = 'home';
UPDATE \"pages\" SET \"template\" = 'content' WHERE \"slug\" = 'about';
UPDATE \"pages\" SET \"template\" = 'access' WHERE \"slug\" = 'access';
UPDATE \"pages\" SET \"template\" = 'contact' WHERE \"slug\" = 'contact';
UPDATE \"pages\" SET \"template\" = 'faq' WHERE \"slug\" = 'faq';
UPDATE \"pages\" SET \"template\" = 'news-archive' WHERE \"slug\" = 'news';
UPDATE \"pages\" SET \"template\" = 'blog-archive' WHERE \"slug\" = 'posts';
UPDATE \"pages\" SET \"template\" = 'events-archive' WHERE \"slug\" = 'events';
UPDATE \"pages\" SET \"template\" = 'spaces-archive' WHERE \"slug\" = 'spaces';
UPDATE \"pages\" SET \"template\" = 'reservation' WHERE \"slug\" = 'reservation';
UPDATE \"pages\" SET \"template\" = 'custom' WHERE \"template\" IS NULL;

-- Enforce NOT NULL
ALTER TABLE \"pages\" ALTER COLUMN \"template\" SET NOT NULL;
'''
with open(f'prisma/migrations/{ts}_add_page_template/migration.sql', 'w', encoding='utf-8') as f:
    f.write(sql)
print(f'Created: prisma/migrations/{ts}_add_page_template/migration.sql')
"
```

- [ ] **Step 4: Migration 適用 + Prisma generate**

```bash
bunx --bun prisma db execute --file "prisma/migrations/${TS}_add_page_template/migration.sql"
bunx --bun prisma migrate resolve --applied "${TS}_add_page_template"
bunx --bun prisma generate
```

Expected: 全コマンド exit 0。`generated/prisma/client/index.d.ts` に `template: string` が反映されている。

- [ ] **Step 5: 適用後の DB 状態確認**

```bash
bunx --bun prisma db execute --stdin <<<"SELECT slug, template FROM pages ORDER BY slug;"
```

Expected: 既存全 page に template 値が入っている。

---

### Task 2: PAGE_TEMPLATES SSoT 作成

**Files:**

- Create: `src/shared/lib/sections/page-templates.ts`
- Test: `__tests__/unit/shared/lib/sections/page-templates.test.ts`

- [ ] **Step 1: 既存 SectionType 定義を確認**

```bash
grep -n "export type SectionType\|export const SectionType" src/shared/lib/sections/types.ts
```

Expected: `SectionType` 型の export を確認。

- [ ] **Step 2: 失敗テストを書く（unit test 先行）**

`__tests__/unit/shared/lib/sections/page-templates.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import {
  PAGE_TEMPLATES,
  getPageTemplate,
  isAllowedSectionForTemplate,
} from "@/shared/lib/sections/page-templates";

describe("PAGE_TEMPLATES", () => {
  it("contains all 11 expected templates", () => {
    const expected = [
      "home",
      "content",
      "access",
      "contact",
      "faq",
      "news-archive",
      "blog-archive",
      "events-archive",
      "spaces-archive",
      "reservation",
      "custom",
    ];
    expect(Object.keys(PAGE_TEMPLATES).sort()).toEqual(expected.sort());
  });

  it("each template has non-empty allowedSectionTypes", () => {
    for (const [id, tpl] of Object.entries(PAGE_TEMPLATES)) {
      expect(tpl.allowedSectionTypes.length).toBeGreaterThan(0);
      expect(tpl.id).toBe(id);
    }
  });

  it("requiredSectionTypes is subset of allowedSectionTypes", () => {
    for (const tpl of Object.values(PAGE_TEMPLATES)) {
      const required = tpl.requiredSectionTypes ?? [];
      for (const type of required) {
        expect(tpl.allowedSectionTypes).toContain(type);
      }
    }
  });

  it("defaultSections types are all allowed", () => {
    for (const tpl of Object.values(PAGE_TEMPLATES)) {
      for (const section of tpl.defaultSections) {
        expect(tpl.allowedSectionTypes).toContain(section.type);
      }
    }
  });
});

describe("getPageTemplate", () => {
  it("returns template for known id", () => {
    expect(getPageTemplate("home")?.id).toBe("home");
  });

  it("returns undefined for unknown id", () => {
    expect(getPageTemplate("nonexistent")).toBeUndefined();
  });
});

describe("isAllowedSectionForTemplate", () => {
  it("returns true when type is in allowedSectionTypes", () => {
    expect(isAllowedSectionForTemplate("home", "page-hero")).toBe(true);
  });

  it("returns false when type is not allowed", () => {
    expect(isAllowedSectionForTemplate("contact", "space-list")).toBe(false);
  });

  it("returns false for unknown template", () => {
    expect(isAllowedSectionForTemplate("nonexistent", "page-hero")).toBe(false);
  });
});
```

- [ ] **Step 3: テスト実行で失敗を確認**

```bash
bun test __tests__/unit/shared/lib/sections/page-templates.test.ts
```

Expected: FAIL（`Cannot find module '@/shared/lib/sections/page-templates'`）

- [ ] **Step 4: `page-templates.ts` 実装**

`src/shared/lib/sections/page-templates.ts`（注: `defaultSections` の中身は `src/shared/lib/constants/default-page-sections.ts` の `DEFAULT_PAGE_SECTIONS` から該当 slug 分を import 引用すると DRY だが、本 phase では値を inline 定義 — Phase 6 で SSoT 統合する）:

```typescript
import type { DefaultSectionDef } from "@/shared/lib/constants/default-page-sections";
import { DEFAULT_PAGE_SECTIONS } from "@/shared/lib/constants/default-page-sections";

export interface PageTemplate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly allowedSectionTypes: readonly string[];
  readonly defaultSections: readonly DefaultSectionDef[];
  readonly requiredSectionTypes?: readonly string[];
}

const STANDARD_CONTENT_TYPES = [
  "page-hero",
  "hero",
  "hero-parallax",
  "custom",
  "concept",
  "features",
  "testimonial",
  "gallery",
  "cta",
  "instagram",
  "embed",
  "map",
] as const;

export const PAGE_TEMPLATES = {
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
  content: {
    id: "content",
    label: "コンテンツページ",
    description: "/about のような自由構成",
    allowedSectionTypes: STANDARD_CONTENT_TYPES,
    defaultSections: DEFAULT_PAGE_SECTIONS["about"] ?? [],
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
    defaultSections: DEFAULT_PAGE_SECTIONS["access"] ?? [],
    requiredSectionTypes: ["location-list"],
  },
  contact: {
    id: "contact",
    label: "お問い合わせ",
    description: "問い合わせフォーム + 補足",
    // contact-form type は Phase 3 で追加予定。Phase 1 では Section type が無いため使えないが、
    // テンプレート定義としては allowedSectionTypes に含めておく。
    allowedSectionTypes: ["page-hero", "hero", "contact-form", "custom", "map"],
    defaultSections: DEFAULT_PAGE_SECTIONS["contact"] ?? [],
    requiredSectionTypes: ["contact-form"],
  },
  faq: {
    id: "faq",
    label: "FAQ",
    description: "よくあるご質問",
    allowedSectionTypes: ["page-hero", "hero", "faq-list", "cta", "custom"],
    defaultSections: DEFAULT_PAGE_SECTIONS["faq"] ?? [],
    requiredSectionTypes: ["faq-list"],
  },
  "news-archive": {
    id: "news-archive",
    label: "ニュース一覧",
    description: "お知らせ一覧",
    allowedSectionTypes: ["page-hero", "hero", "news-list", "cta", "custom"],
    defaultSections: DEFAULT_PAGE_SECTIONS["news"] ?? [],
    requiredSectionTypes: ["news-list"],
  },
  "blog-archive": {
    id: "blog-archive",
    label: "ブログ一覧",
    description: "ブログ記事一覧",
    allowedSectionTypes: ["page-hero", "hero", "post-list", "cta", "custom"],
    defaultSections: DEFAULT_PAGE_SECTIONS["posts"] ?? [],
    requiredSectionTypes: ["post-list"],
  },
  "events-archive": {
    id: "events-archive",
    label: "イベント一覧",
    description: "イベントカレンダー + 一覧",
    allowedSectionTypes: [
      "page-hero",
      "hero",
      "event-calendar",
      "cta",
      "custom",
    ],
    defaultSections: DEFAULT_PAGE_SECTIONS["events"] ?? [],
    requiredSectionTypes: ["event-calendar"],
  },
  "spaces-archive": {
    id: "spaces-archive",
    label: "スペース一覧",
    description: "スペース一覧",
    allowedSectionTypes: ["page-hero", "hero", "space-list", "cta", "custom"],
    defaultSections: DEFAULT_PAGE_SECTIONS["spaces"] ?? [],
    requiredSectionTypes: ["space-list"],
  },
  reservation: {
    id: "reservation",
    label: "予約",
    description: "予約フォーム",
    // reservation-form type は Phase 5 で追加予定。
    allowedSectionTypes: [
      "page-hero",
      "hero",
      "reservation-form",
      "space-list",
      "cta",
    ],
    defaultSections: DEFAULT_PAGE_SECTIONS["reservation"] ?? [],
    requiredSectionTypes: ["reservation-form"],
  },
  custom: {
    id: "custom",
    label: "カスタム",
    description: "自由構成（管理者が任意に組む）",
    allowedSectionTypes: STANDARD_CONTENT_TYPES,
    defaultSections: [
      // 最小構成: hero + custom + cta
      ...(DEFAULT_PAGE_SECTIONS["about"] ?? []).slice(0, 3),
    ],
  },
} as const satisfies Record<string, PageTemplate>;

export type PageTemplateId = keyof typeof PAGE_TEMPLATES;

export function getPageTemplate(templateId: string): PageTemplate | undefined {
  return PAGE_TEMPLATES[templateId as PageTemplateId];
}

export function isAllowedSectionForTemplate(
  templateId: string,
  sectionType: string,
): boolean {
  const template = getPageTemplate(templateId);
  if (!template) return false;
  return template.allowedSectionTypes.includes(sectionType);
}

export function isRequiredSectionForTemplate(
  templateId: string,
  sectionType: string,
): boolean {
  const template = getPageTemplate(templateId);
  if (!template) return false;
  return template.requiredSectionTypes?.includes(sectionType) ?? false;
}
```

- [ ] **Step 5: テスト再実行で pass を確認**

```bash
bun test __tests__/unit/shared/lib/sections/page-templates.test.ts
```

Expected: PASS（4 describe / 9 test 全 pass）

---

### Task 3: 既存クエリの select 拡張

**Files:**

- Modify: `src/admin/queries/page.ts`
- Modify: `src/admin/queries/page-section.ts`
- Modify: `src/shared/domain/pages/queries.ts`（公開 `getPublicPage`）
- Modify: `src/shared/domain/pages/types.ts`（型に `template` 追加）

- [ ] **Step 1: 現状の Page query の select 確認**

```bash
grep -rn "page.findMany\|page.findUnique\|page.findFirst" src/admin/queries/ src/shared/domain/pages/
```

各 query の `select: { ... }` に `template` 列を追加する箇所を特定。

- [ ] **Step 2: 各 query の `select` に `template: true` を追加**

`src/admin/queries/page.ts` の `getPagesList`:

```typescript
select: {
  id: true,
  slug: true,
  title: true,
  template: true,  // 追加
  // ... 既存 field
},
```

`src/admin/queries/page-section.ts` の `getPageForEdit` / `getPageWithSections` も同様に `template: true` を追加。

`src/shared/domain/pages/queries.ts` の `getPublicPage` も同様。

- [ ] **Step 3: Page domain 型に `template` 追加**

`src/shared/domain/pages/types.ts` の Page 型に `readonly template: string;` を追加。

- [ ] **Step 4: Type-check + lint**

```bash
bun run validate
```

Expected: exit 0。

- [ ] **Step 5: 既存 Integration test の smoke**

```bash
bun test __tests__/integration/actions/pages
```

Expected: 既存テスト全 pass（template 追加で破綻ないこと）。

---

### Task 4: 完了検証 + commit

- [ ] **Step 1: フル validate + build**

```bash
bun run validate && bun run build
```

Expected: exit 0。

- [ ] **Step 2: 関連 unit test 確認**

```bash
bun test __tests__/unit/shared/lib/sections/page-templates.test.ts
```

Expected: PASS。

- [ ] **Step 3: git status 確認**

```bash
git status --short
```

Expected: 以下のファイルが modified / untracked として表示:

- `prisma/schema.prisma`
- `prisma/migrations/<timestamp>_add_page_template/migration.sql`
- `src/shared/lib/sections/page-templates.ts`
- `__tests__/unit/shared/lib/sections/page-templates.test.ts`
- `src/admin/queries/page.ts`
- `src/admin/queries/page-section.ts`
- `src/shared/domain/pages/queries.ts`
- `src/shared/domain/pages/types.ts`
- `generated/prisma/**`（gitignore 済み）

- [ ] **Step 4: 明示ファイルリストで stage**

```bash
git add prisma/schema.prisma \
        "prisma/migrations/${TS}_add_page_template/migration.sql" \
        src/shared/lib/sections/page-templates.ts \
        __tests__/unit/shared/lib/sections/page-templates.test.ts \
        src/admin/queries/page.ts \
        src/admin/queries/page-section.ts \
        src/shared/domain/pages/queries.ts \
        src/shared/domain/pages/types.ts
```

Expected: `git status --short` で全ステージファイルが `A ` / `M ` で表示。

- [ ] **Step 5: commit**

```bash
git commit -m "$(cat <<'EOF'
feat(pages): introduce Page.template + PAGE_TEMPLATES SSoT

Phase 1 of page-template architecture (spec: 2026-05-05). Adds Page.template
column with slug-based default values, and a new SSoT module that defines
allowed section types per page template. No public/admin UI changes — purely
foundation for subsequent phases.
EOF
)"
```

Expected: lefthook commit-msg hook pass + commit 成功。

- [ ] **Step 6: commit 検証**

```bash
git log --oneline -1 && git show --stat HEAD
```

Expected: 上記 commit が HEAD に存在し、Stat に 8 files が表示。

---

## Self-Review

- ✅ spec の Phase 1 要件（Page.template + PAGE_TEMPLATES SSoT + 既存無影響）を全カバー
- ✅ 公開 page.tsx / SectionRenderer / 管理 UI には触らない（Phase 2 以降）
- ✅ TDD（test → fail → impl → pass）順序遵守
- ✅ exact file path / 完全な code block / exact command 全て記載
- ✅ migration data step で 11 page slug を全網羅、未知 slug は `'custom'` フォールバック

## Phase 2 以降への引継ぎ

本 plan は Phase 1 のみ。Phase 2-7 は spec の §Phase 分割に従い、別 plan ファイルに分割して順次実行する:

| Phase | plan ファイル（次セッションで作成）                                   |
| ----- | --------------------------------------------------------------------- |
| 2     | `2026-05-05-page-template-phase-2-homepage-merge.md`                  |
| 3     | `2026-05-05-page-template-phase-3-contact-faq-absorb.md`              |
| 4     | `2026-05-05-page-template-phase-4-events-spaces-posts-news-absorb.md` |
| 5     | `2026-05-05-page-template-phase-5-reservation-form.md`                |
| 6     | `2026-05-05-page-template-phase-6-pagetsx-clean-template-aware.md`    |
| 7     | `2026-05-05-page-template-phase-7-docs-sync.md`                       |

各 phase 開始時に `superpowers:writing-plans` skill を再実行し、bite-sized task に分解する。
