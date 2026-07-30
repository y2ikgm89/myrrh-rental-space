import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("settings phase 1 schema split", () => {
  test(
    "Phase 1 split singleton tables exist",
    () => {
      const schema = read("prisma/schema.prisma");

      expect(schema).toContain('@@map("settings_announcement_carousels")');
      expect(schema).toContain('@@map("settings_systems")');
      expect(schema).toContain("model SettingsAnnouncementCarousel {");
      expect(schema).toContain("model SettingsSystem {");
    },
    { timeout: 30_000 },
  );
});
