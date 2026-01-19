# [AGENTS.md](http://AGENTS.md)

> **Priority: High** - **Cursor-specific**: When using Cursor, agents must check and follow user rules configured in Cursor Settings → Rules. User rules take precedence and contain important guidelines about communication language, documentation standards, development practices, and project-specific requirements (e.g., date verification, external information retrieval, AI usage guidelines). This section is specific to Cursor and does not apply to other IDEs or agents.
>
> **Note**: This document follows the [AGENTS.md format](https://agents.md/), an open format for guiding coding agents. AGENTS.md serves as a "README for agents"—a dedicated place for build steps, tests, conventions, and project-specific guidance. **This document must be written and maintained in English** to align with the official format, though general communication with AI agents may be in Japanese.
>
> **Communication Language**: **Agents must respond in Japanese** for all user interactions, explanations, and general communication. This includes code comments, error messages, and documentation that is not part of the official AGENTS.md format. Only the AGENTS.md file itself should be maintained in English to comply with the official format standard.

## Project overview

A reservation and management system for rental spaces. Provides a highly designed public-facing website and a practical admin interface.

## Implementation Philosophy

**Clean Implementation Without Backward Compatibility**: This project prioritizes clean, modern implementations following the latest official best practices. We do **not** maintain backward compatibility with older versions or deprecated APIs. All implementations should use the latest stable versions of frameworks and libraries, following their official recommendations without legacy workarounds.

**Key Principles**:

- Use the latest stable versions of Next.js 16, React 19, Prisma 7, Better Auth, and other dependencies
- Follow official best practices and recommended patterns (no deprecated APIs)
- Prefer modern patterns (Server Components, Server Actions, JWT sessions) over legacy approaches
- Remove deprecated code patterns and replace them with modern alternatives
- No polyfills or compatibility layers unless absolutely necessary for production stability

## Setup commands

- Install deps: `bun install`
- Setup environment: `cp .env.example .env.local` (then edit `.env.local`)
- Start PostgreSQL (Docker Desktop): `docker-compose up -d postgres`
- Database migration: `bunx --bun prisma migrate dev`
- Start dev server: `bun run dev` (runs on `http://localhost:3000`)
  - **Note**: Next.js 16 uses Turbopack by default for both development and production builds
  - **Project policy**: This project uses Turbopack only. Webpack is not used.
  - **Development database**: PostgreSQL runs in Docker Desktop (not Supabase cloud)
- Build: `bun run build`
- Start production: `bun run start`
- Lint: `bun run lint`
- Type check: `bun run type-check`
- Run tests: `bun run test`
- Test watch mode: `bun run test:watch`
- Test coverage: `bun run test:coverage`
- Prisma Studio: `bunx --bun prisma studio`

## Code style

**See Project Rules**: Detailed code style standards are defined in `.cursor/rules/code-style/RULE.md` (always applied).

## Testing instructions

**See Project Rules**: Detailed testing standards are defined in `.cursor/rules/testing/RULE.md` (applied to test files).

- The agent will automatically run relevant programmatic checks and fix failures before finishing tasks
- Before running tests, always run `bun run lint` and `bun run type-check` after code changes
- Run all tests: `bun run test`
- Run specific test file: `bun run test reservation-form.test.tsx`
- Watch mode: `bun run test:watch`
- E2E tests: `bun run test:e2e` (Playwright)
- Coverage report: `bun run test:coverage`

**For detailed testing requirements**: See `[docs/guides/testing.md](docs/guides/testing.md)`

## Dev environment tips

- Project structure: **Admin/Public/Shared Complete Separation Architecture** (Plan 042)
  - `src/admin/` - Admin-only (components, actions, hooks, contexts, lib, types)
  - `src/public/` - Public-only (components, actions, emails, lib, types)
  - `src/shared/` - Shared utilities (prisma, auth, utils, email, storage, generated/prisma)
  - `src/app/` - App Router routes
  - Path aliases: `@/admin/*`, `@/public/*`, `@/shared/*`
  - See `docs/architecture/PROJECT_STRUCTURE.md` for details
- Prisma: Create migration after schema changes with `bunx --bun prisma migrate dev --name <migration_name>`, deploy with `bunx --bun prisma migrate deploy`, view DB with `bunx --bun prisma studio`
- Environment variables: Use `.env.local` for development (don't commit), Google Secret Manager for production, see `.env.example` for required variables
- Debugging: Server Components log to server console, Client Components use browser dev tools, enable Prisma query logs with `DEBUG=prisma:*`
- Performance: Use Next.js `Image` component, lazy-load large libraries with `dynamic`, use appropriate cache strategies in Server Components
- **Dependency management (Bun)**: Check outdated packages with `bun outdated`, get package info with `bun info <package>`, check upgrade impact with `bun add <package>@latest --dry-run`, use `bunx npm-check-updates` for major version updates, verify installed versions with `bun pm ls`. **Important**: Bun prioritizes lockfile (`bun.lock` - text format, JSONC, default since Bun 1.2), use `bun install --frozen-lockfile` in CI/Cloud Run, `latest` may not always be appropriate (Next.js/Prisma/React have breaking changes)

## PR instructions

- Commit message format: Conventional Commits `<type>(<scope>): <subject>`
  - Types: `feat` (new feature), `fix` (bug fix), `docs` (documentation), `style` (formatting), `refactor`, `test`, `chore`
  - Examples: `feat(admin): add space management form`, `fix(reservation): correct time slot validation`
- PR title: Follow commit message format
- PR description: Include change summary, reason, and testing approach
- Before committing: Quality checks run automatically via Git hooks (pre-commit)
- Pre-review checklist:
  - `bun run lint` passes (automatically checked by pre-commit hook)
  - `bun run type-check` passes (automatically checked by pre-commit hook)
  - `bun run test` passes (automatically checked by pre-commit hook)
  - Related documentation updated

## Technical stack

- **React**: 19.2.3, **Next.js**: 16.1.1, **TypeScript**: 5.9.3, **Bun**: 1.3.6
- **Prisma**: 7.2.0, **Supabase**: PostgreSQL, **Zod**: 4.3.5
- **Tailwind CSS**: 4.1.18, **GSAP** or **Motion** (formerly Framer Motion), **Three.js** (`@react-three/fiber` + `@react-three/drei`) or **Pixi.js** (`@pixi/react`)
- **Better Auth**: 1.4.11, **nuqs**: 2.8.6
- **Deployment**: Google Cloud Run (Bun runtime), Supabase

**For detailed version information**: See `[docs/architecture/TECH_STACK.md](docs/architecture/TECH_STACK.md)`

## Important technical constraints

- **Prisma does not support Edge Runtime**: Use Bun Runtime (`runtime = "nodejs"`) for API Routes and Server Actions
- **Full Bun Runtime Support**: This project runs fully on Bun 1.3.6 (package manager, runtime, build tool, test runner)
- **Better Auth**: Use `better-auth/adapters/prisma` with Prisma 7, verify compatibility before version updates
- **Security**: React 19.2.3 and Next.js 16.1.1 required (CVE-2025-55182 fix). Always validate inputs with Zod schemas (client and server)

**For detailed constraints**: See `[docs/operations/bun.md](docs/operations/bun.md)` and `[docs/security/README.md](docs/security/README.md)`

## Project Rules

This project uses **Project Rules** (`.cursor/rules/`) for detailed, context-specific guidance:

- **Code Style** (`.cursor/rules/code-style/`): Always applied - TypeScript, React, naming conventions
- **Testing** (`.cursor/rules/testing/`): Applied to test files - Test standards and best practices
- **Security** (`.cursor/rules/security/`): Always applied - Security best practices
- **Server Actions** (`.cursor/rules/server-actions/`): Applied to `src/actions/**` - Server Actions patterns
- **Components** (`.cursor/rules/components/`): Applied to `src/components/**` - Component standards
- **API Routes** (`.cursor/rules/api-routes/`): Applied to `src/app/api/**` - API Routes patterns

Project Rules provide more granular, context-aware guidance than `AGENTS.md`. They are automatically applied based on file patterns or can be manually invoked with `@rule-name`.

## Security best practices

**See Project Rules**: Detailed security standards are defined in `.cursor/rules/security/RULE.md` (always applied).

- Environment variables: Use `.env.local` (dev), Google Secret Manager (prod)
- Input validation: Validate all inputs with Zod schemas (client and server)
- Authentication & authorization: Rate limiting, secure sessions, RBAC
- Bot protection: Cloudflare Turnstile for forms
- Database security: Supabase RLS policies, parameterized queries
- Caching security: Never cache sensitive data, use `<Suspense>` or `connection()` for authenticated data

**For detailed security configuration**: See `[docs/security/README.md](docs/security/README.md)` and `[docs/security/protection.md](docs/security/protection.md)`

## Performance optimization

- Use Server Components by default (reduces client-side JavaScript)
- Leverage Next.js 16 Cache API (`'use cache'` directive, `cacheLife`, `cacheTag`, `connection()`, `revalidatePath`, `revalidateTag`)
- Always use Next.js `Image` component with Supabase Storage
- Use dynamic imports for large libraries (`@react-three/fiber`, `@pixi/react`, Three.js, Pixi.js)
- Fetch data in Server Components when possible, use `Promise.all` for parallel fetching
- Fetch only necessary fields with Prisma `select`, use `include` to avoid N+1 queries
- **Turbopack**: Next.js 16 uses Turbopack by default (2-5× faster builds). This project uses Turbopack only. Webpack is not used.

**For detailed optimization strategies**: See `[docs/architecture/CACHING.md](docs/architecture/CACHING.md)` and `[docs/guides/coding-standards.md](docs/guides/coding-standards.md)`

## Authentication & authorization

- **Better Auth**: Email/Password, Google OAuth (as needed)
- **Session strategy**: Cookie-based (scrypt password hashing)
- **Prisma Adapter**: Use `better-auth/adapters/prisma` (check compatibility with Prisma 7.2.0)
- **Roles**: `admin`, `user`
- **Protection**: Next.js Middleware for routes, permission checks in Server Actions
- **Supabase RLS**: Database-level security
- **Bot protection**: Cloudflare Turnstile integrated for login form (see `[docs/security/protection.md](docs/security/protection.md)`)

## Deployment

- **Google Cloud Run**: Bun 1.3.5 runtime (via Docker container), multi-stage Dockerfile, Artifact Registry, Secret Manager
  - **Note**: Bun has Node.js compatibility, so Prisma works perfectly with Bun runtime
- **Supabase**: PostgreSQL database, Storage, Realtime, Edge Functions
- **CI/CD**: GitHub Actions or Cloud Build, automatic Prisma migrations
- **Environment variables**: `.env.local` (dev), Google Secret Manager (prod)

## Agent Skills

This project includes Cursor Agent Skills that provide domain-specific guidance for common development tasks. Skills are automatically applied by the agent based on context.

**Available Skills**:

- **Next.js 16 App Router**: Server Components, Server Actions, caching strategies
- **Prisma 7**: Query optimization, transactions, best practices
- **Better Auth**: Authentication, authorization, cookie sessions
- **Bun Runtime**: Development, build, testing, deployment
- **TypeScript Strict Mode**: Type safety, explicit annotations

**Enabling Skills**:

1. Open **Cursor Settings → Rules**
2. Find the **Import Settings** section
3. Toggle **Agent Skills** on

See `[.cursor/skills/README.md](.cursor/skills/README.md)` for detailed information about each skill.

## Additional documentation

For detailed information, see `[docs/README.md](docs/README.md)` for the documentation index.

Key documents:

- **Documentation index**: `[docs/README.md](docs/README.md)`
- **Requirements**: `[docs/requirements/README.md](docs/requirements/README.md)`
- **Architecture**: `[docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)`
- **Database design**: `[docs/architecture/DATABASE_DESIGN.md](docs/architecture/DATABASE_DESIGN.md)`
- **Security**: `[docs/security/README.md](docs/security/README.md)`
- **Coding standards**: `[docs/guides/coding-standards.md](docs/guides/coding-standards.md)`
- **Caching strategy**: `[docs/architecture/CACHING.md](docs/architecture/CACHING.md)`

## Documentation and external resources

**Context7 MCP**: Always use Context7 MCP when library/API documentation, code generation, setup or configuration steps are needed without explicit user request. Context7 provides up-to-date, version-specific documentation and code examples directly from source libraries.

- **Automatic usage**: The agent should automatically invoke Context7 MCP for:
  - Library/API documentation queries
  - Code generation requiring library-specific patterns
  - Setup or configuration steps
  - Version-specific implementation guidance
- **Library ID format**: When a specific library is known, use the Context7 library ID format (e.g., `/vercel/next.js`, `/supabase/supabase`) for direct access
- **Version specification**: Mention specific versions in queries to get version-appropriate documentation

**Reference resources**:

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Context7 MCP](https://github.com/upstash/context7) - Up-to-date code documentation for LLMs
- [AGENTS.md Format](https://agents.md/)
- [Cursor Agent Skills Documentation](https://cursor.com/docs/context/skills)

