# Completed Plan Archive (Serial Format + before 2026-02-07)

> This file is the history of completed plans split from [`docs/plans/README.md`](../README.md).
> It includes serial format (`001-*` to `080-*`) and date format entries before 2026-02-07.
> See the parent README.md for active plans and recent completions.

> **Compressed**: details delegated to git history on 2026-04-23.
> For each plan's implementation details, changed files, and step-by-step history, check git log:
>
> ```bash
> git log --all --diff-filter=A -- docs/plans/<plan-name>.md
> git log --all --diff-filter=D -- docs/plans/<plan-name>.md
> git log -p docs/plans/archive/completed-legacy.md | less
> ```

---

### 080 - Project optimization score improvements (2026-02-07) ✅

Implemented PWA (manifest + icons), Web Vitals → GA4 reporting (GDPR compliance), and WCAG AA contrast validation.

### 079 - Citation/MEO comprehensive enhancement (2026-02-06) ✅

Implemented unified LocalBusiness + WebSite structured data via @graph JSON-LD, enforced NAP consistency, added Google Maps/review links, facility attribute icons, and expanded MEO score to 13 items.

### 078 - Implement all v3 section types + restore [slug] route (2026-02-04) ✅

Created public components for the remaining 12 section types, unified SectionRenderer to support all 17 types, and restored the [slug] dynamic page route.

### 077 - Homepage DB integration (2026-02-04) ✅

Migrated the v3 homepage from static dummy data to DB-driven, and branched SectionType → v3 components in HomepageSectionRenderer.

### 076 - Unify custom page URLs (2026-01-29) ✅

Abolished the `/p/[slug]` prefix and standardized to `/[slug]`, managing dedicated pages via RESERVED_SLUGS.

### 075 - Full separation of public/admin CSS (2026-01-28) ✅

Fully separated `(admin)/` and `(public)/` CSS/layouts using the Next.js 16 Multiple Root Layouts pattern, and split Tailwind 4 `@theme` into admin.css / public.css.

### 074 - Admin UI/UX improvements (2026-01-28) ✅

Refreshed to a minimal unified design with the Trust Blue palette, added WCAG-compliant touch targets (44px), mobile optimization, and transitions across all shared components.

### 073 - Unify category/tag UI (2026-01-26) ✅

Created a shared hook (use-taxonomy-filters), SortableTableHead, and TaxonomyEditor for post category/tag management, added nuqs support, and unified UI/UX with other admin screens.

### 072 - Category/tag SEO settings (2026-01-26) ✅

Added SEO fields to PostCategory / PostTag in Prisma, built dedicated edit pages for categories/tags, and updated public page metadata.

### 070 - Instagram integration + admin UI unification (2026-01-25) ✅

Implemented settings UI for both Instagram OAuth and manual tokens, oEmbed Lexical node, public page sections, and token auto-refresh cron, plus unified existing radio buttons to SelectionBox.

### 069 - Lexical text transform feature (2026-01-25) ✅

Added a text case transform plugin (lowercase / uppercase / capitalize) to the Lexical editor via slash commands and toolbar dropdown.

### 068 - Lexical X (Twitter) embed feature (2026-01-25) ✅

Added a static iframe embed node for X (Twitter) posts in Lexical (XNode / XPlugin), supporting all URL formats and XSS prevention.

### 067 - Lexical comment feature InlineEditor integration (2026-01-25) ✅

Integrated the Lexical comment feature into the InlineEditor for Blog / News / Page, and centralized side-panel open/close with the exclusive panel management hook (useEditorPanels).

### 066 - Slug support for Space/News (2026-01-23) ✅

Changed public URLs for Space / News from UUIDs to human-readable slugs (e.g., `/spaces/meeting-room-a`) and updated Prisma schema, Server Actions, and link generation.

### 065 - Cache-Control + Cloudflare cache purge (2026-01-23) ✅

