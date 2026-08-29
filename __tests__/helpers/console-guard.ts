import { afterAll, afterEach } from "bun:test";

/**
 * テスト中の「意図しない console 出力」を検出して落とす gate。
 *
 * ## なぜ
 *
 * React は act 忘れ・DOM に渡らない prop・未知のイベントハンドラを
 * `console.error` の警告で知らせる。警告はテストを落とさないので、緑のまま
 * 積み上がる。2026-08-30 時点で `__tests__/unit` 950 本の **成功** ログに
 * 7 件埋もれていた（act 3 / prop 3 / event handler 1）。
 *
 * ランナー（`scripts/run-tests.ts`）は成功したファイルの本文を出さない。
 * 「ログに出ているから誰かが気づく」は成立しないので、落とすしかない。
 *
 * ## 何を見るか
 *
 * `console.error` / `console.warn` の第 1 引数が **文字列で、かつ `[` で
 * 始まらない**もの。
 *
 * アプリと `scripts` のログは第 1 引数を必ず `[LEVEL]` 形の prefix にする
 * （`logError` はテスト環境で `console.error("[Error]", ...)` を呼ぶ。
 * `NODE_ENV === "production"` の JSON 経路を叩くテストは自分で
 * `spyOn(console, "error")` を置いているのでここには来ない）。
 * React / jsdom / ライブラリの警告は英文で始まるので、これで分かれる。
 *
 * ## 直し方
 *
 * - act 警告 → 状態更新を `act()` で包む。非同期解決を待つなら `findBy*` を使う
 * - prop 警告 → DOM 要素へ独自 prop を渡さない（mock の props spread を見直す）
 * - jsdom 未実装 → `__tests__/setup-dom.ts` に polyfill を足す。
 *   **ここに除外リストは作らない**
 * - 出力そのものを検査したいテスト → `spyOn(console, "error")` で差し替える。
 *   差し替えている間は本 gate を通らない
 */

/** アプリと scripts のログが第 1 引数に必ず置く prefix の先頭文字。 */
const APP_LOG_PREFIX = "[";

/** `console.error` / `console.warn` の引数が「意図しない出力」か判定する。 */
export function isUnexpectedConsoleCall(args: readonly unknown[]): boolean {
  const [first] = args;
  if (typeof first !== "string") return false;
  return !first.startsWith(APP_LOG_PREFIX);
}

function formatCall(method: string, args: readonly unknown[]): string {
  const [first] = args;
  if (typeof first !== "string") return `console.${method}: ${String(first)}`;

  // React は `console.error("An update to %s inside a test ...", name, stack)`
  // の形で呼ぶ。`%s` を実引数に埋めないと、どのコンポーネントかが消える。
  let index = 1;
  const substituted = first.replaceAll("%s", () =>
    index < args.length ? String(args[index++]) : "%s",
  );
  return `console.${method}: ${substituted.split("\n")[0] ?? substituted}`;
}

let installed = false;

/**
 * `console.error` / `console.warn` を包み、意図しない出力が出たテストを
 * `afterEach` で落とす。preload から 1 度だけ呼ぶ。
 */
export function installConsoleGuard(): void {
  if (installed) return;
  installed = true;

  const captured: string[] = [];

  // `console[method]` の computed 参照は eslint の `no-console` が解決できず
  // 落ちる。2 つとも明示的に書く。
  const wrap =
    (method: "error" | "warn", original: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      if (isUnexpectedConsoleCall(args)) {
        captured.push(formatCall(method, args));
      }
      original(...args);
    };

  console.error = wrap("error", console.error.bind(console));
  console.warn = wrap("warn", console.warn.bind(console));

  function drain(): void {
    if (captured.length === 0) return;
    const messages = captured.splice(0, captured.length);
    throw new Error(
      [
        `意図しない console 出力が ${String(messages.length)} 件ありました（本文は上のログに出ています）:`,
        ...messages.map((message) => `  - ${message}`),
        "直し方: __tests__/helpers/console-guard.ts の JSDoc を読むこと。",
      ].join("\n"),
    );
  }

  // afterEach: どのテストが出したかを示す。
  // afterAll: 最後のテストの afterEach より後に届いた分（React の非同期更新や
  // unmount 由来）を取りこぼさない。afterEach だけだと、そこが無言の穴になる。
  afterEach(drain);
  afterAll(drain);
}
