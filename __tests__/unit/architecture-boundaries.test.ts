import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");
const SHARED_DB_ROOT = join(SRC_ROOT, "shared", "db");
const ENUMS_GATEWAY_ROOT = join(
  SRC_ROOT,
  "shared",
  "lib",
  "validations",
  "enums",
);
const SHARED_DOMAIN_ROOT = join(SRC_ROOT, "shared", "domain");
const APP_ROUTE_ROOT = join(SRC_ROOT, "app");
const API_CRON_ROUTE_ROOT = join(SRC_ROOT, "app", "api", "cron");
const API_WEBHOOK_ROUTE_ROOT = join(SRC_ROOT, "app", "api", "webhooks");
const PUBLIC_APP_ROOT = join(SRC_ROOT, "app", "(public)");
const PUBLIC_LAYOUT_FILE = join(PUBLIC_APP_ROOT, "layout.tsx");
const PACKAGE_JSON_FILE = join(ROOT, "package.json");
const CLOUDBUILD_FILE = join(ROOT, "cloudbuild.yaml");
const README_FILE = join(ROOT, "README.md");
const DOCS_README_FILE = join(ROOT, "docs", "README.md");
const GUIDES_README_FILE = join(ROOT, "docs", "guides", "README.md");
const ARCHITECTURE_README_FILE = join(
  ROOT,
  "docs",
  "architecture",
  "README.md",
);
const AUTH_ROUTE_FILE = join(
  SRC_ROOT,
  "app",
  "api",
  "auth",
  "[...all]",
  "route.ts",
);
const CALENDAR_SYNC_CRON_ROUTE_FILE = join(
  SRC_ROOT,
  "app",
  "api",
  "cron",
  "calendar-sync",
  "route.ts",
);
const INSTAGRAM_REFRESH_CRON_ROUTE_FILE = join(
  SRC_ROOT,
  "app",
  "api",
  "cron",
  "instagram-refresh",
  "route.ts",
);
const GOOGLE_CALENDAR_WEBHOOK_ROUTE_FILE = join(
  SRC_ROOT,
  "app",
  "api",
  "webhooks",
  "google-calendar",
  "route.ts",
);
const GOOGLE_SERVICE_ACCOUNT_BOUNDARY_FILES = [
  join(SRC_ROOT, "shared", "domain", "settings", "commands.ts"),
  join(SRC_ROOT, "shared", "lib", "analytics", "ga-data-api.ts"),
  join(SRC_ROOT, "shared", "lib", "google-calendar", "service-account.ts"),
];
const THIN_ADMIN_ACTION_FILES = [
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "navigation.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "api-keys",
    "queries.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "api-keys",
    "mutations.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "announcement-bar.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "audit-log.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "dashboard.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "block-template.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "coupon.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "faq.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "customer.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "inquiry.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "location.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "instagram.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "post-comment.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "news.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "post",
    "queries.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "post",
    "mutations.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "staff-invitation.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "space-category.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "terms",
    "queries.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "terms",
    "mutations.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "ical-tokens.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "basic.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "business.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "email.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "other.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "discount.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "tax.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "robots-txt.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "google-calendar.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "stripe.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "user.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "editor-comment.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "media.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "page.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "page-section.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "space.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "reservation",
    "queries.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "reservation",
    "mutations.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "reservation",
    "admin.ts",
  ),
];
const SERVER_ONLY_QUERY_FILES = [
  join(SRC_ROOT, "shared", "db", "prisma.ts"),
  join(SRC_ROOT, "shared", "db", "better-auth-adapter.ts"),
  join(SRC_ROOT, "shared", "domain", "settings", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "settings", "admin-queries.ts"),
  join(SRC_ROOT, "shared", "domain", "settings", "api-key-queries.ts"),
  join(SRC_ROOT, "shared", "domain", "settings", "api-key-commands.ts"),
  join(SRC_ROOT, "shared", "domain", "settings", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "settings", "announcement-bar.ts"),
  join(SRC_ROOT, "shared", "domain", "audit-log", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "audit-log", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "admin-login-tokens", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "admin-login-tokens", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "auth", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "auth", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "dashboard", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "block-template", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "block-template", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "coupons", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "coupons", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "faq", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "faq", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "customers", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "customers", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "inquiries", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "inquiries", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "instagram", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "instagram", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "locations", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "locations", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "navigation", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "pages", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "pages", "admin-queries.ts"),
  join(SRC_ROOT, "shared", "domain", "pages", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "pages", "system-pages.ts"),
  join(SRC_ROOT, "shared", "domain", "permissions", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "permissions", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "sections", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "sections", "admin-queries.ts"),
  join(SRC_ROOT, "shared", "domain", "sections", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "post-comments", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "post-comments", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "posts", "admin-queries.ts"),
  join(SRC_ROOT, "shared", "domain", "posts", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "posts", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "news", "admin-queries.ts"),
  join(SRC_ROOT, "shared", "domain", "news", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "news", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "terms", "admin-queries.ts"),
  join(SRC_ROOT, "shared", "domain", "terms", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "terms", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "staff-invitations", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "staff-invitations", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "space-categories", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "space-categories", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "spaces", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "spaces", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "media", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "media", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "editor-comments", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "editor-comments", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "reservations", "admin-queries.ts"),
  join(SRC_ROOT, "shared", "domain", "reservations", "availability.ts"),
  join(SRC_ROOT, "shared", "domain", "reservations", "calendar-sync.ts"),
  join(SRC_ROOT, "shared", "domain", "reservations", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "ical", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "ical", "commands.ts"),
  join(SRC_ROOT, "shared", "domain", "sitemap", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "slugs", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "system", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "user-page-assignments", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "users", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "users", "commands.ts"),
  join(SRC_ROOT, "shared", "lib", "google-calendar", "settings.ts"),
  join(SRC_ROOT, "shared", "lib", "google-calendar", "webhook.ts"),
];

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectNonCommentOffenders(
  files: string[],
  pattern: RegExp,
): string[] {
  return files
    .filter((file) => {
      const lines = readFileSync(file, "utf8").split(/\r?\n/u);
      return lines.some((line) => {
        const trimmed = line.trim();
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*")
        ) {
          return false;
        }
        return pattern.test(line);
      });
    })
    .map((file) => relative(ROOT, file));
}