Configured `s-maxage=3600` Cache-Control via Next.js PPR + Cloudflare CDN integration, and added purge calls to all public-content Server Actions (target 95% bandwidth reduction).

### 064 - Discount/coupon system Phase 1 (2026-01-22) ✅

Added a Coupon model in Prisma, implemented pricing logic (pricing.ts) for long-stay discounts, generic coupon codes, and manual discounts, plus admin UI and public page integration.

### 063 - Project quality improvements (2026-01-22) ✅

Implemented enforced validation for production-required env vars, fixed shared library dependencies, and built mock foundations for Resend / Google Calendar / Stripe.

### 060 - CI/CD quality improvements (2026-01-21) ✅

Added Dependabot config, eight CSP security headers, test coverage enablement (Codecov integration), and TypeDoc API doc configuration.

### 059 - Unified Editor SidePanel (2026-01-21) ✅

Unified admin content editing UI under a plugin-style ContentTypeConfig architecture, creating UnifiedSidePanel and reusable field components.

### 058 - Performance Optimization (2026-01-20) ✅

Added `'use cache'` + `cacheLife` to public Server Actions and moved email sending to non-blocking `fireAndForget` to optimize responses.

### 057 - Project Improvement Plan (2026-01-20) ✅

Implemented ENCRYPTION_KEY as production-required, API rate limiting, GCal webhook token validation (Phase 1), unified `fireAndForget` pattern (Phase 2), and major file splits for settings.ts / NavigationManager / AnnouncementBarManager (Phase 3).

### Code Quality Improvement - Type Safety Phase 4 (2026-01-20) ✅

Replaced ToolbarPlugin `as BlockType` with a `BLOCK_TYPES` const array + `isBlockType()` type guard, and reduced type assertions from 84 → 57 (-32%) by applying `z.nativeEnum(Role)`.

### Code Quality Improvement - Type Safety Phase 3 (2026-01-20) ✅

Created `keysOf` / `filterTruthy` / `parseEnumAttribute` utilities and replaced `Object.keys() as Type[]` / `.filter(Boolean) as T[]` / DOM attribute casts with type-safe patterns (84 → 61).

### Code Quality Improvement - Utility Extraction Phase 2 (2026-01-20) ✅

Unified `.toISOString().split('T')[0]` to `toDateString()` and `.split(',')[0]` to `extractFirstFromCommaList()` across 10 files.

### Code Quality Improvement - Utility Extraction Phase 1 (2026-01-20) ✅

Added new utilities `normalizeError()` / `toDateString()` / `safeArrayAccess()` and unified duplicate error handling and date conversion patterns across the codebase.

### 055-admin-ui-ux-unification.md (2026-01-19) ✅

Unified EmptyState (10 tables), LoadingState (16 pages), date/amount formatting, error display, and StatusBanner, then migrated relative imports to path aliases.

### Test Infrastructure & Coverage Improvement (2026-01-19) ✅

Fixed Zod 4 + @hookform/resolvers compatibility, improved mock infrastructure, and set E2E exclusions. Added four Public Actions integration test files (+54 tests) for a total of 924 passing tests.

### 054-filter-form-unification.md (2026-01-19) ✅

Expanded BaseFilters to all filters and created a `useFormAction` hook, unifying patterns across 5 filters + 3 forms (code reduction ~550 lines, debounce bug fix).

### 053-admin-code-cleanup.md (2026-01-19) ✅

Unified PublishSwitch, fixed NewsFilters debounce bug, created BaseFilters base component and SidePanelShell, and cleaned up duplicate admin code.

### 052-hardcode-config-centralization.md (2026-01-19) ✅

Built env var validation with `@t3-oss/env-nextjs` and consolidated SITE_DEFAULTS / SESSION_CONFIG / PAGINATION_DEFAULTS / URL helpers into constant files (migrated 18 URL fallbacks to a unified helper).

### 051-header-logo-branding.md (2026-01-19) ✅

