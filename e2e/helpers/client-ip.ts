/**
 * E2E の client IP 割当（SSoT・純粋ロジック）
 *
 * ## なぜテスト単位で IP を配るのか
 *
 * サーバー側の rate limiter は **IP をトークンにする**。既定のままだと
 * `fullyParallel` × 2 workers で走る全 spec が同一 IP を共有し、
 * 狭い窓を持つ limiter から順に飽和して 429 / 「リクエストが多すぎます」で落ちる。
 * リトライも同じ窓に入るので retry では救えない。
 *
 * | limiter                                  | 予算        | 経路                                    |
 * | ---------------------------------------- | ----------- | --------------------------------------- |
 * | `formSubmitRateLimiter`                  | 5 / 分 / IP | 公開フォームの Server Action            |
 * | `reservationSubmitRateLimiter` 等        | 5 / 分 / IP | 予約 / イベント申込の Server Action     |
 * | `authMutationRateLimiter`                | 20 / 15分   | Better Auth の sign-in / sign-up        |
 * | `apiRateLimiter`                         | 100 / 分    | proxy が `/api/*` に適用                |
 *
 * 実測: CI run 30593381788 (`guest-receipt-single-use`)、30607885778
 * (`calendar-download`)、30681869018 (`inquiry-reply` の返信フォームが
 * 3 attempt 全滅)。
 *
 * かつては「専用 IP が要る spec」を静的に列挙していたが、判定シグナル
 * （`request.*` → download 待ち → Server Action）を後追いするたびに漏れが
 * 見つかったため、**全テストへ無条件に一意な IP を配る**方式へ切り替えた。
 * 割当の適用点は `e2e/fixtures/test.ts` の `extraHTTPHeaders` fixture 1 箇所。
 *
 * ## レーン分割
 *
 * 採番カウンタは worker プロセスごとのモジュール状態なので、素朴に採番すると
 * worker 0 と worker 1 が同じ値を配る。`parallelIndex`（worker スロット。
 * 同時に同じ値を持つ worker は存在しない）でオクテット空間をレーンに割り、
 * レーン内で巡回させることで**同時実行中の衝突をゼロ**にする。
 *
 * 巡回でアドレスが再利用されるのは 1 レーン分（workers=2 なら 127）の
 * テストを消化した後で、1 テストが数秒かかる以上どの limiter の窓
 * （最短 1 分）よりはるかに長い。
 *
 * XFF が client IP として採用されるのは loopback host のときだけ
 * （`src/shared/lib/rate-limit.ts` の `canUseDevelopmentProxyFallback`）なので、
 * 本番の信頼境界はこの割当に影響されない。
 */

/** rate limit のトークンになる client IP を運ぶヘッダー名 */
export const CLIENT_IP_HEADER = "x-forwarded-for";

/** RFC 5737 TEST-NET-3。ドキュメント用に予約され実在しない範囲 */
export const CLIENT_IP_PREFIX = "203.0.113";

/** 使用するオクテット範囲（`.0` / `.255` は避ける） */
export const FIRST_CLIENT_IP_OCTET = 1;
export const LAST_CLIENT_IP_OCTET = 254;

const OCTET_SPACE = LAST_CLIENT_IP_OCTET - FIRST_CLIENT_IP_OCTET + 1;

function laneCountFor(workers: number): number {
  return Math.min(Math.max(Math.trunc(workers), 1), OCTET_SPACE);
}

/** 1 worker あたりに割り当たるアドレス数（この本数を消化すると巡回する） */
export function clientIpLaneSize(workers: number): number {
  return Math.floor(OCTET_SPACE / laneCountFor(workers));
}

/**
 * `parallelIndex` のレーン内 `sequence` 番目のアドレスを返す純粋関数。
 *
 * 同時実行中の worker は `parallelIndex` が必ず異なるため、戻り値は
 * worker 間で衝突しない。
 */
export function clientIpForSlot(
  parallelIndex: number,
  workers: number,
  sequence: number,
): string {
  const laneCount = laneCountFor(workers);
  const laneSize = Math.floor(OCTET_SPACE / laneCount);
  const lane = Math.min(Math.max(Math.trunc(parallelIndex), 0), laneCount - 1);
  const offset = ((Math.trunc(sequence) % laneSize) + laneSize) % laneSize;

  return `${CLIENT_IP_PREFIX}.${FIRST_CLIENT_IP_OCTET + lane * laneSize + offset}`;
}

/** worker プロセスごとの採番カウンタ（`parallelIndex` でレーンが分かれる） */
let sequence = 0;

/** 次の client IP を 1 つ払い出す（テスト単位 / 手動 context 単位で呼ぶ） */
export function nextClientIp(parallelIndex: number, workers: number): string {
  const ip = clientIpForSlot(parallelIndex, workers, sequence);
  sequence += 1;
  return ip;
}
