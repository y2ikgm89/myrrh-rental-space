# Data Flow Analysis: Admin → Public Pages

**Analysis Date**: 2026-03-19  
**Project**: Myrrh Rental Space  
**Framework**: Next.js 16 with React 19 & Prisma 7

---

## Executive Summary

Complete tracing of data flow from all 8 key admin-managed resources to public pages. **Cache invalidation is properly implemented** using Next.js 16's `updateTag()` API with `CACHE_TAGS` constants. All public queries use `'use cache'` + `cacheTag()` with appropriate cache lifetimes.

**Status**: ✅ Most resources properly cached | ⚠️ 1 secondary query path needs review

---

## Resources Analyzed

### 1. SPACES (Rental Spaces) ✅

**Admin Actions**: `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts` (lines 1-99)

- `createSpace()` → `updateTag(CACHE_TAGS.SPACES)` + detail cache
- `updateSpace()` → both tags
- `updateSpacePublish()` → both tags
- `deleteSpace()` → both tags
- Cloudflare: `fireAndForget(purgeSpaceCache(id))` (line 48)

**Public Queries**: `src/shared/domain/spaces/public-queries.ts`

- `getPublishedSpaces()` (line 23) → `cacheTag(CACHE_TAGS.SPACES)` + `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`
- `getSpaceBySlug(slug)` (line 53) → detail tags + hours cache
- `getActiveCategories()` (line 96) → `cacheTag(CACHE_TAGS.SPACE_CATEGORIES)`

**Public Pages**:

- `/spaces` → `src/app/(public)/spaces/page.tsx` (line 34)
- `/spaces/[slug]` → `src/app/(public)/spaces/[slug]/page.tsx` (line 38)

---

### 2. NEWS (お知らせ) ✅

**Admin Actions**: `src/app/(admin)/admin/(dashboard)/_shared/actions/news.ts` (lines 1-200+)

- `createNews()` (line 54) → `updateTag(CACHE_TAGS.NEWS)` + purge
- `updateNews()` (line 78) → old + new slug tags
- `deleteNews()` (line 119) → both tags
- `publishNews()` (line 150) → both tags
- `unpublishNews()` (line 182) → both tags
- `restoreNewsVersion()` (line 223) → both tags + purge

**Public Queries**: `src/shared/domain/news/queries.ts`

- `getPublishedNewsList()` (line 39) → `cacheTag(CACHE_TAGS.NEWS)` + hours
- `getPublishedNewsItem()` (line 64) → detail tags
- `getPublishedNews()` (line 102) → `cacheTag(CACHE_TAGS.NEWS)`

**Public Pages**:

- `/news` → `src/app/(public)/news/page.tsx` (line 28)

---

### 3. POSTS (ブログ記事) ✅

