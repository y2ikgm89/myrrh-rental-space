# AGENTS.md

> **Priority: High** - Before starting any task, the agent must check and follow user rules configured in Cursor Settings → Rules. User rules take precedence and contain important guidelines about communication language, documentation standards, development practices, and project-specific requirements (e.g., date verification, external information retrieval, AI usage guidelines).
>
> **Note**: This document follows the [AGENTS.md format](https://agents.md/), an open format for guiding coding agents. AGENTS.md serves as a "README for agents"—a dedicated place for build steps, tests, conventions, and project-specific guidance. **This document must be written and maintained in English** to align with the official format, though general communication with AI agents may be in Japanese.

## Project overview

A reservation and management system for rental spaces. Provides a highly designed public-facing website and a practical admin interface.

## Implementation Philosophy

**Clean Implementation Without Backward Compatibility**: This project prioritizes clean, modern implementations following the latest official best practices. We do **not** maintain backward compatibility with older versions or deprecated APIs. All implementations should use the latest stable versions of frameworks and libraries, following their official recommendations without legacy workarounds.

**Key Principles**:
- Use the latest stable versions of Next.js 16, React 19, Prisma 7, Auth.js 5, and other dependencies
- Follow official best practices and recommended patterns (no deprecated APIs)
- Prefer modern patterns (Server Components, Server Actions, JWT sessions) over legacy approaches
- Remove deprecated code patterns and replace them with modern alternatives
- No polyfills or compatibility layers unless absolutely necessary for production stability

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

**For detailed testing requirements**: See [`docs/TEST_REQUIREMENTS.md`](docs/TEST_REQUIREMENTS.md)

## Dev environment tips

- Project structure: Use `src/app/` for App Router, `src/components/` for components, `src/actions/` for Server Actions, `src/types/` or module-level for type definitions, `src/lib/` for utilities (see `docs/PROJECT_STRUCTURE.md` for details)
- Prisma: Create migration after schema changes with `bunx prisma migrate dev --name <migration_name>`, deploy with `bunx prisma migrate deploy`, view DB with `bunx prisma studio`
- Environment variables: Use `.env.local` for development (don't commit), Google Secret Manager for production, see `.env.example` for required variables
- Debugging: Server Components log to server console, Client Components use browser dev tools, enable Prisma query logs with `DEBUG=prisma:*`
- Performance: Use Next.js `Image` component, lazy-load large libraries with `dynamic`, use appropriate cache strategies in Server Components
- **Dependency management (Bun)**: Check outdated packages with `bun outdated`, get package info with `bun info <package>`, check upgrade impact with `bun add <package>@latest --dry-run`, use `bunx npm-check-updates` for major version updates, verify installed versions with `bun pm ls`. **Important**: Bun prioritizes lockfile (`bun.lockb`), use `bun install --frozen-lockfile` in CI/Cloud Run, `latest` may not always be appropriate (Next.js/Prisma/React have breaking changes)

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

## Technical stack

- **React**: 19.2.3, **Next.js**: 16.1.1, **TypeScript**: 5.9.3, **Bun**: 1.3.5
- **Prisma**: 7.2.0, **Supabase**: PostgreSQL, **Zod**: 4.3.5
- **Tailwind CSS**: 4.1.18, **GSAP** or **Motion** (formerly Framer Motion), **Three.js** (`@react-three/fiber` + `@react-three/drei`) or **Pixi.js** (`@pixi/react`)
- **Auth.js**: 5.0.0-beta.30, **nuqs**: 2.8.5
- **Deployment**: Google Cloud Run (Bun runtime), Supabase

**For detailed version information**: See [`docs/TECH_STACK_VERSIONS.md`](docs/TECH_STACK_VERSIONS.md)

## Important technical constraints

- **Prisma does not support Edge Runtime**: Use Bun Runtime (`runtime = "nodejs"`) for API Routes and Server Actions
- **Full Bun Runtime Support**: This project runs fully on Bun 1.3.5 (package manager, runtime, build tool, test runner)
- **Auth.js 5**: Use `@auth/prisma-adapter` 2.11.1, verify compatibility before version updates
- **Security**: React 19.2.3 and Next.js 16.1.1 required (CVE-2025-55182 fix). Always validate inputs with Zod schemas (client and server)

**For detailed constraints**: See [`docs/BUN_RUNTIME.md`](docs/BUN_RUNTIME.md) and [`docs/SECURITY.md`](docs/SECURITY.md)

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
- Caching security: Never cache sensitive data, use `unstable_noStore()` for authenticated data

**For detailed security configuration**: See [`docs/SECURITY.md`](docs/SECURITY.md) and [`docs/TURNSTILE_REQUIREMENTS.md`](docs/TURNSTILE_REQUIREMENTS.md)

## Performance optimization

- Use Server Components by default (reduces client-side JavaScript)
- Leverage Next.js 16 Cache API (`unstable_cache`, `unstable_noStore`, `revalidatePath`, `revalidateTag`)
- Always use Next.js `Image` component with Supabase Storage
- Use dynamic imports for large libraries (`@react-three/fiber`, `@pixi/react`, Three.js, Pixi.js)
- Fetch data in Server Components when possible, use `Promise.all` for parallel fetching
- Fetch only necessary fields with Prisma `select`, use `include` to avoid N+1 queries
- **Turbopack**: Next.js 16 uses Turbopack by default (2-5× faster builds). This project uses Turbopack only. Webpack is not used.

**For detailed optimization strategies**: See [`docs/CACHING_STRATEGY.md`](docs/CACHING_STRATEGY.md) and [`docs/BEST_PRACTICES.md`](docs/BEST_PRACTICES.md)

## Authentication & authorization

- **Auth.js 5**: Email/Password, Google OAuth (as needed)
- **Session strategy**: JWT (recommended) or Database
- **Prisma Adapter**: Use `@auth/prisma-adapter` (check compatibility with Prisma 7.2.0)
- **Roles**: `admin`, `user`
- **Protection**: Next.js Middleware for routes, permission checks in Server Actions
- **Supabase RLS**: Database-level security
- **Bot protection**: Cloudflare Turnstile integrated for login form (see [`docs/TURNSTILE_REQUIREMENTS.md`](docs/TURNSTILE_REQUIREMENTS.md))

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
- **Auth.js 5**: Authentication, authorization, JWT sessions
- **Bun Runtime**: Development, build, testing, deployment
- **TypeScript Strict Mode**: Type safety, explicit annotations

**Enabling Skills**:
1. Open **Cursor Settings → Rules**
2. Find the **Import Settings** section
3. Toggle **Agent Skills** on

See [`.cursor/skills/README.md`](.cursor/skills/README.md) for detailed information about each skill.

## Additional documentation

For detailed information, see [`docs/README.md`](docs/README.md) for the documentation index.

Key documents:
- **Documentation index**: [`docs/README.md`](docs/README.md)
- **Feature requirements**: [`docs/FEATURE_REQUIREMENTS.md`](docs/FEATURE_REQUIREMENTS.md)
- **Architecture**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Database design**: [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md)
- **API specification**: [`docs/API.md`](docs/API.md)
- **Security policy**: [`docs/SECURITY.md`](docs/SECURITY.md)
- **Best practices**: [`docs/BEST_PRACTICES.md`](docs/BEST_PRACTICES.md)
- **Caching strategy**: [`docs/CACHING_STRATEGY.md`](docs/CACHING_STRATEGY.md)

## Reference resources

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Auth.js Documentation](https://authjs.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [AGENTS.md Format](https://agents.md/)
- [Cursor Agent Skills Documentation](https://cursor.com/docs/context/skills)
