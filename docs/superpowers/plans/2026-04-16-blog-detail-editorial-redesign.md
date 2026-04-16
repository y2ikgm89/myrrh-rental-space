# Blog Detail Page Editorial Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the blog post detail page (`/posts/*`) with the Editorial Magazine design language (Kinfolk/Cereal) used across all other public pages.

**Architecture:** Two files change — the post detail content component gets a featured image, editorial metadata, and Prose Primitive; the sidebar gets visual dividers between widgets. No structural changes to BlogLayout or PageHero. No new files created.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, existing design system Primitives (ImageFrame, Prose)

---

### Task 1: Add featured image + editorial metadata to post detail

**Files:**

- Modify: `src/app/(public)/posts/_components/post-detail-page-content.tsx`

This task replaces the current inline Badge metadata with editorial styling, adds the featured image via ImageFrame, and switches from raw prose classes to the Prose Primitive with `variant="editorial"`.

- [ ] **Step 1: Update imports**

Open `src/app/(public)/posts/_components/post-detail-page-content.tsx` and replace the imports block entirely:

```tsx
import type { ReactElement } from "react";
import type { Metadata } from "next";
import { ArticleJsonLd } from "@/public/components/seo/json-ld";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { Prose } from "@/public/components/design-system/prose";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { ShareButtons } from "@/public/components/ui/share-buttons";
import { getBaseUrl } from "@/shared/lib/constants";
import { getPublishedPost } from "@/shared/domain/posts/queries";
import { getPostLayoutSettings } from "@/shared/domain/settings/queries/site";
import { resolveWidthStyles } from "@/shared/lib/styles/layout-mapper";
import { toISOString, formatSerializedDate } from "@/shared/lib/serialize";
import { BlogLayout } from "@/public/components/layouts/blog-layout";
```

Changes from current:

- Add: `ImageFrame` from design-system
- Add: `Prose` from design-system
- Remove: `Badge` from design-system (no longer used)

- [ ] **Step 2: Replace the JSX in `PostDetailPageContent`**

Replace the entire return block of `PostDetailPageContent` (from `return (` to the closing `);`) with:

```tsx
return (
  <>
    <ArticleJsonLd
      headline={post.title}
      description={post.metaDescription ?? post.excerpt}
      image={post.thumbnailUrl}
      url={`${baseUrl}${post.url}`}
      datePublished={datePublished}
      {...(post.author ? { author: { name: post.author.name } } : {})}
    />

    <PageHero
      variant="compact"
      title={post.title}
      breadcrumb={
        <Breadcrumb
          items={[{ label: "ブログ", href: "/posts" }, { label: post.title }]}
        />
      }
    />

    <article className="py-[var(--spacing-section)]">
      <Container>
        <BlogLayout>
          <div className={contentClassName} style={contentStyle}>
            {post.thumbnailUrl ? (
              <div className="mb-8">
                <ImageFrame
                  src={post.thumbnailUrl}
                  alt={post.title}
                  aspect="video"
                  fill
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  rounded
                />
              </div>
            ) : null}

            <div className="mb-8 flex flex-wrap items-center gap-3 text-muted-foreground">
              {post.category?.name ? (
                <span className="text-[0.7rem] uppercase tracking-[0.18em] text-accent">
                  {post.category.name}
                </span>
              ) : null}
              {post.category?.name &&
              (post.publishedAt || post.author?.name) ? (
                <span aria-hidden="true" className="text-border">
                  ·
                </span>
              ) : null}
              <time
                dateTime={
                  post.publishedAt ? String(post.publishedAt) : undefined
                }
                className="font-heading text-sm font-light"
              >
                {formatSerializedDate(toISOString(post.publishedAt))}
              </time>
              {post.author?.name ? (
                <>
                  <span aria-hidden="true" className="text-border">
                    ·
                  </span>
                  <span className="text-sm">{post.author.name}</span>
                </>
              ) : null}
            </div>

            <Prose variant="editorial" className="max-w-none">
              <SanitizedHtml html={post.contentHtml} />
            </Prose>

            {post.postTags.length > 0 ? (
              <div className="mt-12 border-t border-border pt-6">
                <div className="flex flex-wrap gap-2">
                  {post.postTags.map((postTag) => (
                    <span
                      key={postTag.tag.slug}
                      className="border border-border px-3 py-1 text-xs text-muted-foreground"
                    >
                      {postTag.tag.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-12 border-t border-border pt-6">
              <ShareButtons url={`${baseUrl}${post.url}`} title={post.title} />
            </div>
          </div>
        </BlogLayout>
      </Container>
    </article>

    <SiteCTA />
  </>
);
```

Key changes from original:

1. **Featured image**: `ImageFrame` with `aspect="video"` + `fill` + `rounded` before metadata. Only renders when `thumbnailUrl` exists.
2. **Metadata**: `Badge` removed. Category uses `text-[0.7rem] uppercase tracking-[0.18em] text-accent`. Date uses `font-heading text-sm font-light`. Separators changed from `/` to `·` with `text-border`.
3. **Prose Primitive**: `SanitizedHtml` wrapped in `<Prose variant="editorial" className="max-w-none">` instead of inline `className="prose prose-lg max-w-none"`.
4. **Tags**: `rounded-full` removed from tag spans (editorial sharp edges per project-design-config).

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: exit 0 — no type errors. `Badge` import removed, `ImageFrame` and `Prose` imports added. The `ImageFrame` `sizes` prop is required and provided.