describe("architecture boundaries", () => {
  test("proxy.ts は Prisma を直接 import しない", () => {
    const source = readFileSync(join(SRC_ROOT, "proxy.ts"), "utf8");

    expect(source).not.toContain("@/shared/db/prisma");
    expect(source).not.toContain("@/shared/lib/prisma");
    expect(source).not.toContain("@generated/prisma");
  });

  test("generated Prisma import は shared/db の外に残さない", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = sourceFiles
      .filter((file) => !file.startsWith(SHARED_DB_ROOT))
      .filter((file) => !file.startsWith(ENUMS_GATEWAY_ROOT))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          source.includes("@generated/prisma") ||
          source.includes("shared/generated/prisma")
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("legacy prisma shim import は残さない", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = sourceFiles
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes('from "@/shared/lib/prisma"');
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("public app layer は prisma facade を直接 import しない", () => {
    const sourceFiles = collectSourceFiles(PUBLIC_APP_ROOT);
    const offenders = sourceFiles
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          source.includes('from "@/shared/db/prisma"') ||
          source.includes('from "@/shared/lib/prisma"')
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("app layer は generated Prisma model/client type を直接 import しない", () => {
    const appRoot = join(SRC_ROOT, "app");
    const sourceFiles = collectSourceFiles(appRoot);
    const offenders = sourceFiles
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          source.includes("@/shared/db/models") ||
          source.includes("@/shared/db/client")
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("shared/ の外に Prisma 直 import を残さない", () => {
    const SHARED_ROOT = join(SRC_ROOT, "shared");
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = sourceFiles
      .filter((file) => !file.startsWith(SHARED_ROOT))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes('from "@/shared/db/prisma"');
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("shared/db barrel は shared/db の外から import しない", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = sourceFiles
      .filter((file) => !file.startsWith(SHARED_DB_ROOT))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes('from "@/shared/db"');
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("legacy db shim files を再導入しない", () => {
    expect(existsSync(join(SRC_ROOT, "shared", "db", "index.ts"))).toBe(false);
    expect(existsSync(join(SRC_ROOT, "shared", "db", "client.ts"))).toBe(false);
    expect(
      existsSync(join(SRC_ROOT, "shared", "db", "models", "Page.ts")),
    ).toBe(false);
  });

  test("server-side query modules は server-only を明示する", () => {
    const offenders = SERVER_ONLY_QUERY_FILES.filter(existsSync)
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return !/import\s+["']server-only["'];?/.test(source);
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("移行済み admin action は Prisma を直接 import しない", () => {
    const offenders = THIN_ADMIN_ACTION_FILES.filter(existsSync)
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          source.includes("@/shared/db/prisma") ||
          source.includes('from "@/shared/db"') ||
          source.includes("@generated/prisma")
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("public root layout に NuqsAdapter が配置されている", () => {
    const source = readFileSync(PUBLIC_LAYOUT_FILE, "utf8");

    expect(source).toContain("NuqsAdapter");
  });

  test("Better Auth は静的 adminAuth export を使い、動的 getAuth を再導入しない", () => {
    const source = readFileSync(
      join(SRC_ROOT, "shared", "lib", "admin-auth.ts"),
      "utf8",
    );

    expect(source).toContain("export const adminAuth = createAdminAuth();");
    expect(source).not.toContain("export async function getAuth");
    expect(source).not.toContain("resetAuthInstance");
  });

  test("Google OAuth の DB 管理 helper を再導入しない", () => {
    expect(
      existsSync(
        join(
          SRC_ROOT,
          "shared",
          "lib",
          "auth-config",
          "google-oauth-credentials.ts",
        ),
      ),
    ).toBe(false);
  });

  test("type-check は clean checkout 前提で増分 build state に依存しない", () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_FILE, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["type-check"]).toContain(
      "--incremental false",
    );
    expect(packageJson.scripts?.["type-check"]).toContain(
      "bun run db:generate",
    );
    expect(packageJson.scripts?.["build"]).toContain("bun run db:generate");
    expect(packageJson.scripts?.["test"]).toContain("bun run db:generate");
  });

  test("Cloud Run deploy は Server Actions encryption key を runtime にも注入する", () => {
    const source = readFileSync(CLOUDBUILD_FILE, "utf8");

    expect(source).toContain(
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:${_NEXT_SERVER_ACTIONS_ENCRYPTION_KEY_SECRET_VERSION}",
    );
  });

  test("Better Auth の canonical route handler を app/api/auth/[...all] に固定する", () => {
    expect(existsSync(AUTH_ROUTE_FILE)).toBe(true);

    const source = readFileSync(AUTH_ROUTE_FILE, "utf8");
    expect(source).toContain(
      'import { adminAuth } from "@/shared/lib/admin-auth"',
    );
    expect(source).toContain("toNextJsHandler(adminAuth)");
  });

  test("cache tag invalidation は CACHE_TAGS / getCacheTag を経由し、タグ文字列を直書きしない", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT).filter(
      (file) => !file.endsWith(join("shared", "lib", "constants", "cache.ts")),
    );
    const offenders = collectNonCommentOffenders(
      sourceFiles,
      /\b(?:cacheTag|updateTag|revalidateTag)\(\s*["'][^"']+["']/u,
    );

    expect(offenders).toEqual([]);
  });

  test("cron route は shared helper 経由で認証する", () => {
    for (const file of [
      CALENDAR_SYNC_CRON_ROUTE_FILE,
      INSTAGRAM_REFRESH_CRON_ROUTE_FILE,
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("authorizeCronRequest");
    }
  });

  test("Google Calendar webhook route は Zod schema でヘッダーを検証する", () => {
    const source = readFileSync(GOOGLE_CALENDAR_WEBHOOK_ROUTE_FILE, "utf8");

    expect(source).toContain("googleCalendarWebhookHeadersSchema");
    expect(source).toContain(".safeParse(");
  });

  test("サービスアカウント JSON は shared validation helper 経由で検証する", () => {
    const offenders = collectNonCommentOffenders(
      GOOGLE_SERVICE_ACCOUNT_BOUNDARY_FILES,
      /JSON\.parse\(/u,
    );

    expect(offenders).toEqual([]);
  });

  test("route handler は legacy success wrapper を返さない", () => {
    const routeFiles = collectSourceFiles(APP_ROUTE_ROOT).filter((file) =>
      file.endsWith(join("route.ts")),
    );
    const offenders = routeFiles
      .filter((file) => readFileSync(file, "utf8").includes("createSuccess("))
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("admin route handler は success boolean payload と fieldErrors を返さない", () => {
    const adminRouteRoot = join(SRC_ROOT, "app", "(admin)", "admin", "api");
    const routeFiles = collectSourceFiles(adminRouteRoot).filter((file) =>
      file.endsWith(join("route.ts")),
    );
    const offenders = collectNonCommentOffenders(
      routeFiles,
      /\bsuccess\s*:\s*(?:true|false)\b|\bfieldErrors\b/u,
    );

    expect(offenders).toEqual([]);
  });

  test("cron / webhook route handler は legacy success boolean payload を返さない", () => {
    const routeFiles = [
      ...collectSourceFiles(API_CRON_ROUTE_ROOT),
      ...collectSourceFiles(API_WEBHOOK_ROUTE_ROOT),
    ].filter((file) => file.endsWith(join("route.ts")));
    const offenders = routeFiles
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /return\s+NextResponse\.json\(\s*\{\s*success\s*:\s*(?:true|false)\b/u.test(
          source,
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("route handler は request.json の parse error を catch(null) で握りつぶさない", () => {
    const routeFiles = collectSourceFiles(APP_ROUTE_ROOT).filter((file) =>
      file.endsWith(join("route.ts")),
    );
    const offenders = collectNonCommentOffenders(
      routeFiles,
      /request\.json\(\)\.catch\(\(\)\s*=>\s*null\)/u,
    );

    expect(offenders).toEqual([]);
  });

  test("admin app は JSON.parse(JSON.stringify(...)) による型逃がしを再導入しない", () => {
    const adminAppRoot = join(SRC_ROOT, "app", "(admin)");
    const offenders = collectNonCommentOffenders(
      collectSourceFiles(adminAppRoot),
      /JSON\.parse\(\s*JSON\.stringify\(/u,
    );

    expect(offenders).toEqual([]);
  });

  test("announcement-bar mutation action は legacy success wrapper を使わない", () => {
    const source = readFileSync(
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "announcement-bar.ts",
      ),
      "utf8",
    );

    expect(source).not.toContain("createSuccess(");
    expect(source).toContain("executeAdminMutationResult(");
  });

  test("settings basic/business/other mutation action は legacy success wrapper を使わない", () => {
    const files = [
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "basic.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "business.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "other.ts",
      ),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("createSuccess(");
      expect(source).not.toContain("type ActionResult");
      expect(source).not.toContain("executeAdminMutation(");
      expect(source).toContain("executeAdminMutationResult(");
    }
  });

  test("navigation mutation action は legacy success wrapper を使わない", () => {
    const files = [
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "navigation.ts",
      ),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("createSuccess(");
      expect(source).not.toContain("type ActionResult");
      expect(source).not.toContain("executeAdminMutation(");
      expect(source).toContain("executeAdminMutationResult(");
    }
  });

  test("external integration mutation action は legacy success wrapper を使わない", () => {
    const files = [
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "api-keys",
        "index.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "google-calendar.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "stripe.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "instagram.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "email.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "discount.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "tax.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "robots-txt.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "ical-tokens.ts",
      ),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("createSuccess(");
      expect(source).not.toContain("type ActionResult");
      expect(source).not.toContain("executeAdminMutation(");
      expect(source).toContain("executeAdminMutationResult(");
    }
  });

  test("post/news/terms/reservation/page/coupon/customer/faq/block-template mutation action は legacy success wrapper を使わない", () => {
    const files = [
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "post",
        "index.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "news.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "terms",
        "index.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "reservation",
        "admin.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "reservation",
        "mutations.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "page.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "coupon.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "customer.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "faq.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "block-template.ts",
      ),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("createSuccess(");
      expect(source).not.toContain("type ActionResult");
      expect(source).not.toContain("executeAdminMutation(");
      expect(source).toContain("executeAdminMutationResult(");
    }
  });

  test("README は旧トップレベル構成を案内しない", () => {
    const source = readFileSync(README_FILE, "utf8");

    expect(source).not.toContain("├── components/");
    expect(source).not.toContain("├── lib/");
    expect(source).not.toContain("├── actions/");
    expect(source).not.toContain("├── hooks/");
  });

  test("docs index は存在する architecture index を参照する", () => {
    expect(existsSync(ARCHITECTURE_README_FILE)).toBe(true);

    const docsIndex = readFileSync(DOCS_README_FILE, "utf8");
    expect(docsIndex).toContain("./architecture/README.md");
  });

  test("guides は generated Prisma import や旧 action helper を推奨しない", () => {
    const source = readFileSync(GUIDES_README_FILE, "utf8");

    expect(source).not.toContain("@/generated/prisma/client");
    expect(source).not.toContain("@/types/server-actions");
  });
});
