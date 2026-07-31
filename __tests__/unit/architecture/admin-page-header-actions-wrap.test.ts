import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * admin ページヘッダーの操作ボタン列が 390px で折り返すことの gate。
 *
 * ## なぜ機械化するか
 *
 * 「h1 の隣にボタンを並べる列が mobile で横溢れする」は **3 回別々に修正されている**:
 * PR #1714 (`/admin/reservations`)、#1726 (`/admin/faq`)、そして
 * `/admin/events`（本 gate と同時に修正）。いずれも
 * `e2e/authenticated/admin/responsive-shell.spec.ts` が実測で拾ってから 1 ページずつ
 * 直す形になっており、E2E は opt-in の広域 run でしか回らないので発見が遅い。
 *
 * さらに**ボタンの数は権限で変わる**。`/admin/events` は PR #1729 が
 * `event:manage` を付与して「全参加者CSV」が描画されるようになった結果 4 個になり、
 * 390px で 503px を占めて溢れた（run 30631098725 実測: htmlScrollWidth 519 / client 390）。
 * つまり「今は収まっている」は将来の保証にならない。
 *
 * ## 何を検査するか
 *
 * admin のページヘッダーは `flex flex-col gap-4 sm:flex-row sm:items-center` の
 * ラッパーが house pattern（29 箇所）。その直後に現れる操作列
 * （`flex … gap-2`）に `flex-wrap` が無いものを違反とする。
 * 収まっている間 `flex-wrap` は無効果なので、常時付けても副作用は無い。
 *
 * 汎用の「全 flex 行に flex-wrap」は採らない（フォーム内やテーブルセルなど
 * 折り返してはいけない列が admin だけで 170 箇所以上あり偽陽性になる）。
 */

const ADMIN_DASHBOARD_GLOB = "src/app/(admin)/admin/(dashboard)/**/*.tsx";

/** ページヘッダーのラッパー（h1 + 操作列を横並びにする house pattern）。 */
const HEADER_WRAPPER = /flex flex-col gap-4 sm:flex-row sm:items-center/gu;

/** ラッパー直後から操作列を探す走査幅。JSX 1 ブロック分に十分な余裕。 */
const ACTION_SCAN_CHARS = 1200;

/** `className="… flex … gap-2 …"` の操作列。 */
const ACTION_ROW = /className=\{?"[^"]*\bflex\b[^"]*\bgap-2\b[^"]*"/u;

interface Violation {
  readonly file: string;
  readonly className: string;
}

function listAdminDashboardFiles(): string[] {
  return [...new Glob(ADMIN_DASHBOARD_GLOB).scanSync(process.cwd())]
    .map((path) => path.split(sep).join("/"))
    .sort();
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];

  for (const file of listAdminDashboardFiles()) {
    const source = readFileSync(
      join(process.cwd(), ...file.split("/")),
      "utf8",
    );

    for (const header of source.matchAll(HEADER_WRAPPER)) {
      const window = source.slice(
        header.index + header[0].length,
        header.index + header[0].length + ACTION_SCAN_CHARS,
      );
      const actionRow = ACTION_ROW.exec(window);
      if (!actionRow) continue;
      if (actionRow[0].includes("flex-wrap")) continue;
      violations.push({ file, className: actionRow[0] });
    }
  }

  return violations;
}

describe("admin ページヘッダーの操作列は折り返す", () => {
  test("ヘッダー直下の flex gap-2 行に flex-wrap がある", () => {
    const violations = findViolations().map(
      ({ file, className }) => `${file}: ${className}`,
    );

    expect(violations).toEqual([]);
  });

  test("検査対象のヘッダーが実在する（走査が空振りしていない）", () => {
    const headerCount = listAdminDashboardFiles().reduce((total, file) => {
      const source = readFileSync(
        join(process.cwd(), ...file.split("/")),
        "utf8",
      );
      return total + [...source.matchAll(HEADER_WRAPPER)].length;
    }, 0);

    // house pattern が消えたら gate が無言で無効化されるので下限を張る。
    expect(headerCount).toBeGreaterThanOrEqual(20);
  });
});
