# Rental Space Management System - AGENTS.md

- **Priority: High** - Before starting any task, the agent must check and follow user rules configured in Cursor Settings → Rules. User rules take precedence and contain important guidelines about communication language, documentation standards, development practices, and project-specific requirements (e.g., date verification, external information retrieval, AI usage guidelines).
- **Note**: This document follows the [AGENTS.md format](https://agents.md/), an open format for guiding coding agents. AGENTS.md serves as a "README for agents"—a dedicated place for build steps, tests, conventions, and project-specific guidance. **This document must be written and maintained in English** to align with the official format, though general communication with AI agents may be in Japanese.

## Implementation Philosophy

**Clean Implementation Without Backward Compatibility**: This project prioritizes clean, modern implementations following the latest official best practices. We do **not** maintain backward compatibility with older versions or deprecated APIs. All implementations should use the latest stable versions of frameworks and libraries, following their official recommendations without legacy workarounds.

**Key Principles**:
- Use the latest stable versions of Next.js 16, React 19, Prisma 7, Auth.js 5, and other dependencies
- Follow official best practices and recommended patterns (no deprecated APIs)
- Prefer modern patterns (Server Components, Server Actions, JWT sessions) over legacy approaches
- Remove deprecated code patterns and replace them with modern alternatives
- No polyfills or compatibility layers unless absolutely necessary for production stability

---

## Setup commands

- Install deps: `bun install`
- Setup environment: `cp .env.example .env.local` (then edit `.env.local`)
- Database migration: `bunx prisma migrate dev`
- Start dev server: `bun run dev` (runs on `http://localhost:3000`)
 - **Note**: Next.js 16 uses Turbopack by default for both development and production builds
 - **Project policy**: This project uses Turbopack only. Webpack is not used.
- Build: `bun run build`
- Start production: `bun run start`
- Lint: `bun run lint`
- Type check: `bun run type-check`
- Run tests: `bun run test`
- Test watch mode: `bun run test:watch`
- Test coverage: `bun run test:coverage`
- Prisma Studio: `bunx prisma studio`

---

## Code style

- TypeScript strict mode enabled
- Explicit type annotations for function parameters and return values
- Naming: PascalCase for components (`ReservationForm`), camelCase for functions/variables (`getReservationById`), UPPER_SNAKE_CASE for constants (`MAX_RESERVATION_HOURS`), kebab-case for file names (`reservation-form.tsx`)
- Single quotes, no semicolons (follow Prettier config)
- Import order: React/Next.js → third-party libraries → internal modules (`@/`) → relative imports → type-only imports (`import type`)
- Server Components by default; use `'use client'` directive explicitly for Client Components
- Define component props with `interface` or `type`

---

## Testing instructions

- The agent will automatically run relevant programmatic checks and fix failures before finishing tasks
- Before running tests, always run `bun run lint` and `bun run type-check` after code changes
- Fix type and lint errors before running tests
- Run all tests: `bun run test`
- Run specific test file: `bun run test reservation-form.test.tsx`
- Watch mode: `bun run test:watch`
- E2E tests: `bun run test:e2e` (Playwright)
- E2E UI mode: `bun run test:e2e:ui`
- Coverage report: `bun run test:coverage`
- Always add/update tests when changing code
- Include clear descriptions in `describe` and `it` blocks
- Use mocks sparingly
- Tests must be independently executable
- **For detailed testing requirements**: See [`docs/TEST_REQUIREMENTS.md`](docs/TEST_REQUIREMENTS.md) for comprehensive test requirements, test environment setup, CI/CD integration, and testing best practices

### Test structure
- **Unit tests**: `tests/unit/` - Test individual functions and components
- **Integration tests**: `tests/integration/` - Test component interactions
- **E2E tests**: `tests/e2e/` - Test complete user flows (Playwright)
- **Test coverage target**: 80% or higher

### Test coverage areas
- Form validation (Zod schemas)
- Authentication flows (login, logout, session management)
- Reservation flows (create, update, delete)
- Customer management (profile management, statistics calculation)
- Admin CRUD operations
- Server Actions
- API routes (Route Handlers)
- Error handling

### Testing best practices
- Always run `bun run lint` and `bun run type-check` before tests
- Write tests alongside code (not after)
- Use clear descriptions in `describe` and `it` blocks
- Use mocks sparingly (prefer real implementations when possible)
- Ensure tests are independently executable
- Maintain test coverage reports

---

## Dev environment tips

- Project structure: Use `src/app/` for App Router, `src/components/` for components, `src/actions/` for Server Actions, `src/types/` or module-level for type definitions, `src/lib/` for utilities (see `docs/PROJECT_STRUCTURE.md` for details)
- Prisma: Create migration after schema changes with `bunx prisma migrate dev --name <migration_name>`, deploy with `bunx prisma migrate deploy`, view DB with `bunx prisma studio`
- Environment variables: Use `.env.local` for development (don't commit), Google Secret Manager for production, see `.env.example` for required variables
- Debugging: Server Components log to server console, Client Components use browser dev tools, enable Prisma query logs with `DEBUG=prisma:*`
- Performance: Use Next.js `Image` component, lazy-load large libraries with `dynamic`, use appropriate cache strategies in Server Components
- **Dependency management (Bun)**: Check outdated packages with `bun outdated` (shows Current/Wanted/Latest), get package info with `bun info <package>`, check upgrade impact with `bun add <package>@latest --dry-run`, use `bunx npm-check-updates` for major version updates, verify installed versions with `bun pm ls`. **Recommended workflow**: 1) `bun outdated` for overview, 2) `bun info <package> version` for specific packages, 3) `bun add <package>@latest --dry-run` to check impact, 4) `bunx npm-check-updates` for generation updates. **Important**: Bun prioritizes lockfile (`bun.lockb`), use `bun install --frozen-lockfile` in CI/Cloud Run, `latest` may not always be appropriate (Next.js/Prisma/React have breaking changes)

