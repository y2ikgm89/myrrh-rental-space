import "server-only";

import { DomainError } from "@/shared/domain/domain-error";
import {
  REAGREE_PATH,
  ReagreeRequiredError,
} from "@/shared/domain/terms/reagree-error";
import {
  getRequiredTermsByScope,
  getReagreeRequiredTermsForCustomer,
} from "@/shared/domain/terms/queries";
import type { TermsScope } from "@/shared/lib/validations/enums/prisma-types";

/**
 * 公開 4 経路 (signup / reservation / inquiry / event-registration) で
 * 「クライアントが claim した同意 termsIds 集合 ⊇ サーバー側 required scope
 * の termsIds 集合」を server-side で強制する gate helper。
 *
 * Curl bypass を物理的に塞ぐ。client gate のみは禁止 (信用しない)。
 *
 * 不足や未公開 id の混入時は `DomainError` を throw して呼出側の
 * `executeAdminMutationResult` / mutation handler が rollback する。
 *
 * 使用例:
 * ```ts
 * await assertAllRequiredTermsAgreed({
 *   scope: TermsScope.RESERVATION,
 *   agreedTermsIds,
 * });
 * ```
 */
export async function assertAllRequiredTermsAgreed(params: {
  readonly scope: TermsScope;
  readonly agreedTermsIds: readonly string[];
}): Promise<{ matchedTermsIds: string[] }> {
  const requiredTerms = await getRequiredTermsByScope(params.scope);
  if (requiredTerms.length === 0) {
    return { matchedTermsIds: [] };
  }

  const agreedSet = new Set(params.agreedTermsIds);
  const missing = requiredTerms.filter((t) => !agreedSet.has(t.id));

  if (missing.length > 0) {
    throw new DomainError("すべての必須規約への同意が必要です", "VALIDATION");
  }

  return {
    matchedTermsIds: requiredTerms.map((t) => t.id),
  };
}

/**
 * 認証済み顧客に対する LOGIN_SIGNUP scope 再同意 gate (Phase 2)。
 *
 * MypageAuthGate + /mypage/terms/reagree (Phase 1) は UI 経由の顧客を通せない
 * 一方で、`/reservation` などの公開 route と mypage 系 Server Action は curl 直叩き
 * で bypass 可能なため、customer 認証済みの Server Action handler 冒頭で本 helper を
 * 呼び defense-in-depth する。
 *
 * `getReagreeRequiredTermsForCustomer` は差分検出 (`TermsAgreement.contentHash` vs
 * 現行 `TermsDocument.contentHtml` の sha256) を行い、pending doc があれば返す。
 * pending > 0 なら `DomainError` を throw し、既存 action の catch 節が
 * `MutationError` / `submission.reply({formErrors})` に変換して client に伝搬する。
 *
 * 呼出は `assertCustomerActive(customerId)` の直後 (customer が確定した後) が canonical。
 * guest 経路 (未認証) では customer が居ないので呼ばない。
 */
export async function assertLoginSignupReagreed(
  customerId: string,
): Promise<void> {
  const pending = await getReagreeRequiredTermsForCustomer(customerId);
  if (pending.length > 0) {
    // 専用型を投げる（監査 A-79）。`code` は `FORBIDDEN` のままなので
    // 既存の分岐は変わらず、**区別したい場所だけ**が区別できる。
    throw new ReagreeRequiredError(
      `利用規約が更新されています。マイページで再同意してください: ${REAGREE_PATH}`,
    );
  }
}
