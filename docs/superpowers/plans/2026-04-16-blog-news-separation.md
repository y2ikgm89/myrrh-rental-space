# Blog/News Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/journal` 統合ページを廃止し、`/posts`（ブログ一覧）と `/news`（お知らせ一覧）の独立ページに分離する。

**Architecture:** 既存の `PostGrid` / `NewsList` コンポーネントを再利用し、各一覧ページを新設。`/journal` とその専用コンポーネント・パーサーは完全削除。パンくず・サイドバー・セクション定義のリンク先を `/posts` / `/news` に更新。RSS フィードを Route Handler で追加。

**Tech Stack:** Next.js 16 (`'use cache'`, PPR, `generateMetadata`), nuqs 2.8, Zod 4, React 19

**Spec:** `docs/superpowers/specs/2026-04-16-blog-news-separation-design.md`

---

### Task 1: Create `/posts` blog listing page

**Files:**

- Create: `src/app/(public)/posts/page.tsx`
- Create: `src/app/(public)/posts/loading.tsx`
- Create: `src/app/(public)/posts/error.tsx`

- [ ] **Step 1: Create `posts/loading.tsx`**

```tsx
export default function PostsLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  );
}
```

- [ ] **Step 2: Create `posts/error.tsx`**

```tsx
"use client";

import { ResourceError } from "@/public/components/error-boundary";

export default function PostsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ResourceError error={error} reset={reset} resourceName="ブログ" />;
}
```

Note: `ResourceError` がなければ、既存の `/news/[slug]/error.tsx` や `/journal/error.tsx` のパターンを踏襲する。実装時に確認して合わせること。

- [ ] **Step 3: Create `posts/page.tsx`**

```tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import {
  getPublishedPostsList,
  getPostCategories,
} from "@/shared/domain/posts/queries";
import { getPageShowSidebar } from "@/shared/domain/pages/queries";
import { Container } from "@/public/components/design-system/container";
import { Pagination } from "@/public/components/pagination";
import { postsSearchParams } from "@/public/lib/search-params";
import { SearchBar } from "@/public/components/ui/search-bar";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { BlogLayout } from "@/public/components/layouts/blog-layout";
import { PostGrid } from "./_components/post-grid";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
import { getBaseUrl } from "@/shared/lib/constants";
import { PostCategoryFilter } from "./_components/post-category-filter";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

const POSTS_PER_PAGE = 12;

const FALLBACK_METADATA: Metadata = {
  title: "ブログ",
  description: "最新のブログ記事をお届けします。",
};

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  try {
    return await generatePageMetadata("posts");
  } catch {
    return FALLBACK_METADATA;
  }
}

export default async function PostsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  const { page, q, category } = await postsSearchParams.parse(searchParams);
  const currentPage = Math.max(1, page);

  const [sections, postsResult, categories, showSidebar] = await Promise.all([
    getPageSectionsWithFallback("posts"),
    getPublishedPostsList(currentPage, POSTS_PER_PAGE, q, category),
    getPostCategories(),
    getPageShowSidebar("posts"),
  ]);

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) =>
      s !== heroSection &&
      s.type !== "hero" &&
      s.type !== "hero-parallax" &&
      s.type !== "post-list" &&
      s.type !== "cta",
  );

  const baseUrl = getBaseUrl();

  const preservedQuery: Record<string, string | undefined> = {};
  if (q) preservedQuery["q"] = q;
  if (category) preservedQuery["category"] = category;

  return (
    <PageLayout
      variant="content"
      hero={heroSection ? <SectionRenderer section={heroSection} /> : undefined}
      cta={<SiteCTA />}
    >
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: "/" },
          { name: "ブログ", url: `${baseUrl}/posts` },
        ]}
      />

      <section className="pt-10 pb-[var(--spacing-section)] md:pt-14">
        <Container>
          <BlogLayout showSidebar={showSidebar}>
            <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-md flex-1">
                <Suspense fallback={null}>
                  <SearchBar placeholder="記事を検索..." />
                </Suspense>
              </div>
            </div>

            {categories.length > 0 ? (
              <Suspense fallback={null}>
                <PostCategoryFilter categories={categories} />
              </Suspense>
            ) : null}

            <PostGrid posts={postsResult.posts} />

            <Pagination
              currentPage={currentPage}
              totalPages={postsResult.totalPages}
              basePath="/posts"
              {...(Object.keys(preservedQuery).length > 0
                ? { preservedQuery }
                : {})}
            />
          </BlogLayout>
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
```

- [ ] **Step 4: Create `PostCategoryFilter` component**

Create `src/app/(public)/posts/_components/post-category-filter.tsx`:

