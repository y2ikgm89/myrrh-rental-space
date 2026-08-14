/**
 * 権限拒否の監査記録が失敗したときに、痕跡が残ることの検証。
 *
 * == なぜ要るのか ==
 *
 * 呼び出し側 6 箇所すべてが `void logPermissionDenied(...)` だった（監査 F-102）。
 * `void` は「待たない」しか表明しておらず、**reject を黙って捨てる**。
 *
 * 監査行の書込 (`createAuditLog`) は自前で try/catch 済みなので残る。捨てられて
 * いたのは後段の `notifyPermissionDeniedSpikeIfNeeded` — 同一ユーザーの権限拒否
 * スパイク（＝ 権限の総当たり）を検知して運用へ通知する経路で、ここが落ちると
 * **通知も痕跡も何も残らない**。攻撃の兆候だけが黙って消える。
 *
 * == 何を mock し、何を通すか ==
 *
 * 差し替えるのは**外側の境界だけ**（DB 書込と logError、および `after()` を
 * 提供する `next/server`）。`recordPermissionDenied` が `fireAndForget` で
 * 包んでいるか、reject が `logError` に届くか、という判定は本物を通す。
 * `fireAndForget` を mock すると、欠陥のあった箇所そのものが消える。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const logErrorCalls: Array<{ error: Error; context: unknown }> = [];

let spikeCheckBehavior: () => Promise<void> = () => Promise.resolve();
const createAuditLogRecord = mock(() => Promise.resolve());
const notifyPermissionDeniedSpikeIfNeeded = mock(() => spikeCheckBehavior());

const actualErrors = await import("@/shared/lib/errors/server");
mock.module("@/shared/lib/errors/server", () => ({
  ...actualErrors,
  logError: (error: Error, context: unknown) => {
    logErrorCalls.push({ error, context });
  },
}));

// `after()` はリクエストスコープ外で同期 throw する。fireAndForget の
// フォールバック経路（デタッチ実行）を通したいので、throw する本物を残す。
const actualAuditLogCommands =
  await import("@/shared/domain/audit-log/commands");
mock.module("@/shared/domain/audit-log/commands", () => ({
  ...actualAuditLogCommands,
  createAuditLogRecord,
}));

const actualSecurityAlerts =
  await import("@/shared/domain/audit-log/security-alerts");
mock.module("@/shared/domain/audit-log/security-alerts", () => ({
  ...actualSecurityAlerts,
  notifyPermissionDeniedSpikeIfNeeded,
}));

mock.module("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

const { recordPermissionDenied } = await import("@/admin/lib/audit");

/**
 * デタッチされた promise チェーンが決着するまで待つ。
 *
 * `recordPermissionDenied` は同期で返るので、待ち先の promise を掴めない。
 * tick 数を決め打ちすると `createAuditLog` の内部 await の本数に依存して脆くなる
 * ため、条件が満たされるまで macrotask を跨いで待つ。
 */
async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

describe("権限拒否の監査記録", () => {
  beforeEach(() => {
    logErrorCalls.length = 0;
    createAuditLogRecord.mockClear();
    notifyPermissionDeniedSpikeIfNeeded.mockClear();
    spikeCheckBehavior = () => Promise.resolve();
  });

  test("成功時は何もログしない", async () => {
    recordPermissionDenied("user-1", "reservation", "create");
    await waitUntil(
      () => notifyPermissionDeniedSpikeIfNeeded.mock.calls.length > 0,
    );

    expect(createAuditLogRecord).toHaveBeenCalledTimes(1);
    expect(notifyPermissionDeniedSpikeIfNeeded).toHaveBeenCalledTimes(1);
    expect(logErrorCalls).toHaveLength(0);
  });

  test("スパイク通知が落ちたら logError に残る", async () => {
    spikeCheckBehavior = () => Promise.reject(new Error("db is down"));

    recordPermissionDenied("user-1", "reservation", "create", "res-1");
    await waitUntil(() => logErrorCalls.length > 0);

    expect(logErrorCalls).toHaveLength(1);
    expect(logErrorCalls[0]?.error.message).toBe("db is down");
    expect(logErrorCalls[0]?.context).toMatchObject({
      context: {
        operation: "recordPermissionDenied",
        resource: "reservation",
        resourceId: "res-1",
        userId: "user-1",
        attemptedAction: "create",
      },
    });
  });

  test("呼び出し側を同期のまま止めない（await 不要）", () => {
    spikeCheckBehavior = () => Promise.reject(new Error("db is down"));

    // 戻り値が Promise だと、呼び出し側は `void` を書ける = 握り潰しに戻れる。
    const returned: void = recordPermissionDenied(
      "user-1",
      "reservation",
      "create",
    );

    expect(returned).toBeUndefined();
  });
});
