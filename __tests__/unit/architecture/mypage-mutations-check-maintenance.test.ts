import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * mypage の書込 Server Action が、必ずメンテナンス判定を通ることの gate。
 *
 * ## なぜ
 *
 * `MaintenanceGate` は**描画層しか塞がない**。メンテナンスモード ON の直前に
 * /mypage/reservations/[id] を開いていた会員（や Server Action を直接 POST する
 * 相手）は、書込をそのまま実行できた（監査 F-38）。
 *
 * `cancelReservationAction` は `applyCancellationSideEffects` まで到達するので、
 * **書込凍結中に Stripe 返金・GCal 削除・顧客/管理者メール・監査ログが発火する**。
 * breaking migration の計画ダウンタイム中にこれが走ると、止めたはずの外部副作用が
 * 動く。
 *
 * 同じ「予約キャンセル」でもゲストのメールリンク経路（/reservation/cancel）は
 * `runGuestTokenMutation` が `getMaintenanceBlock` を**必須フィールド**にして
 * 機械的に強制しているため拒否される。**会員だけが素通り**という非対称だった。
 *
 * ## 何を見るか
 *
 * 対象 action の SSoT を配列で持ち、各関数の本体にメンテナンス判定の呼び出しが
 * あることを見る。粗い判定である旨を認めたうえで、**呼び出しの有無**だけに絞る
 * （順序は `public-mutation-guard-order.test.ts` と同じく静的には見きれない）。
 *
 * 新しい mypage 書込 action を足したら、この配列にも足すこと。足さないと
 * 検査対象に入らず gate は素通りする（`public-mutation-guard-order.test.ts` と
 * 同じ運用）。
 *
 * ## 直し方
 *
 * `MutationResult` を返す action は `getPublicMaintenanceBlockMutation()`、
 * conform 経路（`SubmissionResult`）は handler 先頭で `checkPublicSiteWritable()`。
 * どちらも rate limit より前に置く。
 */

const ACTIONS_DIR = join(
  process.cwd(),
  "src",
  "app",
  "(public)",
  "mypage",
  "_shared",
  "actions",
);

/** 検査対象の SSoT。新しい書込 action を足したらここにも足す。 */
const GUARDED_MYPAGE_MUTATIONS = [
  { file: "reservation.ts", fn: "startCheckoutSessionAction" },
  { file: "reservation.ts", fn: "cancelReservationAction" },
  { file: "reservation.ts", fn: "updateReservationAction" },
  {
    file: "reservation-series.ts",
    fn: "cancelReservationSeriesCustomerAction",
  },
  { file: "inquiry.ts", fn: "replyToInquiryAction" },
] as const;

const MAINTENANCE_CALL =
  /(getPublicMaintenanceBlockMutation|checkPublicSiteWritable|assertPublicSiteWritable)\s*\(/u;

/** `export async function <fn>(` から、次の `\nexport ` までを本体とみなす。 */
function extractFunctionBody(source: string, fn: string): string | null {
  const start = source.indexOf(`export async function ${fn}(`);
  if (start === -1) return null;
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("mypage の書込 action はメンテナンス判定を通る", () => {
  test("gate が空振りしていない", () => {
    // SSoT の各エントリが実在すること。ファイル名や関数名を変えたら落ちる。
    expect(GUARDED_MYPAGE_MUTATIONS.length).toBeGreaterThan(4);
    for (const { file, fn } of GUARDED_MYPAGE_MUTATIONS) {
      const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
      expect(extractFunctionBody(source, fn)).not.toBeNull();
    }

    // 判定の見本（落ちるべき形 / 落ちてはいけない形）。
    const withGuard = `export async function foo() {
      const block = await getPublicMaintenanceBlockMutation();
      if (block) return block;
    }`;
    const withoutGuard = `export async function foo() {
      const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
    }`;
    expect(MAINTENANCE_CALL.test(withGuard)).toBe(true);
    expect(MAINTENANCE_CALL.test(withoutGuard)).toBe(false);
  });

  test("全 action がメンテナンス判定を呼んでいる", () => {
    const offenders = GUARDED_MYPAGE_MUTATIONS.filter(({ file, fn }) => {
      const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
      const body = extractFunctionBody(source, fn);
      return body === null || !MAINTENANCE_CALL.test(body);
    }).map(
      ({ file, fn }) =>
        `${file}: ${fn} がメンテナンス判定を通っていない。MutationResult なら getPublicMaintenanceBlockMutation()、conform なら handler 先頭で checkPublicSiteWritable() を rate limit より前に置くこと`,
    );

    expect(offenders).toEqual([]);
  });
});
