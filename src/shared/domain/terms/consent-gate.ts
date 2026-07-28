import "server-only";

import { DomainError } from "@/shared/domain/domain-error";
import {
  getRequiredTermsByScope,
  getReagreeRequiredTermsForCustomer,
} from "@/shared/domain/terms/queries";
import type { TermsScope } from "@/shared/lib/validations/enums/prisma-types";

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

export async function assertLoginSignupReagreed(
  customerId: string,
): Promise<void> {
  const pending = await getReagreeRequiredTermsForCustomer(customerId);
  if (pending.length > 0) {
    throw new DomainError(
      "利用規約が更新されています。マイページで再同意してください: /mypage/terms/reagree",
      "FORBIDDEN",
    );
  }
}
