import { test as base, type BrowserContext } from "@playwright/test";
import { CLIENT_IP_HEADER, nextClientIp } from "../helpers/client-ip";

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
});

/**
 * `browser.newContext()` で自前に作った context へ client IP を割り当てる。
 *
 * fixture が面倒を見るのは `context` / `request` fixture だけで、手動生成した
 * context には project / `use` のオプションが一切適用されない。並行アクセスを
 * 再現する spec（TOCTOU 系）は 1 context ずつこれを呼ぶ — 呼ばないと全 context が
 * 同一 IP 扱いになり、検証したい競合ではなく rate limit で落ちる。
 */
export async function primeRequestContext(
  context: BrowserContext,
): Promise<void> {
  const info = test.info();

  await context.setExtraHTTPHeaders({
    [CLIENT_IP_HEADER]: nextClientIp(info.parallelIndex, info.config.workers),
  });
}
