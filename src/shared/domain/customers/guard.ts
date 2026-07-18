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

// ---------------------------------------------------------------------------
// isCustomerActiveForMypage — mypage の read / write を許可するかの pure 判定
// ---------------------------------------------------------------------------
// - `Customer.isActive === false`（管理側停止）または
//   `Customer.status === BLACKLIST`（予約荒らし対策で status のみ更新される経路）
//   のいずれかに該当した場合、mypage read + Server Action write の両方から締め出す
//   ための SSoT predicate。
// - `assertCustomerActive`（Server Action ガード）と `MypageAuthGate`（SC 描画層）
//   の両方から参照される。read/write で判定基準が乖離すると MYPAGE-AUTH-02 の
//   ような「status=BLACKLIST + isActive=true 顧客が mypage read を素通し」の
//   silent bypass が生じるため、判定を必ず本 helper に集約する。
// ---------------------------------------------------------------------------

export function isCustomerActiveForMypage(customer: {
  readonly isActive: boolean;
  readonly status: CustomerStatus;
}): boolean {
  return customer.isActive && customer.status !== CustomerStatus.BLACKLIST;
}

// ---------------------------------------------------------------------------
// assertCustomerActive — 認証済み顧客のアクション実行前の active/BLACKLIST 判定
// ---------------------------------------------------------------------------
// - customerId から Customer.isActive + Customer.status を単一クエリで検証する。
// - 判定は `isCustomerActiveForMypage` に委譲し、false なら DomainError(FORBIDDEN)
//   を throw する。
// - 該当 Customer が存在しなければ NOT_FOUND を throw する（呼出側は既に
//   `getCustomerByUserId` 等で存在確認済みが前提だが、TOCTOU を潰す）。
// - MypageAuthGate (SC) と同じセマンティクスを Server Action 側でも強制する
//   （OAUTH-BETTER-AUTH-01: セッションレベルの revocation が UI 層でしか効いて
//   いなかった問題への修正）。全 mypage / claim / cancel-by-session の Server
//   Action が `getCustomerByUserId` の直後にこれを呼ぶことを architecture-boundaries
//   の drift gate が強制する。
// ---------------------------------------------------------------------------

const ACCOUNT_SUSPENDED_MESSAGE =
  "このアカウントは現在ご利用いただけません。お手数ですがお問い合わせフォームよりご連絡ください。";

export interface ActiveGuardTx {
  readonly customer: {
    findUnique(
      args: object,
    ): Promise<{ isActive: boolean; status: CustomerStatus } | null>;
  };
}

export async function assertCustomerActive(
  customerId: string,
  tx?: ActiveGuardTx,
): Promise<void> {
  const db = tx ?? prisma;

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { isActive: true, status: true },
  });

  if (!customer) {
    throw new DomainError("顧客情報が見つかりません", "NOT_FOUND");
  }

  if (!isCustomerActiveForMypage(customer)) {
    throw new DomainError(ACCOUNT_SUSPENDED_MESSAGE, "FORBIDDEN");
  }
}
