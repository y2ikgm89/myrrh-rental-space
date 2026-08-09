import { test, expect } from "../fixtures/e2e-test";
import {
  acquireTurnstileToken,
  TURNSTILE_TOKEN_MAX_ATTEMPTS,
  turnstileTokenInput,
} from "../helpers/turnstile";

/**
 * Turnstile widget の stall からの回復 (`acquireTurnstileToken`)
 *
 * ## 何を守るテストか
 *
 * Turnstile を stub しない spec（`events-registration-toctou-capacity-1` /
 * `reservation-submit.smoke`）は hidden input に成功トークンが書かれるのを待つ。
 * この待ちが CI で稀に丸ごと空振りする —— **widget は render されている（Cloudflare の
 * api.js が `cf-chl-widget-*_response` の hidden input を作る）のに challenge iframe が
 * 一度も描画されず、値が永久に空のまま**という壊れ方をする。
 *
 * 実測 (run 31288341839 attempt 1、`events-registration-toctou-capacity-1`):
 * hidden input は 15 秒間 33 回とも解決できていて値だけが `""`、失敗時スクリーンショットの
 * widget 領域は `appearance: "always"` にもかかわらず完全な空白だった。
 * 同じ test の正常時は**全体で 13.4 秒**（= トークン取得は 1〜2 秒）なので、
 * 分布は「ほぼ即時 or 永久に来ない」の二峰性であり、**待ち時間を延ばしても解決しない**。
 *
 * 回復手段は「その document を捨ててページを作り直す」こと。widget の
 * `retry: "auto"`（`src/shared/components/turnstile-widget.tsx`）は challenge が
 * **エラーを返した**ときにしか働かず、iframe が来ないまま黙って止まった widget は
 * 自己回復しない。
 *
 * ## このテストが vacuous にならない理由
 *
 * `expect(attemptsUsed).toBe(STALLED_LOADS + 1)` は「2 回目で取れた」ことまで要求する。
 * もし route による stall 注入が効かなければ 1 回目で取れて `1` になり
 * **このテストが落ちる**。つまり注入が空振りしたら silent pass ではなく赤になる。
 * `maxAttempts` を渡さず実運用の既定を使うので、既定が 1 に戻された場合も落ちる
 * （変異検査で確認済み: 既定 1 → 赤 / 既定 2 → 緑）。
 *
 * stall の注入は「api.js だけ通し、それ以外の challenges.cloudflare.com を落とす」形にする。
 * api.js のパス（`/turnstile/v0/api.js`）は Cloudflare 公式ドキュメントに載る安定した
 * 公開 API で、challenge iframe 側の内部パスには依存しない。
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */

/** Turnstile 由来の全リクエスト。api.js と challenge iframe の両方を含む。 */
const TURNSTILE_ORIGIN_GLOB = "https://challenges.cloudflare.com/**";

/** Cloudflare 公式の script エンドポイント。これだけは stall 中も通す。 */
const TURNSTILE_API_JS = /\/turnstile\/v0\/api\.js/u;

/**
 * stall を注入する回。1 = 初回ロードだけ challenge を落とす。
 */
const STALLED_LOADS = 1;

/**
 * 1 attempt あたりの待ち。実運用の既定 (`TURNSTILE_TOKEN_ATTEMPT_TIMEOUT_MS`) より
 * 短く取る —— このテストは「stall を検出してやり直せるか」だけを見るので、
 * **意図的な**空振りに実運用値ぶん掛ける必要が無い。
 *
 * 下限はトークン取得の実測から決める。ローカル実測（production build + test key）は
 * 素の取得 3151ms / stall 後の再ロード 2040ms なので、10 秒は 3 倍以上の余裕がある。
 */
const ATTEMPT_TIMEOUT_MS = 10_000;

/** 遷移・hydration ぶんの固定オーバーヘッド見積り。 */
const NAVIGATION_BUDGET_MS = 20_000;

test.describe("Turnstile トークン取得の stall 回復", () => {
  // 待ちが `TURNSTILE_TOKEN_MAX_ATTEMPTS` 回発生する（1 回目は必ず空振り）。
  // 既定 30s では足りないので定数から導出する。
  //
  // `retries: 0`: stall は route で決定的に注入しているので、retry しても
  // 同じ結果にしかならない（CI の `retries: 2` は無駄な 2 分になる）。
  test.describe.configure({
    retries: 0,
    timeout:
      NAVIGATION_BUDGET_MS + ATTEMPT_TIMEOUT_MS * TURNSTILE_TOKEN_MAX_ATTEMPTS,
  });

  test("challenge が来ない document を捨てて再ロードするとトークンを取得できる", async ({
    page,
    context,
  }) => {
    let loadCount = 0;

    await context.route(TURNSTILE_ORIGIN_GLOB, async (route) => {
      const isApiJs = TURNSTILE_API_JS.test(route.request().url());

      // api.js は常に通す。通さないと `turnstile.render()` 自体が走らず
      // hidden input が生まれないため、再現したい「input はあるのに空」と
      // 別の壊れ方になる。
      if (isApiJs || loadCount > STALLED_LOADS) {
        await route.continue();
        return;
      }

      await route.abort();
    });

    const attemptsUsed = await acquireTurnstileToken(page, {
      load: async () => {
        loadCount += 1;
        await page.goto("/contact");
      },
      // `maxAttempts` は**渡さない**。実運用の既定
      // (`TURNSTILE_TOKEN_MAX_ATTEMPTS`) をそのまま動かすことで、既定値が 1 に
      // 戻されたら（= 本番の 2 spec が黙って回復力を失ったら）このテストが落ちる。
      attemptTimeoutMs: ATTEMPT_TIMEOUT_MS,
    });

    // `STALLED_LOADS` 回空振りしてから取れる、が期待。1 になるなら stall 注入が
    // 効いていない（= このテストが何も検証していない）。
    expect(attemptsUsed).toBe(STALLED_LOADS + 1);
    await expect(turnstileTokenInput(page)).not.toHaveValue("");
  });
});
