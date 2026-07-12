import { describe, expect, test } from "bun:test";

import { buildDateTime } from "@/shared/domain/reservations/payloads";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";

/**
 * Cloud Run (TZ=UTC) 上で `new Date(`${date}T${time}:00`)` は server-local として
 * parse され JST 意図の入力を +9h ずらして保存する silent bug の retention gate。
 *
 * buildDateTime は `src/shared/lib/date-format.ts` の `parseDateTimeLocalAsJst`
 * (+09:00 明示付与) に委譲する SSoT。この委譲が失われると reservation 書込 4 経路が
 * 再び UTC 解釈に戻り、本番で 9 時間ずれる。
 */
describe("buildDateTime (JST SSoT delegation)", () => {
  test("JST 12:00 の予約時刻は UTC 03:00 として保持される", () => {
    const result = buildDateTime("2026-05-03", "12:00");
    expect(result.toISOString()).toBe("2026-05-03T03:00:00.000Z");
  });

  test("JST 00:00 (深夜) は前日 UTC 15:00 になる (日跨ぎ)", () => {
    const result = buildDateTime("2026-05-03", "00:00");
    expect(result.toISOString()).toBe("2026-05-02T15:00:00.000Z");
  });

  test("JST 23:59 は当日 UTC 14:59", () => {
    const result = buildDateTime("2026-05-03", "23:59");
    expect(result.toISOString()).toBe("2026-05-03T14:59:00.000Z");
  });

  test("parseDateTimeLocalAsJst と bit-for-bit 一致する (SSoT 契約)", () => {
    const cases = [
      { date: "2026-01-01", time: "09:00" },
      { date: "2026-07-15", time: "18:30" },
      { date: "2026-12-31", time: "23:00" },
    ];
    for (const { date, time } of cases) {
      const via = buildDateTime(date, time);
      const direct = parseDateTimeLocalAsJst(`${date}T${time}`);
      expect(via.toISOString()).toBe(direct.toISOString());
    }
  });

  test("不正な入力は Invalid Date を返す (regression: parseDateTimeLocalAsJst 契約継承)", () => {
    expect(Number.isNaN(buildDateTime("2026/05/03", "12:00").getTime())).toBe(
      true,
    );
    expect(Number.isNaN(buildDateTime("2026-05-03", "invalid").getTime())).toBe(
      true,
    );
  });
});
