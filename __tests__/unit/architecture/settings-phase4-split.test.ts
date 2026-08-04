import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("settings phase 4 schema split", () => {
  // CI は unit を高並列で回すため、巨大 schema.prisma の多重 regex が
  // 30s 枠に収まる保証がない（2026-07-24 PR#1475: 30312ms timeout flake）。
  test("Phase 4 split singleton tables exist", () => {
    const schema = read("prisma/schema.prisma");

    expect(schema).toMatch(
      /model SettingsStripe \{[\s\S]*@@map\("settings_stripe"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsResend \{[\s\S]*@@map\("settings_resend"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsTurnstile \{[\s\S]*@@map\("settings_turnstile"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsGoogleMaps \{[\s\S]*@@map\("settings_google_maps"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsGoogleCalendar \{[\s\S]*@@map\("settings_google_calendar"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsGoogleBusinessProfile \{[\s\S]*@@map\("settings_google_business_profile"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsInstagram \{[\s\S]*@@map\("settings_instagram"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsSwitchbot \{[\s\S]*@@map\("settings_switchbot"\)/u,
    );
  }, 60_000);
});
