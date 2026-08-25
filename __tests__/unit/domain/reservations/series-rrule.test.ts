import { describe, expect, test } from "bun:test";
import {
  validateRruleForSeries,
  rebuildRruleWithUntil,
} from "@/shared/domain/reservations/series-rrule";

// 2026-07-21 10:00Z = JST 19:00 の火曜日。BYDAY=TU の RRULE と一致させるため
// dtstart は実際の火曜日を使う（brief 原案の 07-22 は水曜日で BYDAY=TU と
// 不一致だったため実測で補正 — bun run 経由で rrule 実挙動を検証済み）。
const dtstart = new Date("2026-07-21T10:00:00Z");

/** JST の壁時計表記（`YYYY-MM-DD HH:mm`）。ずれを目で追えるようにする。 */
function jstStamp(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

describe("validateRruleForSeries", () => {
  test("valid WEEKLY 10 回", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=10",
      dtstart,
      duration: 120,
      maxInstances: 26,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.instanceCount).toBe(10);
  });

  test("valid DAILY 5 回", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=DAILY;COUNT=5",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(true);
  });

  test("valid MONTHLY 3 回", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=MONTHLY;BYMONTHDAY=15;COUNT=3",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(true);
  });

  test("invalid FREQ (YEARLY) → error", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=YEARLY;COUNT=3",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/FREQ.*サポート/);
  });

  test("invalid FREQ (SECONDLY) → error", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=SECONDLY;COUNT=3",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
  });

  test("count 上限超過 → error", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=WEEKLY;COUNT=100",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/上限|最大|maximum/);
  });

  test("UNTIL でも count 越える → error", () => {
    // 毎週で 1 年半 = 78 回 (26 超え)
    const result = validateRruleForSeries({
      rrule: "FREQ=WEEKLY;UNTIL=20280101T000000Z",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
  });

  test("rrule 文法 error → error", () => {
    const result = validateRruleForSeries({
      rrule: "INVALID_RRULE_STRING",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
  });
});

describe("展開は JST の壁時計で行う", () => {
  /**
   * rrule.js は DTSTART の UTC 成分を壁時計として読む。真の instant をそのまま
   * 渡すと、JST 09:00 未満の起点で BYDAY 判定が前日の UTC 日付に落ち、
   * **全 instance が 1 日後ろへずれて起点の日が消える**。
   *
   * 早朝の枠は現在 admin の `TIME_OPTIONS`（09:00〜21:00）が塞いでいるが、
   * 塞いでいるのは UI であって展開の正しさではない。
   */
  test("JST 08:00 起点の WEEKLY BYDAY=WE が水曜のまま展開される", () => {
    const result = validateRruleForSeries({
      // 2026-07-22 は水曜日。JST 08:00 = 2026-07-21T23:00Z（UTC では火曜）。
      rrule: "FREQ=WEEKLY;BYDAY=WE;COUNT=3",
      dtstart: new Date("2026-07-21T23:00:00Z"),
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.instances.map(jstStamp)).toEqual([
      "2026-07-22 08:00",
      "2026-07-29 08:00",
      "2026-08-05 08:00",
    ]);
  });

  /**
   * UNTIL も同じ幅だけ動かさないと監査 F-36 が再発する。admin の builder は
   * 「JST のその日の終わり」を `UNTIL=<date>T145959Z` として書くので、
   * 置き去りにすると終了日当日の夕方の枠が丸ごと落ちる。
   */
  test("UNTIL が JST の終了日当日の夕方も含む（F-36 の回帰）", () => {
    const result = validateRruleForSeries({
      // JST 19:00 の火曜起点、終了日 2026-08-04（JST）。
      //
      // **夕方でないと判別できない。** UNTIL の壁時計は 14:59:59 なので、
      // 枠が JST 14:59 より前だとフレームの有無にかかわらず含まれてしまい、
      // 「UNTIL を動かし忘れた実装」と区別がつかない。
      rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;UNTIL=20260804T145959Z",
      dtstart,
      duration: 120,
      maxInstances: 26,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.instances.map(jstStamp)).toEqual([
      "2026-07-21 19:00",
      "2026-07-28 19:00",
      "2026-08-04 19:00",
    ]);
  });
});

describe("rebuildRruleWithUntil (Phase B.2.1 Task C)", () => {
  test("WEEKLY BYDAY=TU COUNT=10 → UNTIL 注入で COUNT 消える", () => {
    const until = new Date("2026-08-11T10:00:00Z");
    const result = rebuildRruleWithUntil(
      "FREQ=WEEKLY;BYDAY=TU;COUNT=10",
      dtstart,
      until,
    );
    expect(result).toMatch(/FREQ=WEEKLY/u);
    expect(result).toMatch(/BYDAY=TU/u);
    expect(result).toMatch(/UNTIL=20260811T100000Z/u);
    expect(result).not.toMatch(/COUNT=/u);
  });

  test("DAILY INTERVAL=2 → UNTIL 追加", () => {
    const until = new Date("2026-08-01T10:00:00Z");
    const result = rebuildRruleWithUntil(
      "FREQ=DAILY;INTERVAL=2",
      dtstart,
      until,
    );
    expect(result).toMatch(/FREQ=DAILY/u);
    expect(result).toMatch(/INTERVAL=2/u);
    expect(result).toMatch(/UNTIL=20260801T100000Z/u);
  });

  test("MONTHLY BYMONTHDAY=15 COUNT=6 → UNTIL 注入", () => {
    const until = new Date("2027-01-15T10:00:00Z");
    const result = rebuildRruleWithUntil(
      "FREQ=MONTHLY;BYMONTHDAY=15;COUNT=6",
      new Date("2026-07-15T10:00:00Z"),
      until,
    );
    expect(result).toMatch(/FREQ=MONTHLY/u);
    expect(result).toMatch(/BYMONTHDAY=15/u);
    expect(result).toMatch(/UNTIL=20270115T100000Z/u);
    expect(result).not.toMatch(/COUNT=/u);
  });

  test("戻り値は RRULE: prefix なしの本体 (呼出側で prefix 付与する契約)", () => {
    const result = rebuildRruleWithUntil(
      "FREQ=WEEKLY;COUNT=5",
      dtstart,
      new Date("2026-08-04T10:00:00Z"),
    );
    expect(result).not.toMatch(/^RRULE:/u);
    expect(result).not.toMatch(/^DTSTART:/u);
  });
});