Added logo display settings fields in Prisma (useHeaderLogo / useFooterLogo / footerLogoUrl) and integrated DB-driven branding into public headers/footers and the admin TopBar.

### 050-colocation-refactor.md (2026-01-19) ✅

Moved `src/admin/` and `src/public/` into `(admin)/_shared/` / `(public)/_shared/` under the App Router, aligning to the official Next.js colocation pattern.

### 049-type-safety-improvements.md (2026-01-19) ✅

Created BusinessHours types, FormData type-safe helpers, and 15 Set-based O(1) type guards, replacing JSON field / FormData / `as Enum` assertions with safe patterns.

### 048-staff-invitation-flow.md (2026-01-19) ✅

Abolished direct admin password setup and switched to a secure invite flow where staff set their own password via invite email → /admin/setup/[token].

### 046-customer-creation.md (2026-01-18) ✅

Added new customer creation (/admin/customers/new + CustomerForm) to admin customer management, enabling pre-registration for phone reservations.

### 045-admin-reservation-creation.md (2026-01-18) ✅

Implemented a new reservation page for manual admin entry (customer search, TimeSlotSelector, pricing calculation, GCal/iCal sync).

### 044-space-management-tab-integration.md (2026-01-18) ✅

Consolidated three separate pages (space/location/category management) into one page with three tabs, reducing sidebar items from 16 → 14.

### 043-space-location-category.md (2026-01-18) ✅

Added Location / SpaceCategory models in Prisma and implemented two classification axes (location + usage category) for spaces, plus admin CRUD UI and public page display.

### 042-complete-separation-architecture.md (2026-01-18) ✅

Fully separated the three-directory structure (`src/admin/` / `src/public/` / `src/shared/`), achieving zero admin → public cross-references and eliminating duplicate utility functions.

### 041-admin-cleanup-refactoring.md (2026-01-17) ✅

Expanded the sidebar, removed deprecated components, unified naming conventions, converted six tables to Server Components (removed TanStack Table), and merged isolated settings sections into tabs.

### 040-system-features-tab-integration.md (2026-01-17) ✅

Consolidated navigation and announcement bar management into five tabs under site settings, redirected old pages, and simplified the system management page.

### 039-settings-category-tabs.md (2026-01-17) ✅

Added URL-synced tab UI using nuqs + Radix UI Tabs to each settings category page (site 3 / business 3 / notify 3 / api 4 / system 3 tabs).

### 038-settings-page-restructure.md (2026-01-17) ✅

Rebuilt the 10-tab settings page into an iOS-style category card layout (5 categories: site / business / notify / api / system).

### 037-blog-sidebar.md (2026-01-17) ✅

Added a five-widget sidebar to the blog page (search, new, popular, categories, tags) and implemented visibility controls via site settings and per-page settings.

### 036-test-coverage-full.md (2026-01-17) ✅

Introduced Bun Test + Playwright E2E, added ~50 Unit/Integration files and 195 E2E tests (auth/reservation/spaces/blog/users), and set up GitHub Actions CI.

### 035-performance-optimization.md (2026-01-16) ✅

Improved performance by tuning DB connection pool, optimizing `$queryRaw` for dashboard aggregation, and adding priority to the first two public page images.

### 034-react-compiler-memoization-cleanup.md (2026-01-16) ✅

Removed `useCallback` (50 → 12 files) and `useMemo` (4 → 2 files) for React Compiler compatibility, keeping only legitimate cases like Lexical/useEffect dependencies.

### 033-media-picker-integration.md (2026-01-16) ✅

Moved image settings UI from direct URL input to a media library dialog (library select + URL input + upload 3 tabs) and unified into five forms.

### 031-terms-agreement-management.md (2026-01-16) ✅

Added Terms / TermsVersion / TermsAgreement models in Prisma, implementing per-space terms versioning, scroll-detection consent dialog, and RBAC permissions.

### 032-enum-type-guards.md (2026-01-16) ✅

