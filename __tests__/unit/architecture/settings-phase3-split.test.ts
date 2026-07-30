import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("settings phase 3 schema split", () => {
  test("Phase 3 split singleton tables exist", () => {
    const schema = read("prisma/schema.prisma");

    expect(schema).toMatch(
      /model SettingsOrganization \{[\s\S]*@@map\("settings_organizations"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsCommerce \{[\s\S]*@@map\("settings_commerces"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsNotification \{[\s\S]*@@map\("settings_notifications"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsReservation \{[\s\S]*@@map\("settings_reservations"\)/u,
    );
  }, 30_000);
});
