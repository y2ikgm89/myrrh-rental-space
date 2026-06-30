import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const MIGRATION = join(
  ROOT,
  "prisma",
  "migrations",
  "20260630000000_sidebar_widgets_canonical_array",
  "migration.sql",
);

const CANONICAL_DEFAULT =
  '[{\\"type\\":\\"search\\",\\"enabled\\":true},{\\"type\\":\\"recent\\",\\"enabled\\":true,\\"layout\\":\\"compact\\"},{\\"type\\":\\"popular\\",\\"enabled\\":true,\\"layout\\":\\"compact\\",\\"showRanking\\":true},{\\"type\\":\\"categories\\",\\"enabled\\":true},{\\"type\\":\\"tags\\",\\"enabled\\":true}]';

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("sidebar DB invariants", () => {
  test("Prisma schema stores sidebarWidgets with the canonical array default", () => {
    const schema = read(SCHEMA);

    expect(schema).toContain(
      `sidebarWidgets      Json    @default("${CANONICAL_DEFAULT}")`,
    );
    expect(schema).not.toContain(
      '@default("{\\"search\\":true,\\"recent\\":true,\\"popular\\":true,\\"categories\\":true,\\"tags\\":true}")',
    );
  });

  test("migration converts object rows once and enforces array shape", () => {
    const migration = read(MIGRATION);

    expect(migration).toContain(
      `ALTER COLUMN "sidebarWidgets" SET DEFAULT '[{"type":"search","enabled":true}`,
    );
    expect(migration).toContain('UPDATE "settings"');
    expect(migration).toContain('ALTER TABLE "settings"');
    expect(migration).not.toContain('"Settings"');
    expect(migration).toContain(
      "WHERE jsonb_typeof(\"sidebarWidgets\") = 'object'",
    );
    expect(migration).toContain(
      'CONSTRAINT "Settings_sidebarWidgets_array_check"',
    );
    expect(migration).toContain(
      "CHECK (jsonb_typeof(\"sidebarWidgets\") = 'array')",
    );
  });
});
