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

function extractSettingsModelBlock(schema: string): string {
  const match = schema.match(/model Settings \{[\s\S]*?\n\}/u);
  expect(match).not.toBeNull();
  return match?.[0] ?? "";
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
  test("Settings model no longer stores announcement, cookie, or maintenance columns", () => {
    const settingsBlock = extractSettingsModelBlock(
      read("prisma/schema.prisma"),
    );

    for (const pattern of phase1SettingsFieldPatterns) {
      expect(settingsBlock).not.toMatch(pattern);
    }

    expect(read("prisma/schema.prisma")).toMatch(
      /model SettingsAnnouncementCarousel \{[\s\S]*@@map\("settings_announcement_carousels"\)/u,
    );
    expect(read("prisma/schema.prisma")).toMatch(
      /model SettingsSystem \{[\s\S]*@@map\("settings_systems"\)/u,
    );
  });

  test("src must not select Phase 1 fields from prisma.settings", () => {
    const offenders: string[] = [];

    for (const file of listSourceFiles(join(root, "src"))) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("prisma.settings")) {
        continue;
      }

      if (findPrismaSettingsQueryOffenders(source)) {
        offenders.push(file.replace(`${root}\\`, "").replace(`${root}/`, ""));
      }
    }

    expect(offenders).toEqual([]);
  });
});