Created a centralized guard module (enums.ts), removed all Prisma enum assertions like `as ReservationStatus`, and added runtime validation for JSON fields.

### 031-media-type-assertion-removal.md (2026-01-16) ✅

Directly re-exported Prisma-generated enums via Zod schemas and added `isValidMediaType` / `isValidMediaUsage` type guards, eliminating all four uses of `as MediaType` / `as MediaUsage`.

### 030-media-management.md (2026-01-16) ✅

Added Media model and MediaType / MediaUsage enums in Prisma, and implemented Supabase Storage integration, grid/list view management UI, and Lexical MediaLibraryPlugin.

### 029-type-errors-fix.md (2026-01-16) ✅

Applied the `isSystemPage` Prisma migration, fixed a sync function error in `canDeletePage`, and added `'use cache'` to queries inside `generateMetadata` to resolve build errors.

### 028-prisma-decimal-serialization-fix.md (2026-01-16) ✅

Fixed the issue where Prisma Decimal types could not be passed to Client Components in SpaceListSection by using `SerializedSpace` + `.toNumber()` conversion.

### 027-nuqs-best-practices.md (2026-01-16) ✅

Added `history: 'push'` to Pagination and `throttleMs: 500` to search input, consolidating admin parsers and standardizing on the `createLoader` pattern.

### 026-remove-as-const-assertions.md (2026-01-16) ✅

Removed `as const`, added a `getSessionUser` type guard, `getRoleFromSession` helper, URLSearchParams validation, and seven JSON config type guards, significantly reducing type assertions across 50+ files (Phases 1–3).

### 025-homepage-settings-to-pages.md (2026-01-15) ✅

Moved homepage section management from "Settings > Homepage tab" to page management, reducing settings tabs from 10 → 9.

### 024-bun-test-framework.md (2026-01-14) ✅

Built a Prisma / Better Auth / Next.js mock foundation using the native Bun test runner, establishing an initial test environment with 121 tests (379 expects) running in 150ms.

### 023-grapesjs-removal-homepage-settings.md (2026-01-14) ✅

Fully removed the GrapesJS visual editor and unified on Lexical, adding homepage settings for four section types (CTA / Blog / News / FAQ) in the admin UI.

### 022-type-safety-hof-migration.md (2026-01-13) ✅

Removed 30+ `as never` assertions with the AuditUser type, unified manual auth patterns across 13 files into the `withPermission` HOF, and handled React 19 `forwardRef` removal.

### 021-seo-accessibility-optimization.md (2026-01-13) ✅

Implemented Settings DB-driven metadata factory, WebSite / Article JSON-LD, SkipLink / ARIA live regions, and WCAG AA contrast ratio improvements (4.5:1+).

### 021-permission-management-system.md (2026-01-13) ✅

Implemented 5-tier RBAC (SUPER_ADMIN / ADMIN / EDITOR / VIEWER / USER), a codebase permissions library, audit logs, login attempt rate limits (5 per 15 minutes), and a permissions matrix UI.

### 020-blog-news-grapesjs-migration.md (2026-01-13) ✅

Added BlogPostStatus / NewsStatus enums and Version model in Prisma, integrated Blog / News editors into GrapesJS, and implemented publish/unpublish separation with automatic version creation.

### 019-admin-ui-ux-integration.md (2026-01-13) ✅

Managed sidebar state (expanded / collapsed / hidden) via AdminLayoutContext and added responsive sidebar, TopBar, and Recharts reservation/revenue graphs to the dashboard.

### 018-grapesjs-database-integration.md (2026-01-13) ✅

Added GrapesPage / GrapesPageVersion models in Prisma and implemented CRUD, version history, backups, SEO, and public pages (`/g/[slug]`).

### 017-grapesjs-custom-blocks.md (2026-01-13) ✅

Added five rental-space-specific custom blocks to GrapesJS (HeroSection / ReservationForm / FeatureGrid / TestimonialSlider / ContactSection) and implemented a renderer supporting CSS variable themes.

