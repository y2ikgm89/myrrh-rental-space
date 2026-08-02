import { readFileSync } from "node:fs";
import { sep } from "node:path";

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * 予約カレンダーの日付を**位置で選ばない**ことの gate。
 *
 * ## なぜ位置指定が構造的に壊れるか
 *
 * 予約フォームには時計が 2 つあり、ずれている。
 *
 * - カレンダーの過去日判定は `E2E_FIXED_NOW_ISO`（既定 `2026-07-04T03:00:00.000Z`）
 *   基準。`ReservationFormSection` が `initialNowIso` として渡し、
 *   `calendar-picker.tsx` がそれを「今日」として扱う
 * - 送信時の日付検証 `publicReservationSchema` の
 *   `.refine((data) => data.date >= formatJstDateString(new Date()))` は**実時刻**。
 *   conform が client 側でも走らせる
 *
 * カレンダーは実時刻の月を描くのに過去日を無効化しないので、`.nth(3)` のような
 * 位置指定は**実日付が進むほど過去へずれる**。月の 4 営業日目を過ぎた時点から
 * 月末まで、選んだ日が過去になり refine が送信を弾く。
 *
 * `e2e/smoke/reservation-submit.smoke.spec.ts` がまさにこの形で、追加された
 * 2026-08-01 が月初だったため気付かれていなかった。**必須ゲート**（chromium-smoke）
 * なので、放置すれば毎月 25 日前後は push が通らなくなる。
 *
 * ## 正しい形
 *
 * `e2e/helpers/reservation-date.ts` の `pickBookableDate()` で**実時刻から日付を
 * 導出**し、`page.clock.install` でその日を「今日」に固定してから、DayPicker が
 * 各セルに付ける安定属性 `data-day="YYYY-MM-DD"` で選ぶ。
 *
 * 有効セルの集合は実時計の関数なので、allowlist で固定することはできない。
 * 例外を作らないのはそのため。
 */

const SPEC_GLOB = "e2e/**/*.spec.ts";

/** `getByRole("gridcell")` に序数を連ねている（= 位置で日付を選んでいる）。 */
const ORDINAL_ON_GRIDCELL =
  /getByRole\(\s*["']gridcell["'][\s\S]{0,200}?\.(?:nth\(|first\(|last\()/u;

/** カレンダーを操作している spec の marker。 */
const TOUCHES_CALENDAR = /reservation-calendar|getByRole\(\s*["']gridcell["']/u;

/** 時刻を固定している spec の marker。 */
const INSTALLS_CLOCK = /page\.clock\.install\(/u;

interface Violation {
  readonly file: string;
  readonly reason: string;
}

function listSpecFiles(): string[] {
  return [...new Glob(SPEC_GLOB).scanSync(process.cwd())]
    .map((path) => path.split(sep).join("/"))
    .sort();
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

describe("予約カレンダーの日付選択", () => {
  test("gate が空振りしていない（カレンダーを触る spec が存在する）", () => {
    const touching = listSpecFiles().filter((file) =>
      TOUCHES_CALENDAR.test(read(file)),
    );
    expect(touching.length).toBeGreaterThan(0);
  });

  test("gridcell を序数で選んでいない", () => {
    const violations: Violation[] = listSpecFiles()
      .filter((file) => ORDINAL_ON_GRIDCELL.test(read(file)))
      .map((file) => ({
        file,
        reason:
          "カレンダーの日付を位置で選んでいる。有効セルの集合は実時計の関数なので、実日付が進むと過去日を掴んで送信が弾かれる。`pickBookableDate()` で日付を導出し `data-day` で選ぶこと",
      }));

    expect(violations.map((v) => `${v.file}: ${v.reason}`)).toEqual([]);
  });

  test("カレンダーを触る spec は時刻を固定している", () => {
    const violations: Violation[] = listSpecFiles()
      .filter((file) => TOUCHES_CALENDAR.test(read(file)))
      .filter((file) => !INSTALLS_CLOCK.test(read(file)))
      .map((file) => ({
        file,
        reason:
          "カレンダーを操作するのに `page.clock.install` が無い。カレンダー側は E2E_FIXED_NOW_ISO 基準、送信側の日付 refine は実時刻基準なので、固定しないと 2 つの時計がずれる",
      }));

    expect(violations.map((v) => `${v.file}: ${v.reason}`)).toEqual([]);
  });

  test("フォームを送信する spec は送信前に実時刻へ戻す", () => {
    // `ReservationForm` は `useState(() => Date.now())` で `formRenderedAt` を
    // **ブラウザの時計**から焼き込み、Server Action の `checkBotHeuristics` は
    // それを**サーバーの実時刻**と引き算する。未来へ固定したまま送信すると差が
    // 負になり、3 秒の下限を満たさず全送信が bot 判定で弾かれる。
    // 実測: #1823 の chromium-smoke が完了 URL 待ちで timeout した。
    const violations = listSpecFiles()
      .filter((file) => {
        const source = read(file);
        return (
          INSTALLS_CLOCK.test(source) &&
          // 予約フォームを実際に送信している spec だけが対象。
          /name: "予約を確定する"/u.test(source)
        );
      })
      .filter((file) => !/clock\.setSystemTime\(/u.test(read(file)))
      .map(
        (file) =>
          `${file}: 時刻を固定したまま予約フォームを送信している。日付選択後に page.clock.setSystemTime(new Date()) で実時刻へ戻すこと（formRenderedAt はブラウザ時計、bot 判定はサーバー時刻）`,
      );

    expect(violations).toEqual([]);
  });

  test("日付導出は共有ヘルパー 1 箇所に集約されている", () => {
    // 各 spec が自前で「祝日を避けた N 日後」を組み立てると、seed のデモ予約帯や
    // 日曜休業の条件が spec ごとに乖離する。実際 2 つの smoke spec が同じ導出を
    // 別々に持っていた。
    const duplicated = listSpecFiles().filter((file) =>
      /holiday_jp/u.test(read(file)),
    );

    expect(duplicated).toEqual([]);
  });
});
