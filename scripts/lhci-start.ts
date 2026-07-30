#!/usr/bin/env bun
/**
 * Lighthouse CI 用の本番相当サーバー起動スクリプト。
 *
 * `next start` は NODE_ENV=production で動くため `instrumentation.register()` の
 * `validateProductionEnv()` が走る。ここで env が 1 つでも欠けると register() が throw し、
 * **サーバーは listen したまま全リクエストが 500** になる。Lighthouse からは
 * `ERRORED_DOCUMENT_REQUEST (Status code: 500)` としか見えず原因が判別できない
 * （実際に 2026-07-30 の full CI dispatch がこの状態で fail した）。
 *
 * そのため本スクリプトは 2 つの責務だけを持つ:
 *
 * 1. `scripts/lhci-env.ts` の env 契約を適用する（CI / ローカル共通の SSoT）。
 *    契約の充足は `__tests__/unit/architecture/lighthouse-ci-env.test.ts` が
 *    実際に `validateProductionEnv()` を実行して検証する。
 * 2. `next start` を起動し、`/api/live` が 200 を返すまで待ってから
 *    {@link LHCI_READY_MARKER} を stdout に出す。
 *    Lighthouse CI はこのマーカーを `startServerReadyPattern` で待つ。
 *    Next.js のログ文言（"Ready in ..."）に依存しないため、Next のバージョン更新で
 *    silent に壊れない。`/api/live` は instrumentation 実行後でなければ 200 を
 *    返さないので、register() の throw をここで検出できる。
 *
 * **build はしない**。CI は専用の build step、ローカルは `bun run lhci:local`
 * （build → autorun）を使う。build 出力を `startServerReadyPattern` の監視窓に
 * 含めないことで、ready 判定の誤マッチと timeout を構造的に排除する。
 *
 * @see https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
 */

import {
  applyLhciProductionFallbacks,
  LHCI_BASE_URL,
  LHCI_READY_MARKER,
} from "./lhci-env";

const LIVENESS_URL = `${LHCI_BASE_URL}/api/live`;
const READY_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 500;

async function isServerLive(): Promise<boolean> {
  try {
    const response = await fetch(LIVENESS_URL, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * `/api/live` が 200 を返すまで poll する。
 * server プロセスが先に exit した場合は即座に諦める（無駄に timeout まで待たない）。
 */
async function waitForServerReady(server: {
  exitCode: number | null;
}): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `next start exited with code ${server.exitCode} before becoming ready`,
      );
    }
    if (await isServerLive()) return;
    await Bun.sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Server did not answer 200 on ${LIVENESS_URL} within ${READY_TIMEOUT_MS}ms. ` +
      `instrumentation.register() (validateProductionEnv) likely threw — check the server log above.`,
  );
}

applyLhciProductionFallbacks();

const server = Bun.spawn(["bunx", "--bun", "next", "start"], {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});

const stopServer = (): void => {
  server.kill();
};
process.on("SIGINT", stopServer);
process.on("SIGTERM", stopServer);
process.on("exit", stopServer);

try {
  await waitForServerReady(server);
} catch (error) {
  stopServer();
  console.error(`[lhci-start] ${(error as Error).message}`);
  process.exit(1);
}

console.log(LHCI_READY_MARKER);

process.exit(await server.exited);
