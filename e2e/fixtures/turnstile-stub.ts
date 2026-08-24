import type { BrowserContext } from "./e2e-test";

/**
 * Cloudflare Turnstile の `api.js` をローカル実装に差し替える（E2E 全体で常時有効）。
 *
 * ## なぜ外部依存を切るのか
 *
 * Turnstile を stub しない spec は、テストのたびに `challenges.cloudflare.com`
 * から script を取得し、challenge の往復を待っていた。これが nightly の
 * 恒常的な赤の一因で、壊れ方が 2 通りある:
 *
 * 1. **hidden input はあるが値が空** — api.js は動いたが challenge iframe が
 *    一度も描画されない。分布は「ほぼ即時 or 永久に来ない」の二峰性で、
 *    待ち時間を延ばしても救えない（run 31288341839）
 * 2. **hidden input が存在しない** — api.js の取得自体が失敗し `render()` が
 *    一度も走らない。`element(s) not found` で落ちる（run 32742648876、
 *    `events-registration-toctou-capacity-1` と `turnstile-token-recovery` が同時に）
 *
 * 1 に対しては「ページごと作り直して再試行する」ヘルパーを置いていたが、
 * 2 回作り直しても両方失敗したのが 2 の実測。**リトライは外部依存の代わりに
 * ならない。** サードパーティの bot 対策を CI のクリティカルパスに置くのをやめる。
 *
 * ## サーバー側は既に検証していない
 *
 * `validateTurnstile` は `isE2ESecurityBypassAllowed`（production build +
 * `E2E_RUNTIME=1` + 全 env URL が localhost + リクエスト Host が loopback の
 * AND）のとき即 `{ success: true }` を返す。つまり E2E での token は
 * **サーバーから見て最初から無意味**で、外部往復は「送信ボタンを有効化する」
 * ためだけに存在していた。ここを断っても検証の網は 1 目も減らない。
 *
 * ## 何を差し替え、何を差し替えないか
 *
 * 差し替えるのは **Cloudflare の script だけ**。`TurnstileWidget` /
 * `@marsidev/react-turnstile` / フォーム側の配線は実物のまま動く。
 * したがって「widget が `turnstileToken` の hidden input を作る」「送信ボタンが
 * トークン到着で有効化される」という**自分たちの契約は引き続き E2E で検証される**。
 * 失われるのは「Cloudflare の script がブラウザで動くこと」の確認だけで、
 * それは Cloudflare の責務であり、まさに flake の発生源だった。
 *
 * 実装は Cloudflare 公式のクライアント API（`render` / `reset` / `remove` /
 * `getResponse` / `isExpired` / `ready` と dashed なオプション名）に合わせる。
 * `@marsidev/react-turnstile` が呼ぶのは `render` / `remove` / `getResponse` の
 * 3 つで、渡してくるオプションは `sitekey` / `callback` / `response-field` /
 * `response-field-name` などの**公式表記**（dist を実測）。
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 * @see https://playwright.dev/docs/mock
 */

/** stub が hidden input に書き込むトークン。サーバーは E2E bypass で読まない。 */
export const TURNSTILE_STUB_TOKEN = "e2e-turnstile-stub-token";

/** 差し替え対象のオリジン。ここに出てよい実 URL はこのファイルだけ。 */
export const TURNSTILE_ORIGIN_GLOB = "https://challenges.cloudflare.com/**";

/** 公式 api.js のパス。これ以外（iframe / fpcgi など）は落とす。 */
const TURNSTILE_API_JS_PATH = "/turnstile/v0/api.js";

/**
 * `window.turnstile` のローカル実装。
 *
 * `callback` は `queueMicrotask` で遅らせる。実物も非同期に解決するので、
 * `render()` の同期呼び出し中に React の setState を起こさない形へ揃える
 * （同期で呼ぶと `@marsidev/react-turnstile` が widgetId を保持する前に
 * callback が走り、実物と挙動が変わる）。
 */
const TURNSTILE_STUB_SCRIPT = `(() => {
  const TOKEN = ${JSON.stringify(TURNSTILE_STUB_TOKEN)};
  const widgets = new Map();
  let seq = 0;

  const resolve = (target) =>
    typeof target === "string" ? document.querySelector(target) : target;

  const emit = (options, token) => {
    queueMicrotask(() => {
      if (typeof options.callback === "function") options.callback(token);
    });
  };

  window.turnstile = {
    render(target, options) {
      const container = resolve(target);
      if (!container) {
        throw new Error("[turnstile-stub] render target が見つからない");
      }
      if (!options || !options.sitekey) {
        // sitekey の配線ミスを stub が黙って吸収しないようにする。
        throw new Error("[turnstile-stub] sitekey が渡されていない");
      }
      const id = "turnstile-stub-" + String(++seq);
      let input = null;
      if (options["response-field"] !== false) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = options["response-field-name"] || "cf-turnstile-response";
        input.id = "cf-chl-widget-" + id + "_response";
        input.value = TOKEN;
        container.appendChild(input);
      }
      widgets.set(id, { container, input, options });
      emit(options, TOKEN);
      return id;
    },
    reset(id) {
      const widget = widgets.get(id);
      if (!widget) return;
      if (widget.input) widget.input.value = TOKEN;
      emit(widget.options, TOKEN);
    },
    remove(id) {
      const widget = widgets.get(id);
      if (!widget) return;
      if (widget.input) widget.input.remove();
      widgets.delete(id);
    },
    getResponse(id) {
      return widgets.has(id) ? TOKEN : undefined;
    },
    isExpired() {
      return false;
    },
    execute(target, options) {
      return window.turnstile.render(target, options);
    },
    ready(callback) {
      callback();
    },
  };

  // 公式 api.js は \`?onload=<name>\` で渡された global を読み込み完了時に呼ぶ。
  // @marsidev/react-turnstile はこれと 50ms polling の両方で待つが、
  // 契約どおり呼んでおく（polling ぶんの遅延を作らない）。
  const src = document.currentScript && document.currentScript.src;
  if (src) {
    const onload = new URL(src).searchParams.get("onload");
    if (onload && typeof window[onload] === "function") window[onload]();
  }
})();`;

/**
 * この context の Turnstile 通信をローカル実装へ向ける。
 *
 * `api.js` 以外の `challenges.cloudflare.com` へのリクエスト（challenge iframe
 * など）は落とす。stub の `render()` は iframe を作らないので通常は発生しない。
 */
export async function installTurnstileStub(
  context: BrowserContext,
): Promise<void> {
  await context.route(TURNSTILE_ORIGIN_GLOB, async (route) => {
    if (new URL(route.request().url()).pathname !== TURNSTILE_API_JS_PATH) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: TURNSTILE_STUB_SCRIPT,
    });
  });
}