```tsx
"use client";

import type { ReactElement } from "react";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";
import { cn } from "@/shared/lib/cn";
import { postsSearchParamsParsers } from "@/public/lib/search-params";

interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

interface PostCategoryFilterProps {
  readonly categories: readonly CategoryOption[];
}

export function PostCategoryFilter({
  categories,
}: PostCategoryFilterProps): ReactElement {
  const [params, setParams] = useQueryStates(postsSearchParamsParsers, {
    history: "push",
    shallow: false,
  });
  const [isPending, startTransition] = useTransition();

  const activeCategory = params.category;

  function handleFilter(categorySlug: string | null) {
    startTransition(() => {
      void setParams({ category: categorySlug, page: 1 });
    });
  }

  return (
    <nav
      aria-label="カテゴリフィルタ"
      className={cn(
        "mb-8 transition-opacity duration-300",
        isPending && "opacity-60",
      )}
    >
      <ul className="flex flex-wrap gap-3" role="list">
        <li>
          <button
            type="button"
            onClick={() => handleFilter(null)}
            aria-pressed={!activeCategory}
            className={cn(
              "px-5 py-2 text-[0.65rem] uppercase tracking-[0.18em] transition-all duration-300",
              !activeCategory
                ? "bg-accent text-accent-foreground"
                : "border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30",
            )}
          >
            All
          </button>
        </li>
        {categories.map((cat) => (
          <li key={cat.id}>
            <button
              type="button"
              onClick={() => handleFilter(cat.slug)}
              aria-pressed={activeCategory === cat.slug}
              className={cn(
                "px-5 py-2 text-[0.65rem] uppercase tracking-[0.18em] transition-all duration-300",
                activeCategory === cat.slug
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )}
            >
              {cat.name}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 5: Run type-check**

Run: `bun run type-check`
Expected: PASS (no errors related to new files)

- [ ] **Step 6: Commit**

```
feat(public): add /posts blog listing page

- PostGrid + BlogLayout + PostCategoryFilter
- SearchBar + Pagination with nuqs search params
- PageHero from section system
- BreadcrumbJsonLd for SEO
```

---

### Task 2: Create `/news` listing page

**Files:**

- Create: `src/app/(public)/news/page.tsx`
- Create: `src/app/(public)/news/loading.tsx`
- Create: `src/app/(public)/news/error.tsx`

- [ ] **Step 1: Create `news/loading.tsx`**

```tsx
export default function NewsLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  );
}
```

- [ ] **Step 2: Create `news/error.tsx`**

既存の `news/[slug]/error.tsx` と同パターンで作成。実装時に Read して合わせること。

- [ ] **Step 3: Create `news/page.tsx`**

```tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { getPublishedNewsList } from "@/shared/domain/news/queries";
import { Container } from "@/public/components/design-system/container";
import { Pagination } from "@/public/components/pagination";
import { newsSearchParams } from "@/public/lib/search-params";
import { SearchBar } from "@/public/components/ui/search-bar";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { NewsList } from "./_components/news-list";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
import { getBaseUrl } from "@/shared/lib/constants";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

const NEWS_PER_PAGE = 20;

const FALLBACK_METADATA: Metadata = {
  title: "お知らせ",
  description: "最新のお知らせ情報をお届けします。",
};

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  try {
    return await generatePageMetadata("news");
  } catch {
    return FALLBACK_METADATA;
  }
}

export default async function NewsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  const { page, q } = await newsSearchParams.parse(searchParams);
  const currentPage = Math.max(1, page);

  const [sections, newsResult] = await Promise.all([
    getPageSectionsWithFallback("news"),
    getPublishedNewsList(currentPage, NEWS_PER_PAGE, q),
  ]);

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) =>
      s !== heroSection &&
      s.type !== "hero" &&
      s.type !== "hero-parallax" &&
      s.type !== "news-list" &&
      s.type !== "cta",
  );

  const baseUrl = getBaseUrl();

  const preservedQuery: Record<string, string | undefined> = {};
  if (q) preservedQuery["q"] = q;

  return (
    <PageLayout
      variant="content"
      hero={heroSection ? <SectionRenderer section={heroSection} /> : undefined}
      cta={<SiteCTA />}
    >
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: "/" },
          { name: "お知らせ", url: `${baseUrl}/news` },
        ]}
      />

      <section className="pt-10 pb-[var(--spacing-section)] md:pt-14">
        <Container>
          <div className="mb-8 max-w-md">
            <Suspense fallback={null}>
              <SearchBar placeholder="お知らせを検索..." />
            </Suspense>
          </div>

          <NewsList items={newsResult.items} />

          <Pagination
            currentPage={currentPage}
            totalPages={newsResult.totalPages}
            basePath="/news"
            {...(Object.keys(preservedQuery).length > 0
              ? { preservedQuery }
              : {})}
          />
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
```

- [ ] **Step 4: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(public): add /news listing page

- NewsList + SearchBar + Pagination
- PageHero from section system
- BreadcrumbJsonLd for SEO
```

