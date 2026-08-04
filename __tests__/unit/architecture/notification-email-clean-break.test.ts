import { describe, expect, test } from "bun:test";

import { readDatabaseInvariants } from "../../support/prisma-sources";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("notification email clean break", () => {
  test("notification recipients are stored as non-null Prisma scalar string lists", () => {
    const schema = read("prisma/schema.prisma");

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

    // 型変更そのものは一度きりの移行操作なので検査しない（畳めば消える）。
    // 恒久的に守りたいのは「NULL が入らないこと」で、それは baseline の
    // SET NOT NULL が担う（Prisma は scalar list に NOT NULL を出さない）。
    const invariants = readDatabaseInvariants();
    expect(invariants).toContain(
      'ALTER TABLE "settings_notifications" ALTER COLUMN "notificationStaffIds" SET NOT NULL;',
    );
    expect(invariants).toContain(
      'ALTER TABLE "settings_notifications" ALTER COLUMN "notificationEmailAddresses" SET NOT NULL;',
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
    const organizationCommands = read(
      "src/shared/domain/settings/commands/organization.ts",
    );

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
    expect(organizationCommands).not.toContain(
      "asPrismaInputJsonValue(\n      data.notificationStaffIds",
    );
    expect(organizationCommands).not.toContain(
      "asPrismaInputJsonValue(\n      data.notificationEmailAddresses",
    );
    expect(organizationCommands).toContain("notificationStaffIds: string[];");
    expect(organizationCommands).toContain(
      "notificationEmailAddresses: string[];",
    );
  });
});
