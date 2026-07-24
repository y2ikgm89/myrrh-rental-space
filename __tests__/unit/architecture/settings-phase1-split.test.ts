import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    if (/\.(?:ts|tsx)$/u.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

const phase1SettingsFieldPatterns = [
  /announcementBar\w+/u,
  /cookieConsent\w+/u,
  /\bmaintenanceMode\b/u,
  /\bmaintenanceMessage\b/u,
] as const;

/** Exact `model Settings {` block — not SettingsAnnouncementCarousel / SettingsSystem. */
function extractSettingsModelBlock(schema: string): string {
  const lines = schema.split("\n");
  const start = lines.findIndex((line) => line === "model Settings {");
  expect(start).toBeGreaterThanOrEqual(0);

  const end = lines.findIndex((line, index) => index > start && line === "}");
  expect(end).toBeGreaterThan(start);

  return lines.slice(start, end + 1).join("\n");
}

function findPrismaSettingsQueryOffenders(source: string): boolean {
  const queryBlocks = source.matchAll(
    /prisma\.settings\.(?:find\w+|upsert|update\w+|create)\(\{[\s\S]*?\}\)/gu,
  );

  for (const block of queryBlocks) {
    for (const pattern of phase1SettingsFieldPatterns) {
      if (pattern.test(block[0])) {
        return true;
      }
    }
  }

  return false;
}

describe("settings phase 1 schema split", () => {
  test(
    "Settings model no longer stores announcement, cookie, or maintenance columns",
    () => {
      const schema = read("prisma/schema.prisma");
      const settingsBlock = extractSettingsModelBlock(schema);

      for (const pattern of phase1SettingsFieldPatterns) {
        expect(settingsBlock).not.toMatch(pattern);
      }

      expect(schema).toContain('@@map("settings_announcement_carousels")');
      expect(schema).toContain('@@map("settings_systems")');
      expect(schema).toContain("model SettingsAnnouncementCarousel {");
      expect(schema).toContain("model SettingsSystem {");
    },
    { timeout: 30_000 },
  );

  test(
    "src must not select Phase 1 fields from prisma.settings",
    () => {
      const offenders: string[] = [];

      for (const file of listSourceFiles(join(root, "src"))) {
        const source = readFileSync(file, "utf8");
        if (!source.includes("prisma.settings.")) {
          continue;
        }

        if (findPrismaSettingsQueryOffenders(source)) {
          offenders.push(file.replace(`${root}\\`, "").replace(`${root}/`, ""));
        }
      }

      expect(offenders).toEqual([]);
    },
    { timeout: 30_000 },
  );
});
