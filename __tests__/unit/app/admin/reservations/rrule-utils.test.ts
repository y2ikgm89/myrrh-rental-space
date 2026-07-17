/**
 * `buildRruleString` client-safe RRULE string builder (Phase B.2 task 18).
 *
 * 目的: admin UI から `series-rrule.ts` (server) に渡す RRULE 文字列を、
 * `rrule` package を使わずに素の string concatenation で生成する。
 * client bundle に rrule を持ち込まない (client-safe) ため。
 *
 * 検証観点:
 *   1. WEEKLY + BYDAY 複数 + COUNT
 *   2. DAILY + UNTIL (ISO date → YYYYMMDDT000000Z 変換)
 *   3. COUNT と UNTIL 同時指定 → COUNT 優先 (RFC 5545 契約: 排他的)
 *   4. INTERVAL は必ず出力 (省略時 1 と同等だが明示することで RRULE 解釈のブレを避ける)
 *   5. MONTHLY + BYMONTHDAY (Phase B.2 spec §7、`series-rrule.ts` WHITELIST に整合)
 */

import { describe, expect, test } from "bun:test";

import { buildRruleString } from "@/app/(admin)/admin/(dashboard)/reservations/_components/rrule-utils";

describe("buildRruleString — Phase B.2 task 18", () => {
  test("WEEKLY BYDAY=TU,TH COUNT=10", () => {
    expect(
      buildRruleString({
        freq: "WEEKLY",
        interval: 1,
        byday: ["TU", "TH"],
        count: 10,
      }),
    ).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH;COUNT=10");
  });

  test("DAILY INTERVAL=2 UNTIL", () => {
    expect(
      buildRruleString({
        freq: "DAILY",
        interval: 2,
        until: "2026-09-01",
      }),
    ).toBe("FREQ=DAILY;INTERVAL=2;UNTIL=20260901T000000Z");
  });

  test("COUNT と UNTIL 同時指定 → COUNT 優先 (RFC 5545 契約: 排他的)", () => {
    const result = buildRruleString({
      freq: "WEEKLY",
      interval: 1,
      count: 5,
      until: "2026-09-01",
    });
    expect(result).toContain("COUNT=5");
    expect(result).not.toContain("UNTIL");
  });

  test("MONTHLY (BYMONTHDAY 相当は series-rrule 側の WHITELIST に整合。builder は byday が空なら output しない)", () => {
    expect(
      buildRruleString({
        freq: "MONTHLY",
        interval: 1,
        count: 6,
      }),
    ).toBe("FREQ=MONTHLY;INTERVAL=1;COUNT=6");
  });

  test("BYDAY 単一値", () => {
    expect(
      buildRruleString({
        freq: "WEEKLY",
        interval: 1,
        byday: ["FR"],
        count: 4,
      }),
    ).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=FR;COUNT=4");
  });

  test("INTERVAL は常に出力される (省略時の暗黙 1 に依存しない)", () => {
    const result = buildRruleString({
      freq: "DAILY",
      interval: 1,
      count: 3,
    });
    expect(result).toContain("INTERVAL=1");
  });

  test("count も until も未指定なら COUNT/UNTIL は出力されない (呼出側が Zod refine で必須化)", () => {
    expect(
      buildRruleString({
        freq: "WEEKLY",
        interval: 1,
        byday: ["MO"],
      }),
    ).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO");
  });

  test("BYDAY 空配列は BYDAY を出力しない", () => {
    expect(
      buildRruleString({
        freq: "DAILY",
        interval: 1,
        byday: [],
        count: 5,
      }),
    ).toBe("FREQ=DAILY;INTERVAL=1;COUNT=5");
  });
});