---

## PR instructions

- Commit message format: Conventional Commits `<type>(<scope>): <subject>`
 - Types: `feat` (new feature), `fix` (bug fix), `docs` (documentation), `style` (formatting), `refactor`, `test`, `chore`
 - Examples: `feat(admin): add space management form`, `fix(reservation): correct time slot validation`
- PR title: Follow commit message format
- PR description: Include change summary, reason, and testing approach
- Before committing: Quality checks run automatically via Git hooks (pre-commit)
- Pre-review checklist:
 - [ ] `bun run lint` passes (automatically checked by pre-commit hook)
 - [ ] `bun run type-check` passes (automatically checked by pre-commit hook)
 - [ ] `bun run test` passes (automatically checked by pre-commit hook)
 - [ ] Related documentation updated

---

## Project overview

A reservation and management system for rental spaces. Provides a highly designed public-facing website and a practical admin interface.

---

## Technical stack

### Core technologies
- **React**: 19.2.3 (latest stable with CVE-2025-55182 fix)
- **Next.js**: 16.1.1 (latest stable with CVE-2025-55182 fix)
- **TypeScript**: 5.9.3
- **Bun**: 1.3.5 (package manager & runtime)

### Database & ORM
- **Prisma**: 7.2.0
- **Supabase**: PostgreSQL (database)
- **Zod**: 4.3.5 (schema validation)

### URL State Management
- **nuqs**: 2.8.5 (type-safe query parameter management for Next.js 16 App Router)

### UI & Styling
- **Tailwind CSS**: 4.1.18
- **GSAP** or **Framer Motion**: Animation
- **Three.js** or **Pixi.js**: 3D/2D graphics (public pages)

### Authentication
- **Auth.js**: 5.0.0-beta.30 (beta; latest stable 4.24.13)

### Deployment
- **Google Cloud Run**: Application
- **Supabase**: Database & authentication

---

## Important technical constraints

### Prisma and Edge Runtime
- **Prisma does not support Edge Runtime**
- Next.js API Routes and Server Actions use Bun Runtime
- Explicitly specify `runtime = "nodejs"` (Bun has Node.js compatibility)
- If Edge Runtime is required, consider an alternative approach without Prisma

### Full Bun Runtime Support
- **This project runs fully on Bun 1.3.5**: Package manager, runtime, build tool, and test runner
- **Development**: All commands use Bun (`bun run dev`, `bun run build`, etc.)
- **Production**: Docker container uses `oven/bun:1.3.5` base image
- **Cloud Run**: Deployed as Docker container with Bun runtime
- **Compatibility**: Prisma, Next.js, Auth.js all work perfectly with Bun due to Node.js compatibility
- See [`docs/BUN_RUNTIME.md`](docs/BUN_RUNTIME.md) for detailed information