---

### Task 3: Update breadcrumbs and sidebar links (journal → posts/news)

**Files:**

- Modify: `src/app/(public)/posts/_components/post-detail-page-content.tsx`
- Modify: `src/app/(public)/news/_components/news-detail-page-content.tsx`
- Modify: `src/app/(public)/_shared/components/sidebar/sidebar-categories.tsx`
- Modify: `src/app/(public)/_shared/components/sidebar/sidebar-tags.tsx`

- [ ] **Step 1: Update post detail breadcrumb**

In `post-detail-page-content.tsx`, change line 84:

```tsx
// Before:
{ label: "ブログ", href: "/journal?tab=posts" },

// After:
{ label: "ブログ", href: "/posts" },
```

- [ ] **Step 2: Update news detail breadcrumb**

In `news-detail-page-content.tsx`, change line 87:

```tsx
// Before:
{ label: "お知らせ", href: "/journal?tab=news" },

// After:
{ label: "お知らせ", href: "/news" },
```

- [ ] **Step 3: Update sidebar categories link**

In `sidebar-categories.tsx`, change line 21:

```tsx
// Before:
href={`/journal?tab=posts&category=${cat.slug}`}

// After:
href={`/posts?category=${cat.slug}`}
```

- [ ] **Step 4: Update sidebar tags link**

In `sidebar-tags.tsx`, change line 19:

```tsx
// Before:
href={`/journal?tag=${tag.slug}`}

// After:
href={`/posts?tag=${tag.slug}`}
```

- [ ] **Step 5: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 6: Commit**

```
fix(public): update breadcrumbs and sidebar links from /journal to /posts and /news
```

---

### Task 4: Update section definitions and search params

**Files:**

- Modify: `src/shared/lib/sections/definitions/post-list/schema.ts`
- Modify: `src/shared/lib/sections/definitions/news-list/schema.ts`
- Modify: `src/app/(public)/_shared/lib/search-params.ts`

- [ ] **Step 1: Update post-list section default URL**

In `post-list/schema.ts`, change line 21:

```tsx
// Before:
.text("全件リンクURL", { default: "/journal?tab=posts" })

// After:
.text("全件リンクURL", { default: "/posts" })
```

- [ ] **Step 2: Update news-list section default URL**

In `news-list/schema.ts`, change line 20:

```tsx
// Before:
.text("全件リンクURL", { default: "/journal?tab=news" })

// After:
.text("全件リンクURL", { default: "/news" })
```

- [ ] **Step 3: Remove journal search params**

In `search-params.ts`, delete the journal-related code (lines 56-64):

```tsx
// DELETE these lines:
export const journalSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  q: parseAsString.withDefault(""),
  tab: parseAsString.withDefault("all"),
};

export const journalSearchParams = createSearchParamsCache(
  journalSearchParamsParsers,
);
```

- [ ] **Step 4: Run type-check**

Run: `bun run type-check`
Expected: PASS (no remaining references to journal search params after journal page deletion in Task 5)

If type-check fails because journal page still imports the deleted parsers, proceed to Task 5 first. The tasks can be done in any order — the important thing is both are done.

- [ ] **Step 5: Commit**

```
refactor: update section defaults and remove journal search params
```

---

### Task 5: Delete `/journal` page and components

**Files:**

- Delete: `src/app/(public)/journal/page.tsx`
- Delete: `src/app/(public)/journal/_components/JournalContent.tsx`
- Delete: `src/app/(public)/journal/loading.tsx`
- Delete: `src/app/(public)/journal/error.tsx`
- Delete: `src/app/(public)/journal/` directory

- [ ] **Step 1: Delete journal directory**

```bash
git rm -r 'src/app/(public)/journal'
```

Note: MINGW64 では `()` を含むパスは git rm でシングルクォートで囲む。失敗する場合は `python3 -c "import shutil; shutil.rmtree('src/app/(public)/journal')"` + `git add -u` を使用。

- [ ] **Step 2: Verify no remaining journal imports**

Run: `grep -r "journalSearchParams\|JournalContent\|/journal" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules`

Expected: ゼロ件（search-params.ts の journal パーサーは Task 4 で削除済み）

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```
refactor: remove /journal unified page

BREAKING CHANGE: /journal URL no longer exists.
Blog listing is now at /posts, news listing at /news.
```

