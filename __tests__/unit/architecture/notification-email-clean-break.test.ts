import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("notification email clean break", () => {
  test("notification recipients are stored as non-null Prisma scalar string lists", () => {
    const schema = read("prisma/schema.prisma");
    const migration = read(
      "prisma/migrations/20260702000000_notification_recipients_scalar_lists/migration.sql",
    );

    expect(schema).toMatch(
      /notificationStaffIds\s+String\[\]\s+@default\(\[\]\)/u,
    );
    expect(schema).toMatch(
      /notificationEmailAddresses\s+String\[\]\s+@default\(\[\]\)/u,
    );
    expect(schema).not.toContain("notificationStaffIds       Json");
    expect(schema).not.toContain("notificationStaffIds       Json?");
    expect(schema).not.toContain("notificationEmailAddresses String?");
    expect(schema).not.toContain("notificationEmailAddresses Json");
    expect(schema).not.toContain("カンマ区切り");

    expect(migration).toContain(
      'ALTER COLUMN "notificationStaffIds" TYPE TEXT[]',
    );
    expect(migration).toContain(
      'ALTER COLUMN "notificationEmailAddresses" TYPE TEXT[]',
    );
    expect(migration).toContain("ARRAY[]::text[]");
  });

  test("notification recipient migration uses a narrow Squawk file exception", () => {
    const migration = read(
      "prisma/migrations/20260702000000_notification_recipients_scalar_lists/migration.sql",
    );

    expect(migration).toContain(
      "-- squawk-ignore-file changing-column-type, adding-not-nullable-field",
    );
    expect(migration).not.toMatch(/--\s*squawk-ignore-file\s*(?:\r?\n|$)/u);
    expect(migration).not.toContain(
      "-- squawk-ignore changing-column-type, adding-not-nullable-field",
    );
  });

  test("admin email form uses repeated fields for custom recipient arrays", () => {
    const chips = read(
      "src/app/(admin)/admin/(dashboard)/settings/_components/sections/EmailChips.tsx",
    );
    const section = read(
      "src/app/(admin)/admin/(dashboard)/settings/_components/sections/EmailSection.tsx",
    );

    expect(chips).not.toContain('join(",")');
    expect(chips).not.toContain("カンマ区切り文字列");
    expect(chips).toContain('type="hidden"');
    expect(chips).toContain("value.map");

    expect(section).not.toContain('.split(",")');
    expect(section).not.toContain('notificationEmailAddresses ?? ""');
  });

  test("server-side validation and notification query do not parse comma strings at runtime", () => {
    const formSchema = read(
      "src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-email-notification.ts",
    );
    const action = read(
      "src/app/(admin)/admin/(dashboard)/_shared/actions/settings/email.ts",
    );
    const adminQuery = read("src/shared/domain/settings/admin-queries.ts");
    const query = read("src/shared/domain/settings/queries/notification.ts");
    const commands = read("src/shared/domain/settings/commands.ts");

    expect(formSchema).toMatch(/z\s*\.array/u);
    expect(formSchema).not.toContain('.split(",")');
    expect(formSchema).not.toContain("カンマ区切り");

    expect(action).not.toContain(
      "emptyToNull(\n            data.notificationEmailAddresses",
    );
    expect(action).not.toContain("data.notificationStaffIds ?? []");
    expect(adminQuery).not.toContain(
      "parseStringArrayOrNull(settings.notificationStaffIds)",
    );
    expect(adminQuery).not.toContain(
      "parseStringArray(settings.notificationStaffIds)",
    );
    expect(adminQuery).not.toContain(
      "parseStringArray(settings.notificationEmailAddresses",
    );
    expect(query).not.toContain('.split(",")');
    expect(query).not.toContain("カンマ区切り");
    expect(query).not.toContain(
      "parseStringArrayOrNull(settings?.notificationStaffIds)",
    );
    expect(query).not.toContain(
      "parseStringArray(settings?.notificationStaffIds)",
    );
    expect(query).not.toContain(
      "parseStringArray(settings?.notificationEmailAddresses)",
    );
    expect(commands).not.toContain(
      "asPrismaInputJsonValue(\n      data.notificationStaffIds",
    );
    expect(commands).not.toContain(
      "asPrismaInputJsonValue(\n      data.notificationEmailAddresses",
    );
    expect(commands).toContain("notificationStaffIds: string[];");
    expect(commands).toContain("notificationEmailAddresses: string[];");
  });
});