### Auth.js 5 and Prisma Adapter
- Pay attention to Prisma Adapter version compatibility
- Use the latest stable version of `@auth/prisma-adapter` (2.11.1)
- Session management integrates with Supabase Row Level Security (RLS)
- Verify compatibility before applying version updates

### Security considerations
- **Critical**: React 19.0-19.2.0 and Next.js 15.x-16.0.6 have a critical security vulnerability (CVE-2025-55182)
- **Required**: Upgrade to React 19.2.3 and Next.js 16.1.1 immediately (latest stable as of 2026-01-05)
 - This vulnerability allows unauthenticated remote code execution on the server
 - **Note**: Next.js 16.1.1 was released on 2025-12-22 and includes the security fix
- Apply React Server Components security patches
- Manage environment variables with Google Secret Manager (do not commit `.env.local` to Git)
- Configure Supabase RLS policies appropriately
- Always perform input validation with Zod schemas (both client and server)

---

## Additional documentation

For detailed information, see [`docs/README.md`](docs/README.md) for the documentation index.

Key documents:
- **Documentation index**: [`docs/README.md`](docs/README.md)
- **Feature requirements**: [`docs/FEATURE_REQUIREMENTS.md`](docs/FEATURE_REQUIREMENTS.md)
- **Blog requirements**: [`docs/BLOG_REQUIREMENTS.md`](docs/BLOG_REQUIREMENTS.md)
- **Email requirements**: [`docs/EMAIL_REQUIREMENTS.md`](docs/EMAIL_REQUIREMENTS.md)
- **Settings requirements**: [`docs/SETTINGS_REQUIREMENTS.md`](docs/SETTINGS_REQUIREMENTS.md)
- **Customer name design**: [`docs/CUSTOMER_NAME_DESIGN.md`](docs/CUSTOMER_NAME_DESIGN.md)
- **JWT auth requirements**: [`docs/JWT_AUTH_REQUIREMENTS.md`](docs/JWT_AUTH_REQUIREMENTS.md)
- **Database design**: [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md)
- **Project structure**: [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md)
- **Architecture**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **API specification**: [`docs/API.md`](docs/API.md)
- **Deployment guide**: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- **Docker guide**: [`docs/DOCKER.md`](docs/DOCKER.md)
- **Cloudflare CDN guide**: [`docs/CLOUDFLARE_CDN.md`](docs/CLOUDFLARE_CDN.md)
- **Security policy**: [`docs/SECURITY.md`](docs/SECURITY.md)
- **Test requirements**: [`docs/TEST_REQUIREMENTS.md`](docs/TEST_REQUIREMENTS.md)
- **Turbopack requirements**: [`docs/TURBOPACK_REQUIREMENTS.md`](docs/TURBOPACK_REQUIREMENTS.md)
- **Bun runtime guide**: [`docs/BUN_RUNTIME.md`](docs/BUN_RUNTIME.md)
- **Tech stack versions**: [`docs/TECH_STACK_VERSIONS.md`](docs/TECH_STACK_VERSIONS.md)
- **Consistency check**: [`docs/CONSISTENCY_CHECK.md`](docs/CONSISTENCY_CHECK.md)
- **Best practices**: [`docs/BEST_PRACTICES.md`](docs/BEST_PRACTICES.md)
- **Caching strategy**: [`docs/CACHING_STRATEGY.md`](docs/CACHING_STRATEGY.md)
- **Turnstile requirements**: [`docs/TURNSTILE_REQUIREMENTS.md`](docs/TURNSTILE_REQUIREMENTS.md)
- **DDoS protection requirements**: [`docs/DDOS_PROTECTION_REQUIREMENTS.md`](docs/DDOS_PROTECTION_REQUIREMENTS.md)
- **Abuse protection requirements**: [`docs/ABUSE_PROTECTION_REQUIREMENTS.md`](docs/ABUSE_PROTECTION_REQUIREMENTS.md)
- **NUQS requirements**: [`docs/NUQS_REQUIREMENTS.md`](docs/NUQS_REQUIREMENTS.md)
- **Extensibility plan**: [`docs/EXTENSIBILITY_PLAN.md`](docs/EXTENSIBILITY_PLAN.md)
- **Extensibility plan consistency check**: [`docs/EXTENSIBILITY_PLAN_CONSISTENCY_CHECK.md`](docs/EXTENSIBILITY_PLAN_CONSISTENCY_CHECK.md)
- **Verification report**: [`docs/VERIFICATION_REPORT.md`](docs/VERIFICATION_REPORT.md)
- **Document consistency report**: [`docs/DOCUMENT_CONSISTENCY_REPORT.md`](docs/DOCUMENT_CONSISTENCY_REPORT.md)

