import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * Turnstile トークン欄の所有者が常に 1 つであることの gate。
 *
 * ## なぜ機械化するか
 *
 * `TurnstileWidget` は Cloudflare 公式の `response-field-name` で
 * `turnstileToken` の hidden input を自前で描画できる。これは
 * 「reject 応答後に conform 管理下のフィールドを書き換えると、
 * 再バリデーションがサーバーの form-level エラーを消す」問題
 * （「このタイムスロットは満員です」が一度も表示されなかった）への根治策だが、
 * **呼び出し側が自前でトークン欄を描画している画面と併用すると同名フィールドが
 * 二重になり、FormData が配列化して `z.string()` のスキーマが全弾きになる**。
 *
 * 実際 `reservation-form.tsx` は state 由来の `fields.turnstileToken` を
 * 自前で描画しており、widget が無条件に response field を出す実装では
 * 予約送信が壊れる（Codex review, PR #1763）。
 *
 * ## 不変条件
 *
 * 1. `onVerify` を渡す = 呼び出し側がトークンを所有する。widget は field を出さない
 * 2. `onVerify` を渡さない = widget が所有する。呼び出し側は field を描画しない
 * 3. `useInputControl(fields.turnstileToken)` は禁止（上記のエラー消失と、
 *    毎レンダー変わる control 同一性による reset 無限ループ PR #1758 の原因）
 */

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const PUBLIC_TSX_GLOB = "src/app/(public)/**/*.tsx";

/** widget を描画しているファイルの下限。走査が空振りしたら気付けるようにする。 */
const MIN_WIDGET_CONSUMERS = 15;

/**
 * 自前でトークン欄を描画する画面と、その相方の widget。
 *
 * field と widget は**別ファイルにありうる**ので対で持つ。ここに追加するときは
 * widget 側が必ず `onVerify` を渡していること（= 呼び出し側が所有すること）を
 * 確認する。両方が所有すると同名フィールドが二重になり送信が全弾きされる。
 */
const MANUAL_TOKEN_OWNERS = [
  {
    owner: "src/app/(public)/reservation/_components/reservation-form.tsx",
    widget: "src/app/(public)/reservation/_components/customer-step.tsx",
  },
] as const;

/** `<TurnstileWidget ... />` の props 部分だけを取り出す。 */
function widgetPropsOf(source: string): string {
  const start = source.indexOf("<TurnstileWidget");
  if (start === -1) return "";
  const end = source.indexOf("/>", start);
  if (end === -1) return "";
  return source.slice(start, end);
}

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function collectWidgetConsumers(): { path: string; source: string }[] {
  const glob = new Glob(PUBLIC_TSX_GLOB);
  const consumers: { path: string; source: string }[] = [];
  for (const relativePath of glob.scanSync({ cwd: REPO_ROOT })) {
    const source = readSource(relativePath);
    if (!source.includes("<TurnstileWidget")) continue;
    consumers.push({ path: relativePath.replaceAll("\\", "/"), source });
  }
  return consumers;
}

describe("Turnstile トークン欄の所有者は常に 1 つ", () => {
  test("widget 利用箇所を取りこぼしていない", () => {
    expect(collectWidgetConsumers().length).toBeGreaterThanOrEqual(
      MIN_WIDGET_CONSUMERS,
    );
  });

  test("自前でトークン欄を描画するのは既知の 1 画面だけ", () => {
    const owners = [...new Glob(PUBLIC_TSX_GLOB).scanSync({ cwd: REPO_ROOT })]
      .map((relativePath) => relativePath.replaceAll("\\", "/"))
      .filter((relativePath) =>
        readSource(relativePath).includes("fields.turnstileToken"),
      )
      .sort();

    expect(owners).toEqual(MANUAL_TOKEN_OWNERS.map((entry) => entry.owner));
  });

  test("自前でトークン欄を描画する画面の widget は onVerify で所有を宣言している", () => {
    // allowlist に載せるだけでは不十分。相方の widget から `onVerify` が外れると
    // `responseField: onVerify === undefined` が true に転じて widget も同名 field を
    // 出し、自前 field と二重になって送信が全弾きされる（Codex review, PR #1765）。
    // field 側と widget 側は別ファイルなので、対にして両方を検査する。
    const violations = MANUAL_TOKEN_OWNERS.filter(
      ({ widget }) => !widgetPropsOf(readSource(widget)).includes("onVerify="),
    ).map(({ widget }) => widget);

    expect(violations).toEqual([]);
  });

  test("widget の response field は onVerify の有無から導出している", () => {
    const widget = readSource("src/shared/components/turnstile-widget.tsx");

    // `responseField: true` のような無条件 opt-in に戻すと、onVerify を使う
    // 11 箇所すべてで二重描画になる。
    expect(widget).toContain("responseField: onVerify === undefined");
  });

  test("conform 管理下のフィールドにトークンを流し込んでいない", () => {
    const violations = collectWidgetConsumers()
      .filter(({ source }) =>
        source.includes("useInputControl(fields.turnstileToken)"),
      )
      .map(({ path }) => path);

    expect(violations).toEqual([]);
  });
});
