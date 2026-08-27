import { test as base, type BrowserContext } from "@playwright/test";
import { CLIENT_IP_HEADER, nextClientIp } from "../helpers/client-ip";
import { installTurnstileStub } from "./turnstile-stub";

/**
 * 本 repo の E2E が使う `test`（Playwright 公式の "extend the test object" パターン）
 *
 * **`e2e/**` から `@playwright/test` を直接 import してよいのはこのファイルだけ**。
 * `export * from "@playwright/test"` で `expect` / 型もそのまま再輸出するので、
 * spec 側の import 先を差し替えるだけで済む。この一点集中は
 * `__tests__/unit/architecture/e2e-client-ip-allocation.test.ts` が機械強制する。
 *
 * ## auto で効く割当（client IP）
 *
 * `extraHTTPHeaders` option を override し、**テストごとに一意な client IP** を
 * 全リクエスト（page と `request` fixture の両方）へ載せる。理由と割当規約は
 * `e2e/helpers/client-ip.ts` の docstring が SSoT。
 *
 * spec 側に書くことは何も無い。「この spec は rate limit に当たるだろうか」を
 * 人間が判定する必要は無く、判定漏れも起こらない。
 *
 * ## auto で効く差し替え（Turnstile）
 *
 * Cloudflare Turnstile の `api.js` をローカル実装へ向ける。理由と射程は
 * `e2e/fixtures/turnstile-stub.ts` の docstring が SSoT。**spec 側でこの origin を
 * 横取りする配線を書かない** — 後から足したほうが勝つので、spec ごとに挙動が割れる。
 * 強制: `__tests__/unit/architecture/e2e-turnstile-single-owner.test.ts`
 *
 * `browser.newContext()` で自前に作った context には fixture が届かないので、
 * {@link primeE2EContext} を呼ぶ（client IP の割当と同じ理由・同じ入口）。
 *
 * ## 注意: `test.use({ extraHTTPHeaders })` を書かない
 *
 * option を上書きするとこの fixture ごと置き換わり、**client IP が消える**。
 * ヘッダーを足したい場合はこのファイルに option を追加して合成する
 * （`adminIdentity` がその例）。gate が `e2e/**` の
 * `extraHTTPHeaders` / `x-forwarded-for` 直書きを 0 件に保つ。
 *
 * @see https://playwright.dev/docs/test-fixtures
 */
export * from "@playwright/test";

export interface E2ETestOptions {
  /**
   * `x-e2e-admin-identity` に載せるラベル（`undefined` なら送らない）。
   *
   * project 単位で管理者 role を切り替えるための option。ラベル → email の
   * SSoT は `src/shared/domain/admin-auth/e2e-identity.ts`。
   * 生の `extraHTTPHeaders` で渡すと client IP の fixture を潰すため、
   * **必ずこの option 経由**で指定する（`playwright.config.ts` の
   * `chromium-admin-viewer`）。
   */
  adminIdentity: string | undefined;
}

export const test = base.extend<E2ETestOptions>({
  adminIdentity: [undefined, { option: true }],

  extraHTTPHeaders: async ({ adminIdentity }, use, testInfo) => {
    const headers: Record<string, string> = {
      [CLIENT_IP_HEADER]: nextClientIp(
        testInfo.parallelIndex,
        testInfo.config.workers,
      ),
    };

    if (adminIdentity !== undefined) {
      headers["x-e2e-admin-identity"] = adminIdentity;
    }

    await use(headers);
  },

  context: async ({ context }, use) => {
    await installTurnstileStub(context);
    await use(context);
  },

  /**
   * 失敗したテストに **ブラウザ側の例外**を添付する。
   *
   * ## なぜ
   *
   * クライアント側で throw した場合、サーバーには何も残らない。`onRequestError`
   * は発火せず、Next.js の error digest も付かない（digest はサーバー由来の
   * エラーにしか付かない）。artifact に残るのは `error-context.md` の a11y
   * スナップショットと失敗スクショだけで、**例外そのものが失われる**。
   *
   * 実害: Issue #2733（`/admin/reservations/new` が間欠的にエラーバウンダリを
   * 出す）は、「エラーバウンダリが描画されている」ところまでしか分からず、
   * 何が throw したのかに到達できなかった。
   *
   * ## 何を拾うか
   *
   * - `pageerror` — 捕捉されなかった例外（stack つき）
   * - `console` の `error` — React の error boundary ログや自前 logger の出力
   *
   * **成功したテストには添付しない。** CSP 違反や 404 を意図的に起こす spec が
   * あり、常時添付すると成功 run のノイズになる。
   */
  page: async ({ page }, use, testInfo) => {
    const clientErrors: string[] = [];

    page.on("pageerror", (error) => {
      clientErrors.push(
        `[pageerror] ${error.name}: ${error.message}\n${error.stack ?? "(no stack)"}`,
      );
    });
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      clientErrors.push(`[console.error] ${message.text()}`);
    });

    await use(page);

    if (testInfo.status === testInfo.expectedStatus) return;
    if (clientErrors.length === 0) return;

    await testInfo.attach("client-errors", {
      body: clientErrors.join("\n\n"),
      contentType: "text/plain",
    });
  },
});

/**
 * `browser.newContext()` で自前に作った context を fixture と同じ状態にする。
 *
 * fixture が面倒を見るのは `context` / `request` fixture だけで、手動生成した
 * context には project / `use` のオプションも auto fixture も一切適用されない。
 * 並行アクセスを再現する spec（TOCTOU 系）は 1 context ずつこれを呼ぶ。
 *
 * 揃えるのは 2 つ:
 *
 * - **client IP** — 呼ばないと全 context が同一 IP 扱いになり、検証したい競合では
 *   なく rate limit で落ちる
 * - **Turnstile の差し替え** — 呼ばないとその context だけが実 Cloudflare を叩き、
 *   外部依存の flake がそこから戻ってくる
 */
export async function primeE2EContext(context: BrowserContext): Promise<void> {
  const info = test.info();

  await context.setExtraHTTPHeaders({
    [CLIENT_IP_HEADER]: nextClientIp(info.parallelIndex, info.config.workers),
  });
  await installTurnstileStub(context);
}
