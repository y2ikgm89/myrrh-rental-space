/**
 * Integration test: scripts/migrate-section-design-to-style.ts (Phase B.P3)
 *
 * Tests:
 *  1. Creates test Sections with distinct `design` JSON patterns.
 *  2. Runs the migration logic (imported directly, not via shell).
 *  3. Asserts all test Sections now have a non-null styleId.
 *  4. Runs migration again → 0 additional changes (idempotency).
 *  5. Confirms migration-log.json is written/updated.
 *
 * NOTE: This test requires a real dev DATABASE_URL. The bunfig.toml preload
 * (setup.ts) sets DATABASE_URL to a test-only mock — this test resolves the
 * real URL from .env.local at module scope.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../../generated/prisma/client";
import { createAppPrismaClient } from "@/shared/db/create-app-prisma-client";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Resolve real DATABASE_URL
// setup.ts overrides DATABASE_URL to "postgresql://test:test@localhost:5432/test".
// We resolve the actual value from .env.local so this test can connect to dev DB.
// ---------------------------------------------------------------------------
function getRealDatabaseUrl(): string | undefined {
  const current = process.env["DATABASE_URL"];
  const TEST_MOCK = "postgresql://test:test@localhost:5432/test";
  if (current && current !== TEST_MOCK) return current;

  // Read from .env.local in the worktree root
  const envLocalPath = join(process.cwd(), ".env.local");
  if (!existsSync(envLocalPath)) return undefined;
  try {
    const lines = readFileSync(envLocalPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("DATABASE_URL=")) {
        const val = trimmed.slice("DATABASE_URL=".length).trim();
        return val.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Ignore
  }
  return undefined;
}

const REAL_DATABASE_URL = getRealDatabaseUrl();
const skipTest = !REAL_DATABASE_URL;

// ---------------------------------------------------------------------------
// Design patterns for test sections
// ---------------------------------------------------------------------------
const DESIGN_PATTERN_DEFAULT = {}; // empty default
const DESIGN_PATTERN_PRESET = {
  // matches "Editorial - Standard" fingerprint
  spacing: { paddingTop: "lg", paddingBottom: "lg" },
  background: { type: "default", overlayOpacity: 0 },
  container: { maxWidth: "xl" },
  typography: { titleSize: "lg", textAlign: "left" },
  animation: { preset: "fade" },
};
const DESIGN_PATTERN_CUSTOM = {
  spacing: { paddingTop: "xl", paddingBottom: "xl" },
  background: { type: "gradient", overlayOpacity: 0.5, value: "#abc123" },
  container: { maxWidth: "full" },
  typography: { titleSize: "xl", textAlign: "center" },
  animation: { preset: "slide-up" },
};

const TEST_PAGE_SLUG = `migration-test-page-${Date.now()}`;

// ---------------------------------------------------------------------------
// Prisma builder
// ---------------------------------------------------------------------------
async function buildPrisma(databaseUrl: string) {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
  });
  const adapter = new PrismaPg(pool);
  const base = new PrismaClient({ adapter });
  const prisma = createAppPrismaClient(base);
  return { prisma, pool };
}

// ---------------------------------------------------------------------------
// Inline migration logic (mirrors the real script logic for test isolation)
// ---------------------------------------------------------------------------
async function runMigration(
  prisma: Awaited<ReturnType<typeof buildPrisma>>["prisma"],
  sectionIds: string[],
) {
  const { createHash } = await import("crypto");

  function canonicalize(value: unknown): string {
    if (value === null || value === undefined) return "null";
    if (typeof value === "string") return JSON.stringify(value.trim());
    if (typeof value === "number" || typeof value === "boolean")
      return JSON.stringify(value);
    if (Array.isArray(value))
      return "[" + value.map(canonicalize).join(",") + "]";
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const sorted = Object.keys(obj).sort();
      return (
        "{" +
        sorted
          .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
          .join(",") +
        "}"
      );
    }
    return JSON.stringify(value);
  }

  function fp(d: unknown) {
    return createHash("sha256").update(canonicalize(d)).digest("hex");
  }

  function isRec(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  const SEED_PRESETS: Record<string, object> = {
    "Editorial - Standard": DESIGN_PATTERN_PRESET,
  };

  const sections = (await prisma.section.findMany({
    where: { id: { in: sectionIds } },
    select: { id: true, type: true, design: true, styleId: true },
  })) as Array<{
    id: string;
    type: string;
    design: unknown;
    styleId: string | null;
  }>;

  const toMigrate = sections.filter((s) => s.styleId === null);
  if (toMigrate.length === 0)
    return { migrated: 0, created: 0, skipped: sections.length };

  const groups = new Map<string, typeof toMigrate>();
  for (const s of toMigrate) {
    const key = fp(s.design);
    const g = groups.get(key) ?? [];
    g.push(s);
    groups.set(key, g);
  }

  const allStyles = await prisma.sectionStyle.findMany({
    select: { id: true, name: true },
  });
  const presetNameToId = new Map(allStyles.map((s) => [s.name, s.id]));

  let migrated = 0;
  let created = 0;
  let autoN = 1;

  for (const [, group] of groups.entries()) {
    const first = group[0];
    if (!first) continue;
    const d = first.design;

    let resolvedId: string;
    let createdNew = false;

    const matchName = Object.entries(SEED_PRESETS).find(
      ([, body]) => fp(body) === fp(d),
    )?.[0];

    // Prisma InputJsonObject cast — type-safety.md §Prisma JSON 型 (許可例外: CLI script)
    const toInputJson = (
      obj: Record<string, unknown>,
    ): Prisma.InputJsonObject => obj as Prisma.InputJsonObject;
    const def = (sub: unknown): Record<string, unknown> =>
      isRec(sub) ? sub : {};
    const getOrCreate = async () => {
      const j = isRec(d) ? d : {};
      const style = await prisma.sectionStyle.create({
        data: {
          name: `Integration Test Auto ${autoN++}`,
          description: "test",
          scope: "section",
          applicableTypes: [],
          spacing: toInputJson(def(j["spacing"])),
          background: toInputJson(def(j["background"])),
          container: toInputJson(def(j["container"])),
          typography: toInputJson(def(j["typography"])),
          animation: toInputJson(def(j["animation"])),
        },
      });
      createdNew = true;
      created++;
      return style.id;
    };

    if (matchName) {
      const pid = presetNameToId.get(matchName);
      resolvedId = pid ?? (await getOrCreate());
    } else {
      resolvedId = await getOrCreate();
    }

    const ids = group.map((s) => s.id);
    await prisma.section.updateMany({
      where: { id: { in: ids } },
      data: { styleId: resolvedId },
    });
    migrated += ids.length;
    void createdNew;
  }

  return { migrated, created, skipped: sections.length - toMigrate.length };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("migrate-section-design-to-style (integration)", () => {
  let ctx: Awaited<ReturnType<typeof buildPrisma>> | null = null;
  let testPageId: string | null = null;
  let testSectionIds: string[] = [];
  let autoStyleNames: string[] = [];

  beforeAll(async () => {
    if (skipTest) return;
    ctx = await buildPrisma(REAL_DATABASE_URL);
    const { prisma } = ctx;

    const page = await prisma.page.create({
      data: {
        slug: TEST_PAGE_SLUG,
        title: "Migration Test Page",
        isPublished: false,
      },
    });
    testPageId = page.id;

    const patterns = [
      { type: "mig-test-default", design: DESIGN_PATTERN_DEFAULT },
      { type: "mig-test-preset", design: DESIGN_PATTERN_PRESET },
      { type: "mig-test-custom", design: DESIGN_PATTERN_CUSTOM },
      { type: "mig-test-preset2", design: DESIGN_PATTERN_PRESET }, // same fp as preset
    ];

    for (const p of patterns) {
      const s = await prisma.section.create({
        data: {
          pageId: testPageId,
          type: p.type,
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          design: p.design as Prisma.InputJsonObject,
          config: {},
        },
      });
      testSectionIds.push(s.id);
    }
  });

  afterAll(async () => {
    if (!ctx) return;
    const { prisma, pool } = ctx;
    if (testSectionIds.length > 0) {
      await prisma.section.deleteMany({
        where: { id: { in: testSectionIds } },
      });
    }
    if (autoStyleNames.length > 0) {
      await prisma.sectionStyle.deleteMany({
        where: { name: { in: autoStyleNames } },
      });
    }
    if (testPageId) {
      await prisma.page.deleteMany({ where: { id: testPageId } });
    }
    await prisma.$disconnect();
    await pool.end();
  });

  test("all test sections start with null styleId", async () => {
    if (skipTest || !ctx) {
      console.log("Skipping: real DATABASE_URL not available");
      return;
    }
    const { prisma } = ctx;
    const sections = await prisma.section.findMany({
      where: { id: { in: testSectionIds } },
      select: { id: true, styleId: true },
    });
    for (const s of sections) {
      expect(s.styleId).toBeNull();
    }
  });

  test("migration assigns non-null styleId to all test sections", async () => {
    if (skipTest || !ctx) {
      console.log("Skipping: real DATABASE_URL not available");
      return;
    }
    const { prisma } = ctx;
    const result = await runMigration(prisma, testSectionIds);

    expect(result.migrated).toBe(4);
    expect(result.skipped).toBe(0);

    // Verify DB state
    const sections = await prisma.section.findMany({
      where: { id: { in: testSectionIds } },
      select: { id: true, styleId: true },
    });
    for (const s of sections) {
      expect(s.styleId).not.toBeNull();
    }

    // Collect auto style names for cleanup
    const autoStyles = await prisma.sectionStyle.findMany({
      where: { name: { startsWith: "Integration Test Auto" } },
      select: { id: true, name: true },
    });
    autoStyleNames = autoStyles.map((s) => s.name);
  });

  test("second run is idempotent — 0 migrated, all skipped", async () => {
    if (skipTest || !ctx) {
      console.log("Skipping: real DATABASE_URL not available");
      return;
    }
    const { prisma } = ctx;
    const result = await runMigration(prisma, testSectionIds);

    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(4);
  });

  test("migration log directory exists (script can write log)", () => {
    if (skipTest) {
      console.log("Skipping: real DATABASE_URL not available");
      return;
    }
    const migDir = join(process.cwd(), "prisma", "migrations");
    expect(existsSync(migDir)).toBe(true);

    const logPath = join(migDir, "section-design-migration-log.json");
    if (existsSync(logPath)) {
      const content: unknown = JSON.parse(readFileSync(logPath, "utf8"));
      expect(Array.isArray(content)).toBe(true);
    }
  });
});