---

### Task 6: Add RSS feed Route Handler

**Files:**

- Create: `src/app/(public)/feed.xml/route.ts`

- [ ] **Step 1: Create RSS feed route**

```tsx
import { getPublishedPostsList } from "@/shared/domain/posts/queries";
import { getBaseUrl } from "@/shared/lib/constants";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(): Promise<Response> {
  const baseUrl = getBaseUrl();
  const result = await getPublishedPostsList(1, 20);

  const items = result.posts
    .map(
      (post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <description>${escapeXml(post.excerpt)}</description>
      <link>${baseUrl}${post.url}</link>
      <pubDate>${post.publishedAt ? new Date(post.publishedAt).toUTCString() : ""}</pubDate>
      <guid isPermaLink="false">${post.id}</guid>
    </item>`,
    )
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ブログ</title>
    <link>${baseUrl}/posts</link>
    <description>最新のブログ記事</description>
    <language>ja</language>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```
feat(public): add /feed.xml RSS feed for blog posts
```

---

### Task 7: Update E2E tests and fixtures

**Files:**

- Modify: `e2e/fixtures/test-data.ts`
- Modify: `e2e/visual/public-pages.spec.ts`
- Modify: `e2e/a11y/axe-public-pages.spec.ts`

- [ ] **Step 1: Update test-data.ts**

Change `journal` entry to `posts` and add `news` if missing:

```tsx
// Before:
journal: "/journal",

// After (replace journal):
posts: "/posts",
```

Verify `news: "/news"` already exists (it does at line 96).
Remove the `blog: "/blog"` entry (line 94) if present — it's now `posts: "/posts"`.

- [ ] **Step 2: Update visual test**

In `e2e/visual/public-pages.spec.ts`, replace journal test (around line 86-91):

```tsx
// Before:
await page.goto(urls.journal);
// ...
await expect(page).toHaveScreenshot("journal-list.png", {

// After:
await page.goto(urls.posts);
// ...
await expect(page).toHaveScreenshot("posts-list.png", {
```

Add a separate news list test:

```tsx
await page.goto(urls.news);
await page.waitForLoadState("networkidle");
await expect(page).toHaveScreenshot("news-list.png", {
  maxDiffPixelRatio: 0.01,
});
```

- [ ] **Step 3: Update a11y test**

In `e2e/a11y/axe-public-pages.spec.ts`, replace journal test (around line 101):

```tsx
// Before:
await page.goto(urls.journal);

// After:
await page.goto(urls.posts);
```

Add a separate news a11y test:

```tsx
await page.goto(urls.news);
await page.waitForLoadState("networkidle");
// ... axe scan
```

- [ ] **Step 4: Commit**

```
test: update e2e tests for /posts and /news (replace /journal)
```

---

### Task 8: Update seed, documentation, and final cleanup

**Files:**

- Modify: `prisma/seed.ts` — Page レコードを journal → posts + news に分離
- Modify: `.claude/rules/gotchas.md` — journal 記述を更新
- Modify: `CLAUDE.md` — journal 記述があれば更新

- [ ] **Step 1: Update seed.ts**

Find the Page seeding for `journal` slug and replace with two entries for `posts` and `news`. Read `prisma/seed.ts` to find the exact location and pattern. The Page record should have:

- `slug: "posts"`, `title: "ブログ"` (with appropriate sections)
- `slug: "news"`, `title: "お知らせ"` (with appropriate sections)

If `journal` Page record exists, replace it. If not, add both.

- [ ] **Step 2: Update gotchas.md**

Find and replace the journal-related gotcha:

```markdown
// Before:

- **`/news` `/posts` 一覧ページは `/journal` に統合済み** — 詳細ページ（`/news/[slug]`、`/posts/[...segments]`）は維持。パンくずリンクは `/journal?tab=news` / `/journal?tab=posts`

// After:

- **`/posts` はブログ一覧、`/news` はお知らせ一覧** — 各詳細ページ（`/news/[slug]`、`/posts/[...segments]`）も個別に維持。`/journal` は廃止済み
```

- [ ] **Step 3: Check for any remaining journal references**

Run: `grep -r "journal" src/ prisma/ .claude/ e2e/ --include="*.ts" --include="*.tsx" --include="*.md" | grep -v node_modules | grep -v ".next" | grep -v "docs/plans" | grep -v "docs/superpowers"`

Fix any remaining references found.

- [ ] **Step 4: Run full validation**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 5: Commit**

```
chore: update seed and docs for blog/news separation

- Replace journal Page record with posts + news
- Update gotchas.md
- Remove all remaining /journal references
```
