import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");
const SHARED_DB_ROOT = join(SRC_ROOT, "shared", "db");
const SHARED_DOMAIN_ROOT = join(SRC_ROOT, "shared", "domain");
const PUBLIC_APP_ROOT = join(SRC_ROOT, "app", "(public)");
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
    "homepage-settings.ts",
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
  join(SRC_ROOT, "shared", "domain", "users", "queries.ts"),
  join(SRC_ROOT, "shared", "domain", "users", "commands.ts"),
  join(SRC_ROOT, "shared", "lib", "admin-login-gate.ts"),
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

  test("shared/domain と shared/db の外に Prisma 直 import を残さない", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = sourceFiles
      .filter(
        (file) =>
          !file.startsWith(SHARED_DB_ROOT) && !file.startsWith(SHARED_DOMAIN_ROOT),
      )
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
    const offenders = SERVER_ONLY_QUERY_FILES.filter((file) => {
      const source = readFileSync(file, "utf8");
      return !/import\s+["']server-only["'];?/.test(source);
    }).map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("移行済み admin action は Prisma を直接 import しない", () => {
    const offenders = THIN_ADMIN_ACTION_FILES.filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        source.includes("@/shared/db/prisma") ||
        source.includes('from "@/shared/db"') ||
        source.includes("@generated/prisma")
      );
    }).map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