---

## Authentication & authorization

- **Auth.js 5**: Email/Password, Google OAuth (as needed)
- **Session strategy**: JWT (recommended) or Database
- **Prisma Adapter**: Use `@auth/prisma-adapter` (check compatibility with Prisma 7.2.0)
- **Roles**: `admin`, `user`
- **Protection**: Next.js Middleware for routes, permission checks in Server Actions
- **Supabase RLS**: Database-level security
- **Bot protection**: Cloudflare Turnstile integrated for login form (see [`docs/TURNSTILE_REQUIREMENTS.md`](docs/TURNSTILE_REQUIREMENTS.md))

---

## Deployment

- **Google Cloud Run**: Bun 1.3.5 runtime (via Docker container), multi-stage Dockerfile, Artifact Registry, Secret Manager
 - **Note**: Bun has Node.js compatibility, so Prisma works perfectly with Bun runtime
- **Supabase**: PostgreSQL database, Storage, Realtime, Edge Functions
- **CI/CD**: GitHub Actions or Cloud Build, automatic Prisma migrations
- **Environment variables**: `.env.local` (dev), Google Secret Manager (prod)

---

---

## Security best practices

### Environment variables
- Use `.env.local` for development (never commit to Git)
- Use Google Secret Manager for production
- Validate all required environment variables on application startup
- Never hardcode sensitive information in source code
- **Required environment variables**:
 - `TURNSTILE_SITE_KEY`: Cloudflare Turnstile site key (public)
 - `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile secret key (confidential)
 - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: Client-side site key (public)
 - See `.env.example` for all required variables
 - See [`docs/TURNSTILE_REQUIREMENTS.md`](docs/TURNSTILE_REQUIREMENTS.md) for Turnstile-specific environment variables

### Input validation
- Validate all user inputs with Zod schemas (both client and server)
- Implement file upload validation (size, format, malware scanning)
- Use Prisma ORM to prevent SQL injection attacks
- Sanitize user inputs before database operations

### Authentication & authorization
- Implement rate limiting for login attempts
- Use secure session management (JWT with appropriate `maxAge`)
- Configure secure cookies (`HttpOnly`, `Secure`, `SameSite`)
- Protect API routes and Server Actions with authentication checks
- Implement role-based access control (RBAC) in Middleware and Server Actions
- **Bot protection**: Integrate Cloudflare Turnstile for form submissions (reservation, contact, login forms)
 - See [`docs/TURNSTILE_REQUIREMENTS.md`](docs/TURNSTILE_REQUIREMENTS.md) for detailed requirements

### Security headers
- Configure security headers in `next.config.js`
- Implement Content Security Policy (CSP) with strict directives (avoid `unsafe-eval` and `unsafe-inline` when possible)
 - **Cloudflare Turnstile**: Add `https://challenges.cloudflare.com` to `script-src`, `frame-src`, and `connect-src` directives
- Set `X-Frame-Options` to `DENY` (or `SAMEORIGIN` if iframes are needed)
- Set `X-Content-Type-Options` to `nosniff`
- Configure `Permissions-Policy` to disable unnecessary browser features
- Use `strict-origin-when-cross-origin` for `Referrer-Policy`
- Enable HTTPS for all communications (HSTS with `preload`)
- See [`docs/SECURITY.md`](docs/SECURITY.md) for detailed configuration examples

