import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
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

describe("settings phase 3 schema split", () => {
  test("Phase 3 split singleton tables exist", () => {
    const schema = read("prisma/schema.prisma");

    expect(mapOf(schema, "SettingsOrganization")).toBe("settings_organization");
    expect(mapOf(schema, "SettingsCommerce")).toBe("settings_commerce");
    expect(mapOf(schema, "SettingsNotification")).toBe("settings_notification");
    expect(mapOf(schema, "SettingsReservation")).toBe("settings_reservation");
  }, 30_000);
});
