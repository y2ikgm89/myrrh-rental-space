import "server-only";

import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { assertLoginSignupReagreed } from "@/shared/lib/terms-consent-gate";

/**
 * ゲストトークン経路向けの customer gate（active/BLACKLIST + 任意で再同意）。
 *
 * ## なぜ必要か
 * mypage / session 経路は `assertCustomerActive` + `assertLoginSignupReagreed` で
 * 停止・BLACKLIST・LOGIN_SIGNUP 再同意 pending を塞ぐ一方、純ゲストトークン経路
 * （session 無し）は従来これらの検査をスキップしていた。予約/申込に `customerId`
 * が紐付く場合、トークン保持者はその顧客のセルフサービス主体とみなすため、
 * session の有無に関わらず active/BLACKLIST を強制する。
 *
 * ## 再同意
 * session がある mutation では mypage と同型に `assertLoginSignupReagreed` を呼ぶ。
 * 領収書 PDF・暗証番号開示など「証跡アクセスは agreement 前提外」
 * (`reagree-allowlist.ts`) に揃える read 系は `requireReagreeWhenSession: false`。
 *
 * 呼出側で member-ownership mismatch を先に拒否すること。
 */
export type AssertGuestTokenCustomerGatesParams = {
  /**
   * 予約/申込に紐付く customerId。
   * null/undefined = 未紐付け（イベント unclaimed 等）→ active は session があるときのみ。
   */
  readonly resourceCustomerId: string | null | undefined;
  /** ログイン中セッションから解決した customerId。無い場合は純ゲスト。 */
  readonly sessionCustomerId?: string | null;
  /**
   * session があるとき LOGIN_SIGNUP 再同意も強制するか。
   * mutation 系は true（default）。証跡/開示 read 系は false。
   */
  readonly requireReagreeWhenSession?: boolean;
};

export async function assertGuestTokenCustomerGates(
  params: AssertGuestTokenCustomerGatesParams,
): Promise<void> {
  const sessionCustomerId = params.sessionCustomerId ?? null;
  const requireReagree = params.requireReagreeWhenSession ?? true;

  if (params.resourceCustomerId) {
    await assertCustomerActive(params.resourceCustomerId);
  } else if (sessionCustomerId) {
    await assertCustomerActive(sessionCustomerId);
  }

  if (sessionCustomerId && requireReagree) {
    await assertLoginSignupReagreed(sessionCustomerId);
  }
}
