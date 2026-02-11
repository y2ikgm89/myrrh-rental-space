# AGENTS.md

> This document follows the [AGENTS.md format](https://agents.md/)—a tool-agnostic, open format for guiding coding agents.
>
> **Communication Language**: Agents must respond in **Japanese** for all user interactions.

## Project overview

A reservation and management system for rental spaces. Provides a highly designed public-facing website with scroll-driven animations and a practical admin interface with a rich text editor.

**Architecture**: Next.js 16 Multiple Root Layouts—public pages and admin dashboard are fully isolated with separate CSS themes, layouts, and component trees.

## Implementation philosophy

- Use the latest stable versions of all dependencies, following official best practices
- Prefer modern patterns (Server Components, Server Actions, `'use cache'`) over legacy approaches
- No backward compatibility hacks—remove deprecated code, don't leave unused re-exports or `// removed` comments
- No type assertions (`as`)—use type guards, `satisfies`, or Zod validation instead

## Setup commands

```bash
bun install                              # Install dependencies
cp .env.example .env.local               # Setup environment (then edit)
docker-compose up -d postgres            # Start PostgreSQL (Docker Desktop)
bunx --bun prisma migrate dev            # Database migration
bun run dev                              # Dev server (Turbopack, http://localhost:3000)
bun run build                            # Production build
bun run type-check                       # TypeScript check
bun run lint                             # ESLint
bun run validate                         # type-check + lint in parallel
bun run test                             # Unit/integration tests (Bun)
bun run test:all                         # Unit + integration in parallel
bunx --bun prisma studio                 # Database GUI
```

## Code style

- **Server Components by default**, Client Components only when necessary (`'use client'`)
- **Zod validation** on all inputs (client and server)
- **Naming**: Components `PascalCase.tsx`, utilities `kebab-case.ts`
- **CSS**: Tailwind CSS 4 with `@theme` directive, OKLCH colors, semantic tokens (`text-foreground`, `bg-muted`). No hardcoded color classes (`gray-*`, `blue-*`)
- **Imports**: Use path aliases `@/admin/*`, `@/public/*`, `@/shared/*`
- **React Compiler** (Next.js 16 default): No manual `useCallback`/`useMemo` unless required by external library APIs
- **React Hook Form**: Use `useWatch()` instead of `watch()` for React Compiler compatibility

## Testing instructions

```bash
bun run test                             # All tests
bun run test __tests__/unit/lib/foo.ts   # Specific file
bun run test:watch                       # Watch mode
bun run test:coverage                    # Coverage report
```

- Run `bun run validate` before committing
- Run `bun run validate && bun run build` before creating PRs
- Unit/integration tests use Bun Test (`__tests__/`)
- E2E tests use Playwright (`e2e/`)

## Dev environment tips

- **Project structure** (Multiple Root Layouts):
  ```
  src/
  ├── app/
  │   ├── (admin)/                # Admin Root Layout (html/body)
  │   │   ├── _styles/admin.css   # Admin theme (fixed)
  │   │   └── admin/(dashboard)/  # Admin routes + _shared/
  │   └── (public)/               # Public Root Layout (html/body)
  │       ├── _styles/public.css  # Public theme (customizable)
  │       ├── [slug]/page.tsx     # Section-based pages
  │       └── _shared/            # Public components, actions, lib
  └── shared/                     # Shared utilities (no CSS dependency)
  ```
  Additional public route groups (`(public-*)`) follow the same pattern.
- **Cross-layout navigation**: Public ↔ Admin causes a full page reload (separate Root Layouts)
- **Prisma**: `bunx --bun prisma migrate dev --name <name>` after schema changes
- **Environment**: `.env.local` for dev, Google Secret Manager for production
- **Performance**: Use `Image` component, lazy-load heavy libraries (`dynamic()`), use `'use cache'` + `cacheTag` for data caching
- **Bun**: Check outdated packages with `bun outdated`, use `bun install --frozen-lockfile` in CI

## PR instructions

- **Commit format**: Conventional Commits `<type>(<scope>): <subject>`
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- **Pre-commit checklist**: `bun run validate && bun run test`
- **PR description**: Include change summary, reason, and testing approach

## Technical stack

| Technology | Version | Notes |
|-----------|---------|-------|
| Next.js | 16.x | `'use cache'`, `updateTag`, PPR, Turbopack |
| React | 19.x | React Compiler, `useEffectEvent`, `<Activity>` |
| TypeScript | 5.9.x | Strict mode |
| Bun | 1.3.x | Package manager, runtime, test runner |
| Prisma | 7.x | PostgreSQL via Supabase |
| Better Auth | 1.4.x | RBAC, cookie sessions |
| Tailwind CSS | 4.x | CSS-first config, `@theme`, OKLCH |
| Zod | 4.x | `{ error: }` parameter (not `message`) |
| nuqs | 2.x | URL state management, `createSearchParamsCache` |
| GSAP | 3.x | ScrollTrigger, `gsap.matchMedia()`, Lenis smooth scroll |
| Lexical | 0.40.x | Rich text editor (admin) |
| Three.js | R3F | 3D effects on public pages (L3+) |
| PixiJS | v8 | 2D GLSL filters on public pages (L4) |

**Deployment**: Google Cloud Run (Bun runtime) + Supabase (PostgreSQL, Storage)

## Important technical constraints

- **Prisma does not support Edge Runtime**—use Node.js/Bun runtime for API Routes and Server Actions
- **Better Auth**: Use `better-auth/adapters/prisma`, verify compatibility before version updates
- **GSAP reduced-motion**: Use `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` (official recommended pattern). Do not use legacy `prefersReducedMotion()` helper
- **Visual effects**: 4-level system (L1 CSS → L2 GSAP → L3 Three.js → L4 PixiJS). GPU detection via `detect-gpu`. Always provide lower-level fallbacks
- **JSON fields**: Use Zod schemas for runtime validation (`safeParse`), not type assertions

## Authentication & authorization

- **Better Auth**: Email/Password, Google OAuth
- **Session**: Cookie-based (scrypt hashing)
- **RBAC**: `SUPER_ADMIN > ADMIN > EDITOR > VIEWER > USER`
- **Protection**: Middleware for route guards, `checkPermission()` / `checkAdminAuth()` in Server Actions
- **Audit**: `logAction()` for admin operations

## Security best practices

- Validate all inputs with Zod schemas (client and server)
- Never hardcode secrets—use `.env.local` (dev), Secret Manager (prod)
- Use `checkPermission()` in all admin Server Actions
- Sanitize JSON-LD output (XSS prevention)
- Rate limiting on auth endpoints

## Caching patterns

- **`'use cache'` + `cacheTag()`**: Tag-based caching for data fetching functions
- **`updateTag()`**: Immediate cache invalidation in Server Actions (read-your-own-writes)
- **`revalidateTag()`**: Async revalidation (when delay is acceptable)
- **Cache tag constants**: Always use `CACHE_TAGS.*` from `@/shared/lib/constants/cache.ts`—no magic strings

## Additional documentation

- `docs/architecture/` — Architecture, database design, caching strategy
- `docs/requirements/` — Feature requirements
- `docs/plans/` — Implementation plans
- `docs/reference/` — Detailed rule references