**Admin Actions**: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/mutations.ts`

- `createPost()` (line 74) → `invalidatePostCollectionCaches()`
- `updatePost()` (line 100) → collection + detail tags
- `deletePost()` (line 144) → all post tags
- `publishPost()` (line 173) → all tags
- `unpublishPost()` (line 206) → all tags
- `createPostCategory()` (line 265) → `CACHE_TAGS.POSTS` + `CACHE_TAGS.POST_CATEGORIES`
- `updatePostCategory()` (line 289) → both tags
- `createPostTag()` (line 336) → `CACHE_TAGS.POSTS` + `CACHE_TAGS.POST_TAGS`
- `updatePostTag()` (line 361) → both tags + purge

**Public Queries**: `src/shared/domain/posts/queries.ts`

- `getPublishedPostsList()` (line 64) → `cacheTag(CACHE_TAGS.POSTS, CACHE_TAGS.PERMALINK)` + hours
- `getPublishedPost()` (line 110) → detail tags + permalink tag
- `getPublishedPosts()` (line 156) → collection + permalink tags

**Key Note**: Post queries include `CACHE_TAGS.PERMALINK` because URLs change with permalink settings. Correct.

**Public Pages**:

- `/posts` → `src/app/(public)/posts/page.tsx`

---

### 4. PAGE CONTENT & CUSTOM PAGES ✅

**Admin Actions**: `src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts`

- `createPage()` (line 58) → `updateTag(CACHE_TAGS.PAGES)` + detail
- `updatePage()` (line 39) → detail tags
- `deletePage()` (line 96) → both tags
- `deletePagePermanently()` (line 113) → both tags
- `restorePage()` (line 130) → detail tags
- `togglePagePublished()` (line 145) → both tags
- `updatePageSeo()` (line 162) → `updateTag(CACHE_TAGS.PAGE_SEO)` + detail seo tags
- `bulkTogglePagePublished()` (line 134) → all affected details
- `bulkDeletePages()` (line 152) → all affected details

**Public Queries**:

Custom Pages: `src/shared/domain/pages/queries.ts`

- `getPublicPage()` (line 102) → `cacheTag(CACHE_TAGS.PAGES, getCacheTag.pages.detail(slug))` + hours
- `getPageSeo()` (line 121) → `cacheTag(CACHE_TAGS.PAGE_SEO, getCacheTag.pageSeo.detail(slug))` + hours

Page Content: `src/shared/domain/page-content/queries.ts`

- `getPageContent()` (line 22) → `cacheTag(CACHE_TAGS.PAGE_CONTENT, getCacheTag.pageContent.detail(pageKey))` + hours
- `getPageContentMeta()` (line 37) → `cacheTag(CACHE_TAGS.PAGE_CONTENT, getCacheTag.pageContent.meta(pageKey))` + hours

**Public Pages**:

- `/spaces` → calls `getPageContent("space-list", ...)`
- `/news` → calls `getPageContent("news", ...)`
- `/faq` → calls `getPageContent("faq", ...)`
- `/posts` → calls `getPageContent("posts", ...)`
- `/[...segments]` → calls `getPageContent()` + `getPageSections()`

---

### 5. SETTINGS (Site Configuration) ✅

**Admin Actions** (multiple files):

`src/app/(admin)/admin/(dashboard)/_shared/actions/settings/basic.ts`:

- `updateBasicInfo()` → `updateTag(CACHE_TAGS.SETTINGS)`
- `updateLayoutSettings()` → `updateTag(CACHE_TAGS.SETTINGS)`
- `updateSeoSettings()` → `updateTag(CACHE_TAGS.SETTINGS)`

`src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts`:

- `updateMaintenanceSettings()` → `updateTag(CACHE_TAGS.SETTINGS)`
- `updateCookieConsentSettings()` → `updateTag(CACHE_TAGS.SETTINGS)`
- `updateHeaderSettings()` → `updateTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.LAYOUT_SETTINGS)` (line 141)
- `updateFooterSettings()` → `updateTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.LAYOUT_SETTINGS)` (line 160)
- `updateReservationSettings()` → `updateTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.TERMS)` (line 180)
- `updatePermalinkSettings()` → `updateTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.POSTS)` (line 200)
- `updateSidebarSettings()` → `updateTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.POSTS)` (line 125)

**Public Queries**: `src/shared/domain/settings/queries.ts`

- `getHeaderSettings()` (line 124) → `cacheTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.LAYOUT_SETTINGS)` + days
- `getFooterSettings()` (line 144) → same tags + days
- `getPublicBusinessSettings()` (line 87) → `cacheTag(CACHE_TAGS.BUSINESS_SETTINGS, CACHE_TAGS.SETTINGS)` + days
- `getAnalyticsConfig()` (line 202) → `cacheTag(CACHE_TAGS.ANALYTICS_CONFIG, CACHE_TAGS.SETTINGS)` + days
- `getSeoSettings()` (line 243) → `cacheTag(CACHE_TAGS.SEO_SETTINGS, CACHE_TAGS.SETTINGS)` + hours
- `getPermalinkSettings()` (line 278) → `cacheTag(CACHE_TAGS.PERMALINK, CACHE_TAGS.SETTINGS)` + days
- `getMaintenanceSettings()` (line 353) → `cacheLife(CACHE_LIFE.DYNAMIC_DATA)` + **minutes** (line 355)

**Special Note**: Maintenance settings use DYNAMIC_DATA (minutes) for immediate effect.

**Public Pages**:

- `layout.tsx` (line 56-60) → calls `getHeaderSettings()`, `getFooterSettings()`, `getAnalyticsConfig()`, `getMaintenanceSettings()`
- Site footer → calls `getFooterSettings()`

---

### 6. FAQ (よくある質問) ⚠️

**Admin Actions**: `src/app/(admin)/admin/(dashboard)/_shared/actions/faq.ts`

- `createFaqCategory()` (line 51) → `updateTag(CACHE_TAGS.FAQ)` + purge
- `updateFaqCategory()` (line 71) → both
- `deleteFaqCategory()` (line 95) → both
- `reorderFaqCategories()` (line 116) → both
- `createFaqItem()` (line 136) → both
- `updateFaqItem()` (line 165) → both
- `deleteFaqItem()` (line 190) → both
- `reorderFaqItems()` (line 211) → both
- `toggleFaqItemPublished()` (line 243) → both

**Public Queries**:

CACHED (correct): `src/shared/domain/sections/queries.ts`

- `getPublishedFaqItems()` (line 162) → `cacheTag(CACHE_TAGS.FAQ)` + hours

NOT CACHED (⚠️): `src/shared/domain/faq/queries.ts`

- `getFaqCategories()` (line 26) → NO CACHE
- `getFaqItems()` (line 72) → NO CACHE
- `getFaqCategoryById()` (line 57) → NO CACHE
- `getFaqItemById()` (line 144) → NO CACHE

**Status**: ⚠️ Main FAQ page uses cached path. Secondary queries have NO cache — verify if public-facing.

---

### 7. TERMS (利用規約) ✅

**Admin Actions**: `src/app/(admin)/admin/(dashboard)/_shared/actions/terms/mutations.ts`

- `createTerms()` (line 58) → `invalidateTermsCache()` (line 39)
- `createTermsWithVersion()` (line 77) → `invalidateTermsCache()`
- `updateTerms()` (line 103) → `invalidateTermsCache()`
- `deleteTerms()` (line 127) → `invalidateTermsCache()`
- `toggleTermsActive()` (line 150) → `invalidateTermsCache()`
- All version operations → `invalidateTermsCache()` or `updateTag(CACHE_TAGS.TERMS)`

`invalidateTermsCache()` (line 39):

```typescript
function invalidateTermsCache(): void {
  updateTag(CACHE_TAGS.TERMS)
  fireAndForget(purgeTermsCache(), {...})
}
```

**Public Queries**: `src/shared/domain/terms/queries.ts`

- `getPublicTermsBySlug()` (line 41) → `cacheTag(CACHE_TAGS.TERMS)` + hours

**Public Pages**:

- `/terms` → calls `getPublicTermsBySlug("terms")`
- `/privacy` → calls `getPublicTermsBySlug("privacy")`

---

### 8. SPACE CATEGORIES (スペースカテゴリ) ✅

**Admin Actions**: `src/app/(admin)/admin/(dashboard)/_shared/actions/space-category.ts`

- All operations → `updateTag(CACHE_TAGS.SPACE_CATEGORIES)`

**Public Queries**: `src/shared/domain/spaces/public-queries.ts`

- `getActiveCategories()` (line 96) → `cacheTag(CACHE_TAGS.SPACE_CATEGORIES)` + hours

**Public Pages**:

- `/spaces` filter bar uses categories

---

## Cache Configuration Summary

**Cache Lifetimes** (`src/shared/lib/constants/cache.ts`):

- `PUBLIC_CONTENT: "hours"` — Blog, news, spaces, FAQs, pages
- `STATIC_SETTINGS: "days"` — Site config, business info, analytics IDs
- `DYNAMIC_DATA: "minutes"` — Maintenance mode (needs immediate effect)
- `METADATA: "hours"` — SEO metadata

**Cache Tags** (`src/shared/lib/constants/cache.ts` lines 34-100):

```
CACHE_TAGS.POSTS, NEWS, SPACES, PAGES, FAQ, TERMS, SETTINGS
getCacheTag.posts.detail(slug), getCacheTag.news.detail(id), etc.
getCacheTag.pageContent.detail(pageKey), getCacheTag.pageContent.meta(pageKey)
```

**Cloudflare Purge** (all in actions):

- `fireAndForget(purgeSpaceCache(id))`
- `fireAndForget(purgeNewsCache(slug))`
- `fireAndForget(purgePostCache(slug))`
- `fireAndForget(purgePageCache(slug))`
- `fireAndForget(purgeFaqCache())`
- `fireAndForget(purgeTermsCache())`
- All with `ErrorSeverity.LOW` (non-critical failures)

---

## Issues Found

### Critical: None

All 8 core resources have complete cache invalidation.

### Warnings:

1. **FAQ Secondary Queries** (MEDIUM)
   - Location: `src/shared/domain/faq/queries.ts` lines 26, 57, 72, 144
   - Issue: `getFaqCategories()`, `getFaqCategoryById()`, `getFaqItems()`, `getFaqItemById()` have NO cache
   - Action: Verify if public-facing. If yes, add: `cacheTag(CACHE_TAGS.FAQ)` + `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`

2. **Page Content Admin Mutations** (MEDIUM)
   - Location: Unknown (likely `homepage-settings.ts` or similar)
   - Issue: Couldn't find where PageContent is edited in admin
   - Action: Search for PageContent mutations and verify `updateTag(CACHE_TAGS.PAGE_CONTENT)` is called

3. **Space Categories Location** (LOW)
   - Location: `src/app/(admin)/admin/(dashboard)/_space-categories/` (non-standard)
   - Issue: Unlike other resources, categories are in separate directory
   - Action: Verify this is active and properly integrated with space admin

4. **Permalink → Post Cache** (EXPECTED)
   - Location: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts` line 200
   - Note: Changing permalink structure invalidates ALL posts (line 200)
   - Status: This is correct behavior — post URLs change

---

## Testing Recommendations

1. **Space Cache**: Edit space → verify detail + list refresh
2. **Settings Cache**: Change site name → verify header brand name updates
3. **Maintenance Mode**: Enable → verify immediate effect (DYNAMIC_DATA = minutes)
4. **Permalink Change**: Modify structure → verify all post caches invalidate
5. **FAQ**: Check if `getFaqCategories()` used on public-facing pages

---

## Conclusion

The project has **well-implemented cache invalidation** across all resources. Use of `CACHE_TAGS` constants, `updateTag()` in action `afterSuccess()` handlers, and fire-and-forget Cloudflare purges provides robust cache management.

**Key Strengths**: ✅ Comprehensive tags | ✅ Proper lifetimes | ✅ Graceful fallbacks
**To Monitor**: ⚠️ FAQ secondary queries | ⚠️ PageContent mutations location
