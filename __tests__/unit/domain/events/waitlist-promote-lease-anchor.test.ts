/**
 * **promote リースの TTL は「取得した瞬間」から数える。**
 *
 * ## なぜ
 *
 * 監査 A-64: `waitlist-expire` の cron は `const now = new Date()` を**リクエスト先頭で
 * 1 回だけ**取り、全イベントのループに同じ値を渡していた。
 * `expireAndPromoteWaitlistForEventCommand` はそれをそのままリースの基準にしていたので、
 * **イベントを 1 件処理するごとに残り TTL が削られる**。
 *
 * `WAITLIST_PROMOTE_LEASE_TTL_MS = 30_000` の根拠は「promote バッチの ITX timeout (20s) を
 * 超える長さ」だが、これは取得時刻基準でしか成立しない。1 件目が 20 秒かかると
 * 2 件目のリースは残り 10 秒で、その直後に最大 20 秒動く作業 tx が始まる。
 *
 * 監査自身が指摘しているとおり、**正しさは 1 段下で守られている**
 * （候補ごとの `updateMany` による atomic claim と xact lock）。二重 promote は起きない。
 * ここで直すのは「リースが自分の作業を覆えていない」という設計上の破れ。
 *
 * ## 何を見るか
 *
 * 1. `now` を渡さないと、書き込まれる `leasedUntil` が**呼び出し時刻**基準になること
 * 2. 古い `now` を渡すと TTL がその分だけ縮むこと（＝渡してはいけない理由）
 * 3. 本番の呼び出し側が第 3 引数を渡していないこと
 *
 * 3 は静的検査。呼び出し側は prisma と外部送信を伴うので、リース 1 本のために
 * そこまで積むと壊れやすいテストになる。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { tryAcquireWaitlistPromoteLease } from "@/shared/domain/events/waitlist-locks";

const CALL_SITE = join(
  process.cwd(),
  "src",
  "shared",
  "domain",
  "events",
  "waitlist-offer-commands.ts",
);

/** `UPDATE events SET waitlist_promote_leased_until = ${leasedUntil}` の第 1 補間値を捕まえる。 */
function createFakeClient(): {
  readonly client: Parameters<typeof tryAcquireWaitlistPromoteLease>[0];
  readonly captured: { leasedUntil?: Date; now?: Date };
} {
  const captured: { leasedUntil?: Date; now?: Date } = {};
  const client = {
    $queryRaw: <T = unknown>(
      _strings: TemplateStringsArray,
      ...values: readonly unknown[]
    ): Promise<T> => {
      captured.leasedUntil = values[0] as Date;
      captured.now = values[2] as Date;
      return Promise.resolve([{ id: "event-1" }] as unknown as T);
    },
    $executeRaw: (): Promise<unknown> => Promise.resolve(undefined),
  };
  return { client, captured };
}

/** 作業 tx の timeout（`waitlist-offer-commands.ts` の `$transaction` オプション）。 */
const WORK_TRANSACTION_TIMEOUT_MS = 20_000;

describe("promote リースの基準時刻（A-64）", () => {
  test("now を渡さなければ取得時刻から TTL を数える", async () => {
    const { client, captured } = createFakeClient();

    const before = Date.now();
    const leasedUntil = await tryAcquireWaitlistPromoteLease(client, "event-1");
    const after = Date.now();

    expect(leasedUntil).not.toBeNull();
    expect(captured.leasedUntil).toBeDefined();

    const remaining = (captured.leasedUntil?.getTime() ?? 0) - after;
    // TTL は 30s。取得時刻基準なら、作業 tx の timeout (20s) を必ず覆う。
    expect(remaining).toBeGreaterThan(WORK_TRANSACTION_TIMEOUT_MS);
    // 取得時刻より前を基準にしていないこと。
    expect(captured.now?.getTime() ?? 0).toBeGreaterThanOrEqual(before);
  });

  test("古い now を渡すと TTL がその分だけ縮む（渡してはいけない理由）", async () => {
    const { client, captured } = createFakeClient();

    // cron 先頭で取った時刻のまま 25 秒経ってから 2 件目を処理した状況。
    const staleNow = new Date(Date.now() - 25_000);
    await tryAcquireWaitlistPromoteLease(client, "event-1", staleNow);

    const remaining = (captured.leasedUntil?.getTime() ?? 0) - Date.now();
    // 残り 5 秒しかなく、直後に始まる 20 秒の作業 tx を覆えない。
    expect(remaining).toBeLessThan(WORK_TRANSACTION_TIMEOUT_MS);
  });

  test("本番の呼び出し側が基準時刻を渡していない", () => {
    const source = readFileSync(CALL_SITE, "utf8");
    const call =
      /tryAcquireWaitlistPromoteLease\(([\s\S]*?)\);/u.exec(source)?.[1] ?? "";

    expect(call.length).toBeGreaterThan(0);
    // 引数は client と eventId の 2 つだけ。`args.now` を戻すとここが落ちる。
    expect(call).toContain("prisma");
    expect(call).toContain("args.eventId");
    expect(call).not.toContain("args.now");
  });
});
