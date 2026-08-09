import { expect, test, type Locator, type Page } from "../fixtures/e2e-test";

/**
 * Turnstile を **stub しない** spec 向けのトークン取得ヘルパー。
 *
 * ## なぜページごと作り直すのか
 *
 * Turnstile の hidden input が埋まるのを単発で待つと、CI で稀に丸ごと空振りする。
 * 壊れ方は「widget は render されているのに challenge が来ない」:
 * Cloudflare の api.js は読み込まれて `cf-chl-widget-*_response` の hidden input を
 * 作るが、challenge iframe が一度も描画されず値が永久に空のままになる。
 *
 * 実測 (run 31288341839 attempt 1、`events-registration-toctou-capacity-1`):
 *
 * - hidden input は 15 秒間 33 回とも解決できていて、値だけが `""` だった
 * - 失敗時スクリーンショットの widget 領域は `appearance: "always"`
 *   (`DEFAULT_TURNSTILE_APPEARANCE`) にもかかわらず完全な空白
 * - 同じ test の正常時は**全体で 13.4 秒**（fixture 生成 2 回 + 3 ページ分の
 *   トークン取得 + 3.1 秒の bot heuristic 待ちを含む）＝トークン取得は 1〜2 秒
 *
 * つまり所要時間の分布は「ほぼ即時 or 永久に来ない」の二峰性で、**待ち時間を
 * 延ばしても救えない**（15→20 秒に増やしても、その間に質量が無い）。
 *
 * 自己回復もしない。widget の `retry: "auto"`
 * (`src/shared/components/turnstile-widget.tsx`) は challenge が**エラーを返した**
 * ときにしか働かず、iframe が来ないまま黙って止まった widget には効かない。
 * 回復手段はその document を捨ててページを作り直すことだけ。
 *
 * ## リトライの置き場所
 *
 * `.claude/rules/testing-e2e.md` の「リトライはナビゲーションの内側で行う」に従い、
 * **1 attempt ごとに `load()` からやり直し、各 attempt にリトライする web-first
 * assertion を与える**。`expect.poll` の predicate に `goto` を入れる形は禁止。
 *
 * ## Playwright の retry では代替できない
 *
 * この待ちを持つ 2 spec（`events-registration-toctou-capacity-1` /
 * `reservation-submit.smoke`）はどちらも `test.describe.configure({ retries: 0 })`
 * で **CI の `retries: 2` を明示的に捨てている**ため、汎用のリトライに救われない。
 * TOCTOU 側が retry を捨てているのは「1 件だけ勝つ」契約を retry で緑にしないため
 * であって、**送信前のトークン取得**にはその制約は掛からない（申込レコードは
 * まだ 1 件も作られていない）。
 *
 * `reservation-submit.smoke` 側は**毎 push の required gate**（`chromium-smoke`）
 * なので、踏むと全 PR が止まる。同 spec の `load()` は予約ウィザードの
 * step 1〜3（日付・時間帯の選択と step 3 の入力）をやり直す —— リロードで
 * reducer 上の選択もフォーム入力も消えるため、埋め直しまで含めないと
 * 「何度呼んでも同じ結果」にならない。
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */

/**
 * widget が自前で描画する hidden input の name。
 *
 * SSoT は `src/shared/components/turnstile-widget.tsx` の
 * `TURNSTILE_TOKEN_FIELD_NAME`（`onVerify` を渡さない利用側では widget が
 * response field を所有する）。
 */
const TURNSTILE_TOKEN_FIELD_NAME = "turnstileToken";

/** 1 回の `load()` あたりのトークン待ち（既定）。 */
export const TURNSTILE_TOKEN_ATTEMPT_TIMEOUT_MS = 15_000;

/** `load()` をやり直す上限（既定 2 = 1 回だけ作り直す）。 */
export const TURNSTILE_TOKEN_MAX_ATTEMPTS = 2;

/**
 * Turnstile が書き込む hidden input。
 *
 * CSS 属性セレクタだが React streaming の staging copy を掴む恐れは無い —
 * この input は **Cloudflare の api.js が hydration 後に client 側で生成する**ため、
 * ストリーミングされた HTML（staging copy の中身）には存在しない。
 */
export function turnstileTokenInput(page: Page): Locator {
  return page.locator(`input[name="${TURNSTILE_TOKEN_FIELD_NAME}"]`);
}

export interface AcquireTurnstileTokenOptions {
  /**
   * ページを**最初から作り直す**処理。`page.goto(...)` と、リロードで消える
   * フォーム入力の再投入をここに書く。attempt ごとに毎回呼ばれる。
   */
  readonly load: () => Promise<void>;
  /** 1 attempt あたりのトークン待ち。既定 {@link TURNSTILE_TOKEN_ATTEMPT_TIMEOUT_MS}。 */
  readonly attemptTimeoutMs?: number;
  /** `load()` の実行回数上限。既定 {@link TURNSTILE_TOKEN_MAX_ATTEMPTS}。 */
  readonly maxAttempts?: number;
}

/**
 * Turnstile の成功トークンが hidden input に入るまで、ページを作り直しながら待つ。
 *
 * @returns トークンを得た attempt 番号（1 始まり）。呼び出し側はこれを
 *   「stall からの回復が実際に起きたか」の検証に使える
 *   （`e2e/public/turnstile-token-recovery.spec.ts`）。
 */
export async function acquireTurnstileToken(
  page: Page,
  options: AcquireTurnstileTokenOptions,
): Promise<number> {
  const attemptTimeoutMs =
    options.attemptTimeoutMs ?? TURNSTILE_TOKEN_ATTEMPT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? TURNSTILE_TOKEN_MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await options.load();

    try {
      await expect(turnstileTokenInput(page)).not.toHaveValue("", {
        timeout: attemptTimeoutMs,
      });
    } catch (cause) {
      if (attempt === maxAttempts) {
        throw new Error(
          `Turnstile のトークンが ${String(maxAttempts)} 回のページロードで一度も ` +
            `hidden input に書かれなかった（1 回あたり ${String(attemptTimeoutMs)}ms 待機）。` +
            "widget は render されているのに challenge が来ない状態が続いている。",
          { cause },
        );
      }
      continue;
    }

    if (attempt > 1) {
      // 回復を**必ず記録に残す**。黙ってリトライすると、外部依存の劣化が
      // 緑のまま進行して気付けなくなる（silent-skip 化）。
      test.info().annotations.push({
        type: "turnstile-stall-recovered",
        description: `Turnstile のトークン取得が ${String(attempt)} 回目のページロードで成功した（${String(attempt - 1)} 回 stall）`,
      });
    }

    return attempt;
  }

  throw new Error(
    `acquireTurnstileToken の maxAttempts は 1 以上である必要がある（受領値: ${String(maxAttempts)}）`,
  );
}