- [ ] **Step 4: Verify visually in browser**

Navigate to `http://localhost:3000/posts/seminar-tips` and confirm:

- Featured image appears below hero, above metadata (16:9 aspect, rounded corners)
- Category label is uppercase bronze text with wide tracking
- Date is serif font, light weight
- Separators are `·` instead of `/`
- Article body has drop-cap on first paragraph
- Tags have sharp edges (no rounded-full)

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(public)/posts/_components/post-detail-page-content.tsx'
git commit -m "feat(blog): editorial redesign of post detail page

- Add featured image (ImageFrame) from thumbnailUrl
- Replace Badge metadata with editorial uppercase labels
- Switch to Prose Primitive with editorial variant (drop-cap)
- Remove rounded-full from tags (editorial sharp edges)"
```

---

### Task 2: Add visual dividers between sidebar widgets

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/blog-sidebar.tsx`

- [ ] **Step 1: Add cn import and update widget rendering**

Replace the full content of `src/app/(public)/_shared/components/layouts/blog-sidebar.tsx` with:

```tsx
import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import { SidebarSearch } from "@/public/components/sidebar/sidebar-search";
import { SidebarRecentPosts } from "@/public/components/sidebar/sidebar-recent-posts";
import { SidebarPopularPosts } from "@/public/components/sidebar/sidebar-popular-posts";
import { SidebarCategories } from "@/public/components/sidebar/sidebar-categories";
import { SidebarTags } from "@/public/components/sidebar/sidebar-tags";
import { SidebarCustom } from "@/public/components/sidebar/sidebar-custom";
import type { SidebarData } from "@/shared/domain/sidebar/queries";
import type { SidebarWidget } from "@/shared/lib/validations/sidebar";

interface BlogSidebarProps {
  readonly widgets: readonly SidebarWidget[];
  readonly data: SidebarData;
}

function renderWidget(
  widget: SidebarWidget,
  data: SidebarData,
): ReactElement | null {
  switch (widget.type) {
    case "search":
      return <SidebarSearch />;
    case "recent":
      return <SidebarRecentPosts posts={data.recentPosts} />;
    case "popular":
      return <SidebarPopularPosts posts={data.popularPosts} />;
    case "categories":
      return <SidebarCategories categories={data.categories} />;
    case "tags":
      return <SidebarTags tags={data.tags} />;
    case "custom":
      return <SidebarCustom widget={widget} />;
    default:
      return null;
  }
}

function getWidgetKey(widget: SidebarWidget): string {
  return widget.type === "custom" ? `custom:${widget.id}` : widget.type;
}

export function BlogSidebar({ widgets, data }: BlogSidebarProps): ReactElement {
  const enabledWidgets = widgets.filter((w) => w.enabled);

  return (
    <aside aria-label="ブログサイドバー" className="hidden lg:block">
      <div className="sticky top-[calc(var(--header-height)+2rem)]">
        {enabledWidgets.map((widget, index) => (
          <div
            key={getWidgetKey(widget)}
            className={cn(index > 0 && "mt-8 border-t border-border pt-8")}
          >
            {renderWidget(widget, data)}
          </div>
        ))}
      </div>
    </aside>
  );
}
```

Changes from original:

1. Add `import { cn } from "@/shared/lib/cn"`
2. Remove `space-y-8` from the sticky container
3. Add `cn(index > 0 && "mt-8 border-t border-border pt-8")` to each widget div — first widget has no border/margin, subsequent widgets get a top border with spacing
4. `map` callback now receives `index` parameter

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: exit 0

- [ ] **Step 3: Verify visually in browser**

Navigate to `http://localhost:3000/posts/seminar-tips` and confirm:

- Sidebar widgets have thin horizontal lines between them
- First widget (SEARCH) has no top border
- Spacing between widgets is consistent (32px gap split by border)

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(public)/_shared/components/layouts/blog-sidebar.tsx'
git commit -m "feat(blog): add visual dividers between sidebar widgets

Replace space-y-8 with individual border-t separators between
widgets for clearer visual hierarchy in the editorial design."
```

---

### Task 3: Full validation + visual regression check

- [ ] **Step 1: Run full validation**

Run: `bun run validate`
Expected: exit 0 — type-check and lint both pass

- [ ] **Step 2: Run build**

Run: `bun run build`
Expected: exit 0 — no build errors. The Badge import removal should not break anything (it was only used in this file).

- [ ] **Step 3: Check blog list page is unaffected**

Navigate to `http://localhost:3000/posts` and confirm:

- Blog list page renders correctly with all posts
- Sidebar on list page has the new dividers (BlogLayout shared)
- Card images and layout are unchanged

- [ ] **Step 4: Check a post without thumbnail**

If available, navigate to a post that has no `thumbnailUrl`. Confirm:

- No image placeholder or broken image
- Metadata and content render correctly without the image section

- [ ] **Step 5: Check news detail page sidebar**

Navigate to a news detail page (e.g., `http://localhost:3000/news/year-end-greeting`). Confirm:

- Sidebar dividers also appear on news pages (shared BlogSidebar)
- News content is unaffected (no changes to news detail component)
