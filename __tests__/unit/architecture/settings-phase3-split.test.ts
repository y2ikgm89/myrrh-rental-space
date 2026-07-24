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

const phase3SettingsFieldPatterns = [
  /\bbusinessName\b/u,
  /\bbusinessNameKana\b/u,
  /\brepresentativeName\b/u,
  /\bestablishedDate\b/u,
  /\bregistrationNumber\b/u,
  /\binvoiceNumber\b/u,
  /\bbusinessDescription\b/u,
  /\bphoneNumber\b/u,
  /\bfaxNumber\b/u,
  /\bemail\b/u,
  /\bpostalCode\b/u,
  /\bprefecture\b/u,
  /\bcity\b/u,
  /\bstreetAddress\b/u,
  /\bbuildingName\b/u,
  /\bbusinessHours\b/u,
  /\bregularHolidays\b/u,
  /\bholidayNotice\b/u,
  /\bsenderEmail\b/u,
  /\bsenderName\b/u,
  /\breplyToEmail\b/u,
  /\bdurationDiscountEnabled\b/u,
  /\bdurationDiscountRules\b/u,
  /\bdiscountCombinationMode\b/u,
  /\bshowOriginalPrice\b/u,
  /\btaxStandardRate\b/u,
  /\btaxReducedRate\b/u,
  /\btaxDisplayModePublic\b/u,
  /\brefundPolicy\b/u,
  /\bnotifyNewReservation\b/u,
  /\bnotifyReservationChange\b/u,
  /\bnotifyReservationCancel\b/u,
  /\bnotifyNewInquiry\b/u,
  /\bnotifyInquiryCustomerReply\b/u,
  /\bnotifyEventRegistration\b/u,
  /\bnotifyEventWaitlistRegistration\b/u,
  /\bnotifyEventCancellation\b/u,
  /\bnotifyEventReminder\b/u,
  /\bnotificationStaffIds\b/u,
  /\bnotificationEmailAddresses\b/u,
  /\bdefaultTimeSlot\b/u,
  /\bminReservationDuration\b/u,
  /\bmaxReservationDuration\b/u,
  /\bsendReservationConfirmationEmail\b/u,
  /\bmaxRecurrenceInstances\b/u,
  /\bcustomerCanCancelSeriesInFull\b/u,
  /\bcancellationDeadlineHours\b/u,
  /\bmodificationDeadlineHours\b/u,
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
    for (const pattern of phase3SettingsFieldPatterns) {
      if (pattern.test(block[0])) {
        return true;
      }
    }
  }

  return false;
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

  test("src must not select Phase 3 fields from prisma.settings", () => {
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
