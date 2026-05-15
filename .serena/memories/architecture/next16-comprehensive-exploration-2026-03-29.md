# Next.js 16 Comprehensive Architecture Exploration (2026-03-29)

## PROJECT SNAPSHOT
- **Stack**: Next.js 16.2.1, React 19.2.4, TypeScript 6.0.2, Prisma 7.6.0, Better Auth 1.5.6
- **Build**: Bun 1.3.11 + Turbopack, CSS: Tailwind 4.2.2
- **DB**: PostgreSQL 16, Prisma output: `generated/prisma/` (custom)
- **Deployment**: Google Cloud Run (Docker, standalone mode)

## ROUTE STRUCTURE (Multiple Root Layouts)

### (admin) Layout — /admin/* routes
**Path**: `src/app/(admin)/`
- Root Layout: `layout.tsx` (own <html/body>, admin.css, system fonts)
- Auth: `(auth)/login` email/password, `(auth)/setup/[token]` initial setup
- Dashboard: `(dashboard)/` with 19 CRUD resources
  - Content: posts (Lexical + DnD), news, pages (homepage + custom), faq, terms
  - Booking: reservations (list/detail/calendar/new/edit), coupons, customers
  - Settings: site, business, notification, api, system, navigation, announcement-bar
  - Misc: locations, spaces, space-categories, staff, inquiries, reviews, media, audit-logs
