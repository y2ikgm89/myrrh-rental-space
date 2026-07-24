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

const phase2SettingsFieldPatterns = [
  /\bsiteName\b/u,
  /\bsiteDescription\b/u,
  /\bfaviconUrl\b/u,
  /\bdefaultOgpImageUrl\b/u,
  /\bheaderLogoUrl\b/u,
  /\bfooterLogoUrl\b/u,
  /\bfooterCopyright\b/u,
  /\buseHeaderLogo\b/u,
  /\buseFooterLogo\b/u,
  /\bdefaultMetaDescription\b/u,
  /\bdefaultMetaKeywords\b/u,
  /\bdefaultOgpTitle\b/u,
  /\bdefaultOgpDescription\b/u,
  /\banalyticsType\b/u,
  /\bgoogleAnalyticsId\b/u,
  /\bgoogleTagManagerId\b/u,
  /\bgoogleSearchConsoleId\b/u,
  /\bbingWebmasterToolsId\b/u,
  /\bgaPropertyId\b/u,
  /\bmicrosoftClarityId\b/u,
  /\bcontainerWidth\b/u,
  /\bcontainerWidthCustom\b/u,
  /\bcontentWidth\b/u,
  /\bcontentWidthCustom\b/u,
  /\bheaderScrollBehavior\b/u,
  /\bheaderBackgroundMode\b/u,
  /\bthemeColor\b/u,
  /\bfooterTagline\b/u,
  /\bfooterNavigationLabel\b/u,
  /\bfooterContactLabel\b/u,
  /\bfooterHoursLabel\b/u,
  /\bfooterShowSocialLinks\b/u,
  /\bsidebarEnabled\b/u,
  /\bsidebarWidgets\b/u,
  /\bsidebarRecentCount\b/u,
  /\bsidebarPopularCount\b/u,
  /\bsidebarTocEnabled\b/u,
] as const;

function extractSettingsModelBlock(schema: string): string {
  const match = schema.match(/^model Settings \{/mu);
  expect(match).not.toBeNull();
  const start = match?.index ?? 0;
  const rest = schema.slice(start);
  const end = rest.indexOf("\n}");
  expect(end).toBeGreaterThan(-1);
  return rest.slice(0, end + 2);
}

function findPrismaSettingsQueryOffenders(source: string): boolean {
  const queryBlocks = source.matchAll(
    /prisma\.settings\.(?:find\w+|upsert|update\w+|create)\(\{[\s\S]*?\}\)/gu,
  );

  for (const block of queryBlocks) {
    for (const pattern of phase2SettingsFieldPatterns) {
      if (pattern.test(block[0])) {
        return true;
      }
    }
  }

  return false;
}

describe("settings phase 2 schema split", () => {
  test("Phase 2 split singleton tables exist", () => {
    const schema = read("prisma/schema.prisma");

    expect(schema).toMatch(
      /model SettingsSeo \{[\s\S]*@@map\("settings_seos"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsAnalytics \{[\s\S]*@@map\("settings_analytics"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsLayout \{[\s\S]*@@map\("settings_layouts"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsSidebar \{[\s\S]*@@map\("settings_sidebars"\)/u,
    );
  }, 30_000);

  test("src must not select Phase 2 fields from prisma.settings", () => {
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
  }, 30_000);
});
