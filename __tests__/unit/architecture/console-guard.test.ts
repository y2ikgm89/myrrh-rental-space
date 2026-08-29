/**
 * @description テスト中の「意図しない console 出力」gate の判定と配線を固定する。
 *
 * ## なぜ
 *
 * React の act 忘れ・DOM に渡らない prop の警告は `console.error` に出るだけで
 * テストを落とさない。`scripts/run-tests.ts` は成功したファイルの本文を出さない
 * ので、警告は誰にも読まれずに積み上がる。2026-08-30 時点で `__tests__/unit`
 * 950 本の成功ログに 9 件埋もれていた（act 3 / prop 3 / event handler 1 /
 * jsdom 未実装 2）。
 *
 * ## 何を見るか
 *
 * 1. 判定（`isUnexpectedConsoleCall`）の見本 2 種。**実際に埋もれていた文字列を
 *    そのまま使う**（合成文言だと、本物の形が変わったときに気づけない）。
 * 2. `__tests__/setup.ts` が guard を配線していること。外されると 9 件が
 *    無言で戻るが、テストは全部緑のままになる。
 *
 * ## 直し方
 *
 * 落ちたときの直し方は `__tests__/helpers/console-guard.ts` の JSDoc。
 */
import { describe, expect, test } from "bun:test";

import { isUnexpectedConsoleCall } from "../../helpers/console-guard";

/** 実際に成功ログへ埋もれていた警告（= 落ちるべき形）。 */
const REAL_WARNINGS: readonly (readonly unknown[])[] = [
  [
    "An update to %s inside a test was not wrapped in act(...).",
    "AutoSectionForm",
  ],
  [
    "A suspended resource finished loading inside a test, but the event was not wrapped in act(...).",
  ],
  [
    "React does not recognize the `forceMount` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `forcemount` instead.",
  ],
  ["Unknown event handler property `onValueChange`. It will be ignored."],
  ["Not implemented: Window's scrollTo() method"],
];

/** アプリと scripts が意図して出しているログ（= 落ちてはいけない形）。 */
const APP_LOGS: readonly (readonly unknown[])[] = [
  ["[Error]", { severity: "WARNING", message: "DB connection failed" }],
  ["[INFO] sitemap rendered", { totalEntries: 42 }],
  [
    "[setup] DATABASE_URL が、この setup で起動した Docker Postgres を指していません。",
  ],
  ["[test:db:migrate] Failed to start docker-compose test-db."],
];

describe("console guard", () => {
  test("実際に埋もれていた警告を落とす", () => {
    // 見本が空になると `toEqual` は両辺 `[]` で緑になる。下限を先に置く。
    expect(REAL_WARNINGS.length).toBeGreaterThan(4);
    expect(REAL_WARNINGS.map((args) => isUnexpectedConsoleCall(args))).toEqual(
      REAL_WARNINGS.map(() => true),
    );
  });

  test("アプリと scripts の意図したログは落とさない", () => {
    expect(APP_LOGS.length).toBeGreaterThan(3);
    expect(APP_LOGS.map((args) => isUnexpectedConsoleCall(args))).toEqual(
      APP_LOGS.map(() => false),
    );
  });

  test("setup.ts が guard を配線している", async () => {
    const source = await Bun.file("__tests__/setup.ts").text();
    // 行頭に固定する。`toContain("installConsoleGuard()")` だと
    // `// installConsoleGuard();` にも一致し、配線を外しても緑になる
    // （変異検査で実際にそうなった）。
    expect(source).toMatch(/^installConsoleGuard\(\);$/mu);
  });
});
