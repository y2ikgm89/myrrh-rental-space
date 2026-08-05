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

describe("settings phase 4 schema split", () => {
  // CI は unit を高並列で回すため、巨大 schema.prisma の多重 regex が
  // 30s 枠に収まる保証がない（2026-07-24 PR#1475: 30312ms timeout flake）。
  test("Phase 4 split singleton tables exist", () => {
    const schema = read("prisma/schema.prisma");

    expect(mapOf(schema, "SettingsStripe")).toBe("settings_stripe");
    expect(mapOf(schema, "SettingsResend")).toBe("settings_resend");
    expect(mapOf(schema, "SettingsTurnstile")).toBe("settings_turnstile");
    expect(mapOf(schema, "SettingsGoogleMaps")).toBe("settings_google_maps");
    expect(mapOf(schema, "SettingsGoogleCalendar")).toBe(
      "settings_google_calendar",
    );
    expect(mapOf(schema, "SettingsGoogleBusinessProfile")).toBe(
      "settings_google_business_profile",
    );
    expect(mapOf(schema, "SettingsInstagram")).toBe("settings_instagram");
    expect(mapOf(schema, "SettingsSwitchbot")).toBe("settings_switchbot");
  }, 60_000);
});
