# Public App Rules

- Public routes live under `src/app/(public)`.
- Avoid direct DB/Prisma imports from public UI layers; use domain/public query
  functions.
- Keep metadata, sitemap, manifest, icon, and layout paths safe from build-time
  placeholder env/DB baking.
- Public cache behavior must use explicit cache helpers and cache tags.
- Client components must avoid value-importing Zod-heavy or server-only modules.
