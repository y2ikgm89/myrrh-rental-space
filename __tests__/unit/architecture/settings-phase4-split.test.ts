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

const phase4SettingsFieldPatterns = [
  /\bstripePublishableKey\b/u,
  /\bstripeSecretKey\b/u,
  /\bstripeWebhookSecret\b/u,
  /\bstripeAccountId\b/u,
  /\bstripeCurrency\b/u,
  /\bstripePaymentMethodTypes\b/u,
  /\bstripeLastTestedAt\b/u,
  /\bstripeConnectionStatus\b/u,
  /\bresendApiKey\b/u,
  /\bresendWebhookSecret\b/u,
  /\bresendLastTestedAt\b/u,
  /\bresendConnectionStatus\b/u,
  /\bturnstileSiteKey\b/u,
  /\bturnstileSecretKey\b/u,
  /\bturnstileLastTestedAt\b/u,
  /\bturnstileConnectionStatus\b/u,
  /\bgoogleMapsApiKey\b/u,
  /\bgoogleMapsLastTestedAt\b/u,
  /\bgoogleMapsConnectionStatus\b/u,
  /\bgoogleCalendarEnabled\b/u,
  /\bgoogleCalendarServiceAccountJson\b/u,
  /\bgoogleCalendarId\b/u,
  /\bgoogleCalendarLastTestedAt\b/u,
  /\bgoogleCalendarConnectionStatus\b/u,
  /\bgoogleCalendarReminderMinutes\b/u,
  /\bicalAttachmentEnabled\b/u,
  /\baddToCalendarLinksEnabled\b/u,
  /\bgoogleCalendarTwoWaySyncEnabled\b/u,
  /\bgoogleCalendarSyncMethod\b/u,
  /\bgoogleCalendarSyncToken\b/u,
  /\bgoogleCalendarLastSyncedAt\b/u,
  /\beventImportEnabled\b/u,
  /\beventImportSyncToken\b/u,
  /\bgoogleCalendarWebhookChannelId\b/u,
  /\bgoogleCalendarWebhookResourceId\b/u,
  /\bgoogleCalendarWebhookExpiration\b/u,
  /\bgoogleCalendarWebhookToken\b/u,
  /\bgoogleBusinessProfileEnabled\b/u,
  /\bgoogleBusinessProfileAuth\b/u,
  /\binstagramAccessToken\b/u,
  /\binstagramTokenExpiresAt\b/u,
  /\binstagramUserId\b/u,
  /\binstagramUsername\b/u,
  /\binstagramAccountType\b/u,
  /\bswitchbotEnabled\b/u,
  /\bswitchbotOpenToken\b/u,
  /\bswitchbotSecretKey\b/u,
  /\bswitchbotConnectionStatus\b/u,
  /\bswitchbotLastTestedAt\b/u,
  /\bswitchbotPasscodeBufferMinutes\b/u,
  /\bswitchbotWebhookPathToken\b/u,
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
    for (const pattern of phase4SettingsFieldPatterns) {
      if (pattern.test(block[0])) {
        return true;
      }
    }
  }

  return false;
}

describe("settings phase 4 schema split", () => {
  // CI は unit を高並列で回すため、巨大 schema.prisma の多重 regex が
  // 30s 枠に収まる保証がない（2026-07-24 PR#1475: 30312ms timeout flake）。
  test("Phase 4 split singleton tables exist", () => {
    const schema = read("prisma/schema.prisma");

    expect(schema).toMatch(
      /model SettingsStripe \{[\s\S]*@@map\("settings_stripes"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsResend \{[\s\S]*@@map\("settings_resends"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsTurnstile \{[\s\S]*@@map\("settings_turnstiles"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsGoogleMaps \{[\s\S]*@@map\("settings_google_maps"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsGoogleCalendar \{[\s\S]*@@map\("settings_google_calendars"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsGoogleBusinessProfile \{[\s\S]*@@map\("settings_google_business_profiles"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsInstagram \{[\s\S]*@@map\("settings_instagrams"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsSwitchbot \{[\s\S]*@@map\("settings_switchbots"\)/u,
    );
  }, 60_000);

  test("src must not select Phase 4 fields from prisma.settings", () => {
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
