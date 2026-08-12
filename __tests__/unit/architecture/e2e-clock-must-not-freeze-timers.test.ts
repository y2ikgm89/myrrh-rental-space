import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { Glob } from "bun";

/**
 * E2E で**時間を止めさせない** gate。
 *
 * ## なぜ
 *
 * `page.clock.install` は `Date` だけでなく `setTimeout` /
 * `requestAnimationFrame` / `performance.now` まで差し替えて時間を止める。
 * 止まった時間の上では **Next.js App Router の client 遷移が確定しない** —
 * RSC のリクエストは飛ぶのに `history.pushState` まで到達せず、URL が変わらない
 * まま固まる。クリック自体は成功するので**例外も出ない**。
 *
 * 実測（CI run 31581209907、`rate-plan-preview.smoke.spec.ts` の trace）:
 *
 * - `click` は成功（例外なし）
 * - `GET /reservation?spaceId=...&_rsc=...` は**発行されている**
 * - それでも `toHaveURL(/\/reservation\?spaceId=/)` が 15 秒 33 回とも
 *   `http://localhost:3000/spaces/coworking-space` のまま失敗
 *
 * 同じリンクを押す他 2 spec（`reservation-submit.smoke` / `reservation-flow`）は
 * 時計を固定しないので一度も落ちていない。prefetch が間に合った run では確定が
 * 同期的に済むため、遅い CI でだけ表面化する flaky として現れる。
 *
 * ## 何を見るか
 *
 * `e2e/**` の spec が `page.clock.install(` を直接呼んでいないこと。日付の固定は
 * `e2e/helpers/fixed-date.ts` の `installFixedDate()` に一本化する。中身は
 * `clock.setFixedTime` で、bundled types いわく
 * 「Makes `Date.now` and `new Date()` return fixed fake time at all times,
 * **keeps all the timers running**」。
 *
 * ## 直し方
 *
 * ```ts
 * import { installFixedDate } from "../helpers/fixed-date";
 * await installFixedDate(page, new Date("2026-07-04T03:00:00.000Z"));
 * ```
 *
 * `page.goto` より前に呼ぶこと（SSR の `minDate` と client の「今日」を揃える）。
 *
 * **タイマーを進める必要が出たら**（`clock.fastForward` / `runFor`）、`install` が
 * 要る。そのときは client 遷移を跨がない設計にしたうえで、この gate の判断を
 * 根拠つきで見直すこと。現在そのような spec は 0 件。
 *
 * ## 既知の粗さ
 *
 * 文字列一致で `page.clock.install(` を探すだけで、`const c = page.clock;
 * c.install(...)` のような間接呼び出しは見ない。現在そのような書き方は 0 件。
 */

const root = process.cwd();

/** 日付固定の唯一の入口。 */
const HELPER = "e2e/helpers/fixed-date.ts";

const FREEZES_TIMERS = /page\.clock\.install\s*\(/u;

function listE2ESpecs(): string[] {
  const glob = new Glob("e2e/**/*.spec.ts");
  return [...glob.scanSync(root)].map((p) => p.split(sep).join("/")).sort();
}

function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

describe("E2E は時間を止めない", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    expect(listE2ESpecs().length).toBeGreaterThan(20);
  });

  test("spec が page.clock.install で時間を止めていない", () => {
    const offenders = listE2ESpecs().filter((rel) =>
      FREEZES_TIMERS.test(read(rel)),
    );

    expect(offenders).toEqual([]);
  });

  test("入口の helper はタイマーを止めない API を使う", () => {
    const source = read(HELPER);

    // `setFixedTime` は Date だけを固定し、タイマーは動かし続ける。
    expect(source).toContain("clock.setFixedTime(");
    expect(source).not.toMatch(FREEZES_TIMERS);
  });

  test("検出の見本（gate の判別力）", () => {
    // 1. 落ちるべき形
    expect(
      FREEZES_TIMERS.test(
        `await page.clock.install({ time: new Date("2026-07-04T03:00:00.000Z") });`,
      ),
    ).toBe(true);
    expect(FREEZES_TIMERS.test(`await page.clock.install({ time });`)).toBe(
      true,
    );

    // 2. 落ちてはいけない形（helper 経由 / Date だけ固定する API）
    expect(FREEZES_TIMERS.test(`await installFixedDate(page, time);`)).toBe(
      false,
    );
    expect(FREEZES_TIMERS.test(`await page.clock.setFixedTime(time);`)).toBe(
      false,
    );
  });
});
