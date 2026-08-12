import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { Glob } from "bun";

/**
 * `page.clock.install` を **単独で**呼ばせない gate。
 *
 * ## なぜ
 *
 * 公開面は `LenisProvider` が GSAP ticker（= `requestAnimationFrame` /
 * `performance.now`）で Lenis のスムーススクロールを回している。偽時計は
 * その時間源ごと止めるため、**一度始まったスクロールの easing が永久に
 * 完了しない** — `<html>` に `lenis-scrolling` が張り付いたまま、スクロール
 * 位置が中途半端な値で漂い続ける。
 *
 * その状態で Playwright の座標クリック（`scrollIntoViewIfNeeded` → 座標算出 →
 * dispatch）を撃つと、算出と dispatch の間にページが動いて対象を外し、
 * **エラーも出ないままクリックだけが無効になる**。
 *
 * 実測（CI run 31578113849、`rate-plan-preview.smoke.spec.ts`）: 「Reserve this
 * space」を押しても遷移せず、`toHaveURL` が 15 秒 33 回とも
 * `class="lenis lenis-scrolling"` のまま失敗。同じリンクを押す他 2 spec
 * （`reservation-submit.smoke` / `reservation-flow`）は時計を固定しないので
 * 一度も落ちていない。ローカル A/B でも、時計固定時だけ `lenis-scrolling` が
 * 5 秒観測しても消えないことを確認している。
 *
 * ## 何を見るか
 *
 * `e2e/**` の spec が `page.clock.install(` を直接呼んでいないこと。時刻固定は
 * `e2e/helpers/frozen-clock.ts` の `installFrozenClock()` に一本化する
 * （`emulateMedia({ reducedMotion: "reduce" })` を必ず先に落とすので、
 * `LenisProvider` が**アプリ自身の既存の分岐**で初期化を見送る）。
 *
 * ## 直し方
 *
 * ```ts
 * import { installFrozenClock } from "../helpers/frozen-clock";
 * await installFrozenClock(page, new Date("2026-07-04T03:00:00.000Z"));
 * ```
 *
 * `page.goto` より前に呼ぶこと（`LenisProvider` は mount 時に 1 度だけ
 * `prefersReducedMotion()` を読む）。
 *
 * ## 既知の粗さ
 *
 * 文字列一致で `page.clock.install(` を探すだけで、`const c = page.clock;
 * c.install(...)` のような間接呼び出しは見ない。現在そのような書き方は 0 件。
 */

const root = process.cwd();

/** 時刻固定の唯一の入口。ここだけは `clock.install` を直接呼んでよい。 */
const HELPER = "e2e/helpers/frozen-clock.ts";

const DIRECT_CLOCK_INSTALL = /page\.clock\.install\s*\(/u;

function listE2ESpecs(): string[] {
  const glob = new Glob("e2e/**/*.spec.ts");
  return [...glob.scanSync(root)].map((p) => p.split(sep).join("/")).sort();
}

function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

describe("時刻固定はスムーススクロール無効化とセットにする", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    expect(listE2ESpecs().length).toBeGreaterThan(20);
  });

  test("spec が page.clock.install を直接呼んでいない", () => {
    const offenders = listE2ESpecs().filter((rel) =>
      DIRECT_CLOCK_INSTALL.test(read(rel)),
    );

    expect(offenders).toEqual([]);
  });

  test("入口の helper が reducedMotion を clock より先に落としている", () => {
    const source = read(HELPER);

    const emulate = source.indexOf('emulateMedia({ reducedMotion: "reduce" })');
    const install = source.indexOf("page.clock.install(");

    // 順序が入れ替わると意味を失う。`LenisProvider` は mount 時に 1 度だけ
    // `prefersReducedMotion()` を読むので、後から落としても初期化は止まらない。
    expect(emulate).toBeGreaterThanOrEqual(0);
    expect(install).toBeGreaterThan(emulate);
  });

  test("検出の見本（gate の判別力）", () => {
    // 1. 落ちるべき形
    expect(
      DIRECT_CLOCK_INSTALL.test(
        `await page.clock.install({ time: new Date("2026-07-04T03:00:00.000Z") });`,
      ),
    ).toBe(true);
    expect(
      DIRECT_CLOCK_INSTALL.test(`await page.clock.install({ time });`),
    ).toBe(true);

    // 2. 落ちてはいけない形（helper 経由 / 別の clock API）
    expect(
      DIRECT_CLOCK_INSTALL.test(`await installFrozenClock(page, time);`),
    ).toBe(false);
    expect(
      DIRECT_CLOCK_INSTALL.test(`await page.clock.fastForward(1000);`),
    ).toBe(false);
  });
});