- Shared lib: `@/admin/*` → `src/app/(admin)/admin/(dashboard)/_shared/`
  - **actions/**: Server Actions with `executeAdminMutationResult` pattern (auth+audit+cache)
  - **components/ui/**: Shadcn UI (admin-specific)
  - **components/forms/**: Reusable form fields
  - **components/editor/**: Lexical editor + toolbar + preview
  - **lib/admin-action.ts**: executeAdminMutationResult implementation
  - **lib/permissions.ts**: ROLE_PERMISSIONS matrix
  - **queries/**: SELECT patterns per resource

### (public) Layout — / and public pages
**Path**: `src/app/(public)/`
- Root Layout: `layout.tsx` (own <html/body>, public.css, LenisProvider for smooth scroll)
- Fixed pages: `/`, `/about`, `/faq`, `/contact`, `/privacy`, `/news`, `/posts`
- Dynamic: `/[...segments]` (custom pages via Page-First), `/spaces/[slug]` (detail)
- Booking: `/reservation` (3-step wizard)
- Customer auth: `/login` (Google/LINE OAuth), `/forgot-password`, `/reset-password`
- Mypage: `/mypage/*` (verifyCustomerSession required)
  - reservations/[id]: detail + cancel + edit + review
  - inquiries/[id]: detail view
  - settings: profile edit
- Shared lib: `@/public/*` → `src/app/(public)/_shared/`
  - **actions/**: Public form handlers (Turnstile + rate limit, no auth)
  - **components/design-system/**: 10 primitives (no barrel export)
    - heading, container, button, input, textarea, select, badge, card, stack, icon-button
  - **components/layouts/**: kebab-case (site-header, site-footer, page-hero, site-cta, mobile-nav, breadcrumb)
  - **components/ui/**: Standalone (image-gallery, filter-bar, share-buttons, step-indicator, turnstile-widget)
  - **components/animations/**: GSAP/ScrollTrigger (scroll-reveal, fade-in, split-text, parallax-*)
  - **hooks/usePublicForm**: Form state + Turnstile + error display
  - **data/**: business, turnstile validations
  - **lib/content/**: PageContent types + defaults + cached queries

**Path Alias**: `@/public/*` → `src/app/(public)/_shared/*`

## KEY CONFIGURATION PATTERNS

### next.config.ts
- **reactCompiler**: true (automatic memoization)
- **cacheComponents**: true (PPR enabled, dynamic content opted in)
- **turbopack.resolveAlias**: next/headers.js (better-auth ESM workaround)
- **transpilePackages**: ["better-auth"]
- **headers()**: Cache-Control varies by route
  - /admin, /reservation, /api: private, no-cache, no-store, must-revalidate
  - /: public, s-maxage=3600, stale-while-revalidate=3600 (CDN cached)

### tsconfig.json (TypeScript 6.0)
- **target**: es2025 (latest JavaScript features)
- **strict**: true (explicit, Next.js default)
- **erasableSyntaxOnly**: true (TS 7.0 prep: enum/namespace/parameter properties forbidden)
- **verbatimModuleSyntax**: true (import type required, ESM strict)
- **noUncheckedIndexedAccess**: true (array[i] returns T | undefined)
- **exactOptionalPropertyTypes**: true (optional ≠ optional | undefined)
- **noPropertyAccessFromIndexSignature**: true (obj['key'] required, not obj.key)
- **Path aliases**: @/*, @/admin/*, @/public/*, @/shared/*, @generated/*

### Prisma Schema (1,697 lines)
- **Output**: `generated/prisma/` (custom, not node_modules/.prisma)
- **Adapter**: @prisma/adapter-pg (PostgreSQL native)
- **Generator**: runtime="bun", engineType="client"
- **Models**: 40+ (User, Space, Reservation, Customer, Post, News, Page, Section, Coupon, etc.)
- **Enums**: 
  - Role (SUPER_ADMIN, ADMIN, EDITOR, VIEWER, USER, CUSTOMER)
  - ReservationStatus (PENDING, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW)
  - SectionType (17 types: HERO, CUSTOM, SPACE_LIST, NEWS_LIST, FAQ_LIST, etc.)
  - PaymentStatus (UNPAID, PENDING, PAID, REFUNDED, FAILED)
  - PostStatus, TermsStatus, CouponType, NavigationType, SocialPlatform, AnnouncementBarType, etc.

### bunfig.toml
- **test.preload**: setup-dom.ts, setup.ts (JSDOM)
- **coverageThreshold**: line/function 90%
- **timeout**: 5000ms

## CACHING STRATEGY ('use cache' + PPR)

### Function-level ('use cache' directive)
```typescript
'use cache'
cacheLife(CACHE_LIFE.PUBLIC_CONTENT)     // 'hours' preset
cacheTag(CACHE_TAGS.POSTS, getCacheTag.posts.detail(slug))
```

### Constants (Magic strings forbidden)
- **CACHE_TAGS**: POSTS, SPACES, RESERVATIONS, SETTINGS, PAGES, CUSTOMERS, INQUIRIES, NEWS, etc.
- **CACHE_LIFE**: 
  - PUBLIC_CONTENT = 'hours' (posts, news, spaces, pages)
  - STATIC_SETTINGS = 'days' (site config, nav)
  - DYNAMIC_DATA = 'minutes' (availability, calendar)
  - METADATA = 'hours' (SEO, structured data)
- **getCacheTag**: Hierarchical generators
  - getCacheTag.posts.detail(slug) → "posts-[slug]"
  - getCacheTag.reservations.calendar() → "reservations-calendar"

### Invalidation
- **updateTag()**: Immediate (Server Actions only), same request
  - Used: After create/update/delete in executeAdminMutationResult
  - Effect: read-your-own-writes pattern
- **revalidateTag()**: Async (Route Handlers, CRON, webhooks)
  - Requires: Second parameter (CACHE_LIFE profile) in Next.js 16
  - Effect: Regenerates on next request

## SERVER ACTIONS PATTERN (executeAdminMutationResult)

### Admin Write Operations
1. **Validate**: Zod safeParse outside executeAdminMutationResult
2. **Execute**: Domain command passed to executeAdminMutationResult
3. **Auth**: Automatic
   - Role check (SUPER_ADMIN/ADMIN/EDITOR determined by resource:action)
   - Permission matrix: ROLE_PERMISSIONS in @/admin/lib/permissions.ts
   - Resource access: userPageAssignment for EDITOR role (if checkResourceAccess: true)
4. **Audit**: Automatic logAction via Better Auth session
5. **Cache**: updateTag() list after success callback
6. **Return**: MutationResult<T>
   - Success: { data: T }
   - Failure: { error: string, fieldErrors?: Record<string, string[]> }

### Public Form Operations
- Turnstile CAPTCHA validation (all public forms)
- checkActionRateLimit(formSubmitRateLimiter: 5 req/min)
- Direct domain command (no executeAdminMutationResult)
- Async email: fireAndForget pattern
- Return: ActionResult (success: true | error: string)

## AUTHENTICATION & AUTHORIZATION

### Better Auth 1.5.6
- **Providers**: Email/password (admin), Google OAuth (customer), LINE OAuth (customer)
- **Roles**: SUPER_ADMIN > ADMIN > EDITOR > VIEWER > USER > CUSTOMER
- **Adapter**: Prisma (generateId="uuid", prismaForBetterAuth for adapter)
- **Plugin**: nextCookies() (enables Set-Cookie in Server Actions)

### Session Retrieval
**Server Components** (with cache()):
- `verifySession()`: Any logged-in admin, redirects /admin/login if not
- `verifyAdminSession()`: SUPER_ADMIN only, redirects if insufficient role
- `getCurrentUser()`: Optional (undefined if not logged in)
- `verifyCustomerSession()`: CUSTOMER role only, redirects /login if not

**Server Actions** (no cache):
- `getSession()`: Returns session or null
- `checkPermission(resource, action)`: Returns ActionFailure if not authorized

**API Routes**:
- `checkPermission(resource, action, headers)`: Takes headers as 3rd arg

### Resource-level Access (EDITOR role)
- `userPageAssignment` model: ties EDITOR to specific pages
- `checkResourceAccess: true` in executeAdminMutationResult validates
- Prevents EDITOR from editing other users' resources

## PROXY (src/proxy.ts)

**Responsibilities**:
1. **Admin Gate**: /admin/login token check (ADMIN_GATE_COOKIE_NAME)
2. **Rate Limit**: /api/* except /webhooks, /cron → 100 req/min
3. **CRON Auth**: /api/cron requires Authorization header (CRON_SECRET)
4. **Security Headers**: CSP + nonce per request, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy
5. **Nonce Management**: Random base64 nonce per request for CSP

**Does NOT handle**: Public routing (handled by route pages)

## DOMAIN LAYER (35 Domains)

Each domain: `commands.ts` (writes), `queries.ts` (reads), optional `admin-queries.ts`/`public-queries.ts`

**Key Domains**:
- **reservations**: Booking management, pricing calculation, calendar sync, soft delete
- **spaces**: Rental spaces, images, pricing, descriptions
- **customers**: Customer management, ソーシャル auth link (ensureCustomerLinked)
- **posts**: Blog articles, Lexical JSON editor, version history, taxonomy (categories/tags)
- **news**: News articles, Lexical JSON editor, version history
- **pages**: Custom pages (Page-First Architecture)
- **sections**: Section parsing, 17 types, DataLoader pattern (some async)
- **settings**: Site/business/notification configuration, cached queries
- **coupons**: Discount codes (percentage/fixed amount), validity dates
- **inquiries**: Contact form submissions, 3-step customer link resolution
- **reviews**: Space reviews with ratings
- **users**: Admin user management, invitations, roles

## PAGE-FIRST ARCHITECTURE

### PageContent Model
- Fixed pages: homepage, about, contact, faq, news listing, posts listing
- Fields: pageKey (slug), sections[], metadata
- Sections: Zod parsed per type (17 types)
- Caching: cacheTag(CACHE_TAGS.PAGES, getCacheTag.pages.detail(slug))
- DataLoader split: Some sections (space-list, news-list, faq-list) load data async

### Custom Pages ([...segments])
- Page model: id, slug, sections, metadata
- Dynamic routing: /[...segments] captures path segments
- SectionRenderer: Polymorphic rendering by section.type
- Admin editor: Section DnD, properties form per type

## LEXICAL EDITOR INTEGRATION

**Models**: Post, PostVersion, News, NewsVersion, Terms, TermsVersion, Section, FaqItem
- **Dual storage**: contentJson (EditorState, primary), contentHtml (HTML cache)

**Rendering**:
- **Admin**: Edit via Lexical with custom toolbar (code, lists, tables, links, media)
- **Public**: Serve contentHtml (precomputed), apply DOMPurify
- **Preview**: renderEditorStateToHtmlClient (client-side, safe)

**Server rendering**:
- renderEditorStateToHtmlLazy (dynamic import, Route Handler safe)
- Updates both contentJson and contentHtml on save

## PRISMA PATTERNS

### $extends (createAppPrismaClient)
- Converts Decimal → number (pricePerHour, totalPrice, couponAmount, etc.)
- Applied: app code + seed.ts
- Types exported: Space, Reservation, Customer, Settings, Coupon

### Adapters
- **prismaForBetterAuth**: Non-extended PrismaClient for Better Auth adapter
- Prevents circular dependency with $extends client

### JSON Fields
- Zod validators: parseStringArray, parseBusinessHours, parseLayoutWidth in json-validators.ts
- Store as Prisma.InputJsonObject, parse on read
- Examples: imageUrls (string[]), facilities (string[]), businessHours (nested objects)

### Enums
- Import from @generated/prisma/client
- Type guards: isValidRole, getValidRole, etc. in @/shared/lib/validations/enums.ts
- Never: string literals like 'ADMIN' or local Set definitions
- Prisma 7 mapped enum values = schema names (snake_case), not DB values

### Decimal Handling
- $extends applies to read results automatically (no manual Number())
- Aggregates (_sum, _avg) still return Decimal, require Number()
- Rule: Never `as number` assertion; let $extends or explicit Number() handle

## SHARED UTILITIES LAYER

**Authentication** (`@/shared/lib/auth.ts`):
- getSession, verifySession, getCurrentUser
- Better Auth config (OAuth, providers, adapter)
- getRoleFromSession, getSessionUser (type-safe Role conversion)

**Caching** (`@/shared/lib/constants/cache.ts`):
- CACHE_TAGS enum (magic string prohibition)
- CACHE_LIFE presets (hours, minutes, days, weeks, max)
- getCacheTag hierarchical generators

**Validation** (`@/shared/lib/validations/enums.ts`):
- isValid* type guards for all Prisma enums
- getValid* with fallback defaults
- Used: form onChange, DB value parsing

**Serialization** (`@/shared/lib/serialize.ts`):
- toPlainObject, toPlainArray (React 19 Symbol removal)
- keysOf, entriesOf, omitUndefined (type-safe Object methods)
- Critical: Prisma objects must be serialized before Server→Client boundary

**Error Handling** (`@/shared/lib/errors/`):
- logger (server-only), logger-core (seed-safe)
- safeFetch (auto-log errors, fallback support)
- DomainError, ErrorCategory, ErrorSeverity
- createFailure, createSuccess, isMutationError

**Rate Limiting** (`@/shared/lib/rate-limit.ts`):
- formSubmitRateLimiter: 5 req/min per IP (public forms)
- publicQueryRateLimiter: 30 req/min per IP (public queries)
- getClientIpFromHeaders (used in Server Actions)

## INSTRUMENTATION & MIDDLEWARE

- **src/instrumentation.ts**: register() runs once per startup
  - validateProductionEnv()
  - bootstrapSystemPages() (create system pages if missing)

- **src/proxy.ts**: Matches all requests except static assets
  - Admin gate check (ADMIN_GATE_COOKIE_NAME for /admin/login access)
  - Rate limit /api/* (except /webhooks, /cron)
  - CRON auth check (/api/cron requires Authorization header)
  - CSP headers with random nonce per request
  - Security headers: HSTS, X-Frame-Options, Referrer-Policy

## CRITICAL CONCERNS & GAPS

1. **@layer compat vs @theme**: Old Tailwind tokens in @layer compat don't reflect in utility classes. New tokens must use @theme. Legacy sections still reference old tokens causing styling inconsistencies.

2. **Turbopack Chunk Duplication**: Lexical core (275KB×3), Prism.js (168KB×2) bundled separately per route group. Known limitation, awaiting Turbopack PR #78194.

3. **Catch Block Pattern PPR**: Route Handlers accessing request.headers during prerender throw bail-out errors. Catch blocks must include unstable_rethrow(error) to avoid build noise.

4. **Type Guard Inconsistency**: Some enums have local type guards (Set-based) in addition to centralized enums.ts. Should consolidate to single source.

5. **Prisma 7 Mapped Enums**: Values are schema field names (snake_case), not DB column values. Requires careful comparison logic.

6. **React 19 Serialization**: Prisma objects contain Symbol properties that fail React Server→Client boundary. MUST use toPlainObject/toPlainArray before returning from Server Components/Actions.

## OUTSTANDING OBSERVATIONS

- **Multiple Root Layouts**: admin and public share no CSS, fonts, or layout. Full page reload on group transition.
- **Page-First supersedes Component-Driven**: Old section registry (feature branch) only used for [...]segments custom pages now.
- **Better Auth Social**: accountLinking ("google", "line") auto-merges same-email accounts. Admin account auto-redirects to /admin.
- **Soft Delete**: Reservations track cancellation with deletedAt. Queries filter by status OR deletedAt check.
- **iCal + GCal Sync**: Bidirectional reservation ↔ calendar sync. Polling + webhook channels. Outbound sync uses iCal standard, inbound uses Google Calendar API.