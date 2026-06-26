import "server-only";

import { DomainError } from "@/shared/domain/domain-error";
import { getRequiredTermsByScope } from "@/shared/domain/terms/queries";
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
