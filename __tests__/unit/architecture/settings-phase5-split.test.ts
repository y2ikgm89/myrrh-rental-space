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

describe("settings phase 5 schema split", () => {
  test("Settings hub model is removed; features and data retention split out", () => {
    const schema = read("prisma/schema.prisma");

    expect(schema).not.toMatch(/^model Settings \{/mu);
    expect(schema).toMatch(
      /model SettingsFeatures \{[\s\S]*@@map\("settings_features"\)/u,
    );
    expect(schema).toMatch(
      /model SettingsDataRetention \{[\s\S]*@@map\("settings_data_retentions"\)/u,
    );
  }, 30_000);

  test("src must not reference prisma.settings", () => {
    const offenders: string[] = [];

    for (const file of listSourceFiles(join(root, "src"))) {
      const source = readFileSync(file, "utf8");
      if (/prisma\.settings(?:\.|\s|[({])/u.test(source)) {
        offenders.push(file.replace(`${root}\\`, "").replace(`${root}/`, ""));
      }
    }

    expect(offenders).toEqual([]);
  }, 30_000);
});
