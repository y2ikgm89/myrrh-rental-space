/**
 * **seed の時刻は `jstDateTime` で組む。壁時計を動かす Date mutator を使わない。**
 *
 * ## なぜ
 *
 * `prisma/seed.ts` 自身が規約を明文化している —
 * 「`date.setHours(9)` はコンテナのローカル時刻で解釈されるので、JST の開発機では
 * 9 時が 9 時でも UTC の CI runner では 9 時が JST 18 時になる。アプリは JST 固定の
 * formatter で表示するため、同じ seed が環境で違う意味になっていた」。
 *
 * ところが監査 A-96 の時点で、この規約に従っていたのは `seedReservations` だけだった。
 *
 * - `seedDevCustomerAndReservations` の 4 件は `setHours(10)` のまま
 *   → JST 開発機では 10:00、UTC の CI では JST 19:00 として表示される
 * - 同じ関数のゲスト履歴だけ `setUTCHours(3)`（= JST 12:00）と UTC 直指定で、
 *   **1 つの関数の中でも 3 通りの書き方**が混在していた
 * - `seedPublicReviewE2EFixture` も `setHours(9)`
 *
 * 同じ漏れは 2 度目（`seedReservations` を直したときに他が残った）なので機械強制する。
 *
 * ## 何を見るか
 *
 * `prisma/seed.ts` の**実コード**に `setHours` / `setUTCHours` / `setMinutes` /
 * `setUTCMinutes` が現れないこと。コメントは対象外（規約の説明自体がこれらの語を含む）。
 *
 * **`setDate` は許す。** 日付だけの加減算は壁時計の意味を変えない
 * （`slaExpiresAt.setDate(getDate() + 2)` のような使い方が実在する）。
 *
 * ## 直し方
 *
 * `jstDateTime(base, daysOffset, hour)` を使う。UTC 直指定も避けること —
 * `setUTCHours(3)` は「JST 12:00」の意図が読めない。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { stripComments } from "../../helpers/architecture-fs";

const SEED_PATH = join(process.cwd(), "prisma", "seed.ts");

/** 壁時計を動かす Date mutator。`setDate` は日付演算なので含めない。 */
const WALL_CLOCK_MUTATORS = [
  "setHours",
  "setUTCHours",
  "setMinutes",
  "setUTCMinutes",
] as const;

function seedCode(): string {
  return stripComments(readFileSync(SEED_PATH, "utf8"));
}

/** 実コード行に現れる壁時計 mutator を、行番号つきで返す。 */
function findWallClockMutators(code: string): string[] {
  const found: string[] = [];
  const lines = code.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const name of WALL_CLOCK_MUTATORS) {
      if (line.includes(`.${name}(`)) {
        found.push(`${String(index + 1)}: ${line.trim()}`);
      }
    }
  }
  return found;
}

describe("seed の時刻は jstDateTime で組む（A-96）", () => {
  test("走査対象が空振りしていない", () => {
    const code = seedCode();
    // seed.ts は 6000 行規模。極端に短ければ読み取りが壊れている。
    expect(code.split("\n").length).toBeGreaterThan(3000);
    // 規約の実体（helper）が在ること。消えたらこの gate の直し方が成立しない。
    expect(code).toContain("function jstDateTime(");
  });

  test("実コードに壁時計 mutator が無い", () => {
    expect(findWallClockMutators(seedCode())).toEqual([]);
  });

  test("判定が差分を検出する（見本）", () => {
    // 落ちるべき形: ローカル時刻での時刻指定
    expect(
      findWallClockMutators(
        "const start = new Date();\nstart.setHours(10, 0, 0, 0);",
      ),
    ).toEqual(["2: start.setHours(10, 0, 0, 0);"]);

    // 落ちるべき形: UTC 直指定も意図が読めないので許さない
    expect(
      findWallClockMutators("guestStart.setUTCHours(3, 0, 0, 0);"),
    ).toEqual(["1: guestStart.setUTCHours(3, 0, 0, 0);"]);

    // 落ちてはいけない形: jstDateTime 経由
    expect(
      findWallClockMutators(
        "const start = jstDateTime(now, r.daysOffset, 10);",
      ),
    ).toEqual([]);

    // 落ちてはいけない形: 日付だけの加減算
    expect(
      findWallClockMutators(
        "slaExpiresAt.setDate(slaExpiresAt.getDate() + 2);",
      ),
    ).toEqual([]);
  });
});