### 016-grapesjs-visual-editor.md (2026-01-13) ✅

Introduced @grapesjs/react v2.0.0 and built a visual editor environment with TypeScript typings, SSR avoidance, custom block registration, and dynamic imports (code splitting).

### 015-code-quality-refactoring.md (2026-01-12) ✅

Unified Server Action helpers, created React 19 form hooks, migrated Admin UI components from CVA → TV, and removed the `class-variance-authority` package.

### 014-reservation-calendar.md (2026-01-11) ✅

Implemented a month/week/day view switch calendar for admin reservation management (URL state, space filters, status change dialog) with Clean Architecture.

### 013-google-calendar-integration.md (2026-01-11) ✅

Implemented Google Calendar service account integration, iCal generation (RFC 5545), iCal feed delivery, and Cron polling + Webhook bidirectional sync (Phases 1–4 complete).

### 012-nextjs-best-practices.md (2026-01-11) ✅

Moved admin routes to Route Group `(admin)/admin/`, implemented a DAL pattern memoizing verifySession via `cache()`, and improved the withAuth HOF.

### 011-server-client-separation.md (2026-01-11) ✅

Refactored large pages blog/categories (506 lines) and settings/navigation (1068 lines) to match the official Next.js Server/Client Component separation pattern.

### 010-withauth-badge-improvements.md (2026-01-11) ✅

Migrated all Server Actions mutation functions (69 functions) to the withAuth HOF and aligned Badge variant colors for Inquiry / Customer / Publish statuses.

### 009-delayed-improvements.md (2026-01-11) ✅

Consolidated five duplicate StatusBadge components into `status-badges.tsx`, added the withAuth HOF, renamed five files to PascalCase, and removed duplicate Turnstile functions.

### 008-api-keys-management.md (2026-01-11) ✅

Stored Resend / Turnstile / Google Maps API keys with AES-256-GCM encryption and masked display, adding connection tests and an admin "API Keys" tab.

### 007-announcement-bar-design-styles.md (2026-01-11) ✅

Added five design style presets (solid / gradient / outlined / glass / minimal) plus real-time preview to the announcement bar.

### 006-announcement-bar-and-news-editor.md (2026-01-11) ✅

Integrated the TipTap rich text editor (images/YouTube) into announcement management and implemented a new AnnouncementBar (3 types, custom colors, display period).

### 005-actionresult-complete-migration.md (2026-01-10) ✅

Unified all admin Server Actions (11 files) under ActionResult<T> and replaced unsafe casts in BusinessHoursSection with `??`.

### 004-type-safety-improvement.md (2026-01-10) ✅

Created Zod validation for JSON fields, Prisma WhereInput type aliases, and a shared ActionResult<T> type to establish type-safety foundations.

### 003-reservation-terms-agreement.md (2026-01-10) ✅

Added a terms agreement checkbox to the reservation form, recorded consent time (termsAgreedAt) in the DB, and made enable/disable + copy editable from the admin UI.

### 002-stripe-payment-settings.md (2026-01-10) ✅

Integrated ImageUploadDialog into EditorToolbar and added AES-256-GCM encrypted Stripe API keys, connection tests, and a payments tab to the admin UI.

### 001-architecture-improvements.md (2026-01-10) ✅

Updated tsconfig from ES2017 → ES2022, fixed font variables, strengthened PostgreSQL pool connection settings, and clarified layout.tsx comments to improve architecture foundations.

### settings-tab-refactoring.md (2026-01-09) ✅

Reduced settings page.tsx from 773 → 110 lines and rebuilt it into a 6-tab layout with nuqs URL state (general / business / SEO / mail / reservations / system).

### tiptap-integration.md (2026-01-09) ✅

Introduced the TipTap editor, created RichTextEditor / EditorToolbar / EditorContent, and integrated them into BlogForm.

---

## Unstarted plans

None
