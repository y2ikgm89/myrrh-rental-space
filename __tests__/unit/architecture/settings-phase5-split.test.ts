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

/**
 * `model <name>` の `@@map` を返す。無ければ null。
 *
 * **`/model X \{[\s\S]*@@map\("y"\)/` で書かない。** 2 つの理由がある:
 *
 *   1. **正しくない。** `[\s\S]*` はモデル境界を越えるので、`@@map("y")` が
 *      *別のモデル* にあっても一致する
 *   2. **遅い。** 後戻り探索が schema 長に対して二次で効く。実測 1 式 2.4〜3.1 秒で、
 *      列注釈を足して schema が伸びた時点で CI の 30 秒制限を超えて落ちた
 *
 * モデルのブロックを切り出してからその中だけを見れば、両方とも起きない。
 */
function mapOf(schema: string, model: string): string | null {
  const start = schema.indexOf(`\nmodel ${model} {`);
  if (start === -1) return null;
  const end = schema.indexOf("\n}", start);
  const body = schema.slice(start, end === -1 ? undefined : end);
  return /@@map\("([^"]+)"\)/u.exec(body)?.[1] ?? null;
}

describe("settings phase 5 schema split", () => {
  test("Settings hub model is removed; features and data retention split out", () => {
    const schema = read("prisma/schema.prisma");

    expect(schema).not.toMatch(/^model Settings \{/mu);
    expect(mapOf(schema, "SettingsFeatures")).toBe("settings_features");
    expect(mapOf(schema, "SettingsDataRetention")).toBe(
      "settings_data_retention",
    );
  }, 30_000);

  test("走査根が生きている（消えると offenders が必ず空になる）", () => {
    // `listSourceFiles` は存在しないディレクトリで空配列を返す。`src` の解決が
    // 壊れると offenders も必ず空になり、緑が「違反なし」を意味しなくなる。
    expect(listSourceFiles(join(root, "src")).length).toBeGreaterThan(500);
  });

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