### Bot protection
- **Cloudflare Turnstile**: Integrated for form submissions (reservation, contact, login forms)
 - Non-interactive CAPTCHA alternative (managed mode)
 - Server-side verification required
 - Integrated with rate limiting for multi-layer defense
 - See [`docs/TURNSTILE_REQUIREMENTS.md`](docs/TURNSTILE_REQUIREMENTS.md) for detailed requirements
- **Cloudflare Bot Fight Mode**: Already enabled (free plan)
 - Works alongside Turnstile for comprehensive bot protection
 - See [`docs/CLOUDFLARE_CDN.md`](docs/CLOUDFLARE_CDN.md) for details

### Database security
- Configure Supabase Row Level Security (RLS) policies
- Use parameterized queries (Prisma ORM handles this)
- Implement proper access controls at the database level
- Regular security audits and dependency updates

### Caching security
- **Never cache sensitive data**: User-specific data, session information, authentication tokens must not be cached
- **Use `unstable_noStore()` for authenticated data**: All data that depends on authentication state should use `unstable_noStore()`
- **Avoid sensitive information in cache keys**: Do not include user IDs, session tokens, or other sensitive data in cache keys or tags
- **Separate public and private caches**: Public data and private data should use separate cache keys and tags
- **Invalidate cache on authentication changes**: When user authentication state changes (login, logout, role change), invalidate related caches
- **Cache poisoning prevention**: Be careful with user input-based cache keys; validate and sanitize inputs
- See [`docs/CACHING_STRATEGY.md`](docs/CACHING_STRATEGY.md) for detailed security considerations

---

## Performance optimization

### Rendering strategies
- Use Server Components by default (reduces client-side JavaScript)
- Implement appropriate rendering strategies per page:
 - Static Site Generation (SSG) for static content
 - Server-Side Rendering (SSR) for dynamic content
 - Incremental Static Regeneration (ISR) for semi-static content
- Use `generateStaticParams` for dynamic routes when possible

### Caching strategy
- Leverage Next.js 16 Cache API for optimal performance
- Use `unstable_cache` for function result caching with tags
- Use `unstable_noStore` to opt out of caching for dynamic data
- Use `revalidate` option in `fetch()` for flexible caching
- Implement ISR with appropriate revalidation intervals
- Use `revalidatePath`, `revalidateTag`, `updateTag`, and `refresh` for on-demand revalidation
- Cache database queries appropriately with `unstable_cache`
- See [`docs/CACHING_STRATEGY.md`](docs/CACHING_STRATEGY.md) for detailed caching strategies

### Image optimization
- Always use Next.js `Image` component
- Integrate with Supabase Storage for image hosting
- Enable lazy loading for images
- Convert images to WebP format automatically
- Optimize image sizes and dimensions

### Bundle size optimization
- Use dynamic imports for large libraries (Three.js, Pixi.js)
- Implement route-based code splitting
- Verify tree-shaking is working correctly
- Monitor bundle sizes regularly
- Lazy-load components that are not immediately needed
- **Turbopack**: Next.js 16 uses Turbopack by default, which provides faster builds (2-5× faster) and improved Fast Refresh (up to 10× faster). This project uses Turbopack only. Webpack is not used. Custom configurations are handled via `turbopack` option in `next.config.js`. See [`docs/TURBOPACK_REQUIREMENTS.md`](docs/TURBOPACK_REQUIREMENTS.md) for details.

### Data fetching optimization
- Fetch data in Server Components when possible (use `await` directly in Server Components)
- Use parallel data fetching with `Promise.all`
- Fetch only necessary fields with Prisma `select`
- Use Prisma `include` to avoid N+1 query problems
- Implement pagination for large datasets
- Optimize database queries with proper indexes
- Use transactions for multiple related operations
- **Customer management**: Customer names are stored as separate `lastName` and `firstName` fields for internationalization support and better search/sort capabilities. See [`docs/CUSTOMER_NAME_DESIGN.md`](docs/CUSTOMER_NAME_DESIGN.md) for design rationale
- See [`docs/BEST_PRACTICES.md`](docs/BEST_PRACTICES.md) for detailed best practices

---

## Reference resources

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Auth.js Documentation](https://authjs.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Next.js App Router Best Practices](https://nextjs.org/docs/app/building-your-application/routing)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [Auth.js Security Best Practices](https://authjs.dev/getting-started/security)
- [AGENTS.md Format](https://agents.md/)