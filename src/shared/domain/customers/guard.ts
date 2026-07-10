import "server-only";

import { prisma } from "@/shared/db/prisma";
import { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";

// ---------------------------------------------------------------------------
// ensureCustomerNotBlacklisted — read-only 拒否判定ガード
// ---------------------------------------------------------------------------
// - customerId があればそれで Customer.status を直接検索する。
// - customerId が無く email があれば、未紐付けゲスト Customer（userId: null）
//   のみを email 一致で検索する（新規作成はしない、read-only）。
// - どちらの検索でも該当 Customer が無ければ no-op（素通り）。
// - status が BLACKLIST なら DomainError(FORBIDDEN) を throw する。
// ---------------------------------------------------------------------------

export interface GuardTx {
  readonly customer: {
    findUnique(args: object): Promise<{ status: CustomerStatus } | null>;
    findFirst(args: object): Promise<{ status: CustomerStatus } | null>;
  };
}

const BLACKLISTED_MESSAGE =
  "現在このご予約を承ることができません。お手数ですがお問い合わせフォームよりご連絡ください。";

export async function ensureCustomerNotBlacklisted(
  params: { customerId?: string | null; email?: string },
  tx?: GuardTx,
): Promise<void> {
  const db = tx ?? prisma;

  const customer = params.customerId
    ? await db.customer.findUnique({
        where: { id: params.customerId },
        select: { status: true },
      })
    : params.email
      ? await db.customer.findFirst({
          where: {
            emailCanonical: normalizeEmailForIdentity(params.email),
            userId: null,
          },
          select: { status: true },
        })
      : null;

  if (customer?.status === CustomerStatus.BLACKLIST) {
    throw new DomainError(BLACKLISTED_MESSAGE, "FORBIDDEN");
  }
}
