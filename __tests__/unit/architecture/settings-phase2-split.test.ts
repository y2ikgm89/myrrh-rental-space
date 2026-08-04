import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("settings phase 2 schema split", () => {
  test("Phase 2 split singleton tables exist", () => {
    const schema = read("prisma/schema.prisma");

    expect(schema).toMatch(
      /model SettingsSeo \{[\s\S]*@@map\("settings_seo"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsAnalytics \{[\s\S]*@@map\("settings_analytics"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsLayout \{[\s\S]*@@map\("settings_layout"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsSidebar \{[\s\S]*@@map\("settings_sidebar"\)/u,
    );
  }, 30_000);
});
