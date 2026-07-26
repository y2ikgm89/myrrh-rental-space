import "server-only";

import { createHash, createHmac } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { CustomerStatus, EmailDeliveryStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { serverEnv } from "@/shared/lib/env/server";
import type {
  CustomerData,
  CustomerFilters,
  CustomerPagination,
  CustomerSearchResult,
  CustomerSortBy,
  CustomerStats,
  CustomerWithReservationsAndAccount,
  GetCustomersResult,
} from "@/shared/domain/customers/types";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";

type CustomerWhereInput = Prisma.CustomerWhereInput;

function buildCustomerOrderBy(
  sortBy: CustomerSortBy,
  sortOrder: "asc" | "desc",
): Prisma.CustomerOrderByWithRelationInput[] {
  // lastReservationAt / totalSpent は nullable のため nulls: "last" で安定化
  const primary: Prisma.CustomerOrderByWithRelationInput =
    sortBy === "lastReservationAt" || sortBy === "totalSpent"
      ? { [sortBy]: { sort: sortOrder, nulls: "last" } }
      : { [sortBy]: sortOrder };
  // tie-breaker: 同値の場合は更新日時降順で安定化
  return [primary, { updatedAt: "desc" }];
}

function buildCustomerWhere(filters: CustomerFilters): CustomerWhereInput {
  const where: CustomerWhereInput = {};

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }

  if (filters.customerType && filters.customerType !== "ALL") {
    where.customerType = filters.customerType;
  }

  if (typeof filters.isActive === "boolean") {
    where.isActive = filters.isActive;
  }

  if (filters.flaggedOnly) {
    where.flaggedForReviewAt = { not: null };
  }

  if (filters.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: "insensitive" } },
      { lastName: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { phoneNumber: { contains: filters.search, mode: "insensitive" } },
      { companyName: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function getCustomers(
  filters: CustomerFilters = {},
  pagination: CustomerPagination = {},
): Promise<GetCustomersResult> {
  const { sortBy = "createdAt", sortOrder = "desc" } = pagination;
  const { skip, take, page, limit } = paginate(pagination);
  const where = buildCustomerWhere(filters);

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: buildCustomerOrderBy(sortBy, sortOrder),
      skip,
      take,
      select: {
        id: true,
        lastName: true,
        firstName: true,
        lastNameKana: true,
        firstNameKana: true,
        companyName: true,
        customerType: true,
        email: true,
        phoneNumber: true,
        postalCode: true,
        prefecture: true,
        city: true,
        streetAddress: true,
        building: true,
        status: true,
        notes: true,
        totalReservations: true,
        totalSpent: true,
        lastReservationAt: true,
        firstReservationAt: true,
        isActive: true,
        marketingOptIn: true,
        phoneContactOptIn: true,
        userId: true,
        flaggedForReviewAt: true,
        flagReasons: true,
        createdAt: true,
        updatedAt: true,
        reservations: {
          select: { guestLastName: true, guestFirstName: true },
          where: { deletedAt: null, guestLastName: { not: null } },
          orderBy: { createdAt: "desc" as const },
          take: 1,
        },
      },
    }),
  ]);

  const formattedCustomers: CustomerData[] = customers.map((customer) => {
    const latestReservation = customer.reservations[0];
    return {
      id: customer.id,
      lastName: customer.lastName,
      firstName: customer.firstName,
      lastNameKana: customer.lastNameKana,
      firstNameKana: customer.firstNameKana,
      companyName: customer.companyName,
      customerType: customer.customerType,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
      postalCode: customer.postalCode,
      prefecture: customer.prefecture,
      city: customer.city,
      streetAddress: customer.streetAddress,
      building: customer.building,
      status: customer.status,
      notes: customer.notes,
      totalReservations: customer.totalReservations,
      totalSpent: customer.totalSpent,
      lastReservationAt: customer.lastReservationAt?.toISOString() ?? null,
      firstReservationAt: customer.firstReservationAt?.toISOString() ?? null,
      isActive: customer.isActive,
      marketingOptIn: customer.marketingOptIn,
      phoneContactOptIn: customer.phoneContactOptIn,
      userId: customer.userId,
      flaggedForReviewAt: customer.flaggedForReviewAt?.toISOString() ?? null,
      flagReasons: customer.flagReasons,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
      latestGuestName: latestReservation
        ? {
            lastName: latestReservation.guestLastName ?? "",
            firstName: latestReservation.guestFirstName,
          }
        : null,
    };
  });

  return {
    customers: formattedCustomers,
    total,
    page,
    limit,
    totalPages: calcTotalPages(total, limit),
  };
}

export async function getCustomerById(
  id: string,
): Promise<CustomerWithReservationsAndAccount | null> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      reservations: {
        include: {
          space: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          startTime: "desc",
        },
        take: 20,
      },
      eventRegistrations: {
        include: {
          event: {
            select: { id: true, title: true, slug: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      user: {
        select: {
          accounts: {
            select: { providerId: true },
          },
        },
      },
    },
  });

  if (!customer) {
    return null;
  }

  return {
    id: customer.id,
    lastName: customer.lastName,
    firstName: customer.firstName,
    lastNameKana: customer.lastNameKana,
    firstNameKana: customer.firstNameKana,
    companyName: customer.companyName,
    customerType: customer.customerType,
    email: customer.email,
    phoneNumber: customer.phoneNumber,
    postalCode: customer.postalCode,
    prefecture: customer.prefecture,
    city: customer.city,
    streetAddress: customer.streetAddress,
    building: customer.building,
    status: customer.status,
    notes: customer.notes,
    totalReservations: customer.totalReservations,
    totalSpent: customer.totalSpent,
    lastReservationAt: customer.lastReservationAt?.toISOString() ?? null,
    firstReservationAt: customer.firstReservationAt?.toISOString() ?? null,
    isActive: customer.isActive,
    marketingOptIn: customer.marketingOptIn,
    phoneContactOptIn: customer.phoneContactOptIn,
    emailDeliveryStatus: customer.emailDeliveryStatus,
    userId: customer.userId,
    flaggedForReviewAt: customer.flaggedForReviewAt?.toISOString() ?? null,
    flagReasons: customer.flagReasons,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    reservations: customer.reservations.map((reservation) => ({
      id: reservation.id,
      startTime: reservation.startTime.toISOString(),
      endTime: reservation.endTime.toISOString(),
      status: reservation.status,
      totalPrice: reservation.totalPrice,
      space: reservation.space,
    })),
    eventRegistrations: customer.eventRegistrations.map((registration) => ({
      id: registration.id,
      status: registration.status,
      quantity: registration.quantity,
      createdAt: registration.createdAt.toISOString(),
      event: registration.event,
    })),
    user: customer.user
      ? {
          accounts: customer.user.accounts.map((account) => ({
            provider: account.providerId,
          })),
        }
      : null,
  };
}

export async function getCustomerStats(): Promise<CustomerStats> {
  const stats = await prisma.customer.groupBy({
    by: ["status"],
    _count: true,
  });

  const statusCounts = new Map(stats.map((item) => [item.status, item._count]));
  const total = stats.reduce((sum, item) => sum + item._count, 0);

  return {
    total,
    new: statusCounts.get(CustomerStatus.NEW) ?? 0,
    regular: statusCounts.get(CustomerStatus.REGULAR) ?? 0,
    vip: statusCounts.get(CustomerStatus.VIP) ?? 0,
    inactive: statusCounts.get(CustomerStatus.INACTIVE) ?? 0,
    blacklist: statusCounts.get(CustomerStatus.BLACKLIST) ?? 0,
  };
}

export async function searchCustomers(
  query: string,
): Promise<CustomerSearchResult[]> {
  const searchTerm = query.trim();
  if (searchTerm.length < 2) {
    return [];
  }

  const customers = await prisma.customer.findMany({
    where: {
      isActive: true,
      OR: [
        { firstName: { contains: searchTerm, mode: "insensitive" } },
        { lastName: { contains: searchTerm, mode: "insensitive" } },
        { email: { contains: searchTerm, mode: "insensitive" } },
        { phoneNumber: { contains: searchTerm, mode: "insensitive" } },
        { companyName: { contains: searchTerm, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      companyName: true,
      customerType: true,
      email: true,
      phoneNumber: true,
      status: true,
      userId: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 10,
  });

  return customers;
}

/**
 * メールアドレス重複候補チェック（顧客作成・編集フォームの onBlur 用）
 *
 * `excludeId` を渡すと該当 ID を除外して検索（編集時に自分自身の email を許可）。
 * email は所有権キーではないため、候補表示と未リンク guest 重複の事前判定に使う。
 */
export async function findCustomerByEmailExcept(
  email: string,
  excludeId?: string,
): Promise<{ id: string; userId: string | null } | null> {
  const emailCanonical = normalizeEmailForIdentity(email);
  return prisma.customer.findFirst({
    where: {
      emailCanonical,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, userId: true },
  });
}

export async function findGuestCustomerByEmailExcept(
  email: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  const emailCanonical = normalizeEmailForIdentity(email);
  return prisma.customer.findFirst({
    where: {
      emailCanonical,
      userId: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
}

/**
 * sendEmail() の suppression 判定用に、canonical email の **SHA-256 hash 集合**
 * を返す。
 *
 * 2 系統の suppression source の union を返す:
 *
 * 1. `emailDeliveryStatus ∈ {HARD_BOUNCED, COMPLAINED}` の Customer 群 →
 *    `emailCanonical` を hash 化 (通常経路)。
 * 2. `suppressedEmailHash IS NOT NULL` の Customer 群 → 保存済み hash を
 *    そのまま採用 (RESEND-AUDIT M7)。anonymize / merge で emailCanonical が
 *    placeholder に書き換わる際、元の実 email の hash を持ち越すことで、
 *    再登録された同じ実 email への送信を継続的に弾く (sender reputation 保護)。
 *    single-column の直接 hash で再現しないため、`emailDeliveryStatus` の
 *    リセット (RESET-EMAIL-DELIVERY M8) を経由しても suppression は残り続ける
 *    設計 (persistent audit trail)。
 *
 * 呼び出し側は recipient を `hashSuppressedEmailCandidate(email)` で hash して
 * から `.has()` で判定する。
 *
 * ## Cache に **plaintext PII を焼かない**設計 (Codex review, PR #945)
 *
 * 以前 (N16-1 audit の第一段階 fix) は plaintext の `emailCanonical` を Set に
 * 入れて cache していた。cache key からは PII が消えたものの、cache **値**
 * には suppression list 全体の canonical email が plaintext で残っていた
 * (Data Cache 側に PII 残存)。
 *
 * SHA-256 (HMAC 化は PR-K で入る予定) に通した非可逆 hash に変えることで、
 * cache 値からも plaintext を除去する。呼び出し側は既知の canonical email を
 * 同じ hash 関数に通して `.has()` で判定するため、意味論は等価
 * (deterministic hash + Set 判定)。
 *
 * ## Invalidation / 顧客不在の宛先
 *
 * `cacheTag(SUPPRESSED_EMAILS)` で Resend webhook (bounce/complaint) と
 * anonymize / merge の Server Action で invalidate。顧客 DB に存在しない
 * 宛先 (system / staff / inquiry guest) は Set に含まれない → 呼び出し側は
 * 「観測なし＝送信続行」。
 *
 * @see https://nextjs.org/docs/app/api-reference/directives/use-cache
 * @see https://nextjs.org/docs/app/api-reference/functions/revalidateTag
 */
export async function getSuppressedEmailSet(): Promise<Set<string>> {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.SUPPRESSED_EMAILS);

  // Union query: 「emailDeliveryStatus 抑制」 OR 「suppressedEmailHash 保存済み」。
  // 通常 Customer は 1 経路目、anonymized / merged で持ち越された行は 2 経路目で
  // ヒットする。同一 Customer が両方の列を持つケース (匿名化前に COMPLAINED、
  // 匿名化で hash 保存) は placeholder emailCanonical hash と保存 hash の
  // 2 値になるが、後者だけが実 email に一致するため OK (前者は誰にも match しない)。
  const rows = await prisma.customer.findMany({
    where: {
      OR: [
        {
          emailDeliveryStatus: {
            in: [
              EmailDeliveryStatus.HARD_BOUNCED,
              EmailDeliveryStatus.COMPLAINED,
            ],
          },
        },
        { suppressedEmailHash: { not: null } },
      ],
    },
    select: { emailCanonical: true, suppressedEmailHash: true },
  });

  const hashes = new Set<string>();
  for (const row of rows) {
    hashes.add(hashSuppressedEmailCandidate(row.emailCanonical));
    if (row.suppressedEmailHash !== null) {
      hashes.add(row.suppressedEmailHash);
    }
  }
  return hashes;
}

/**
 * suppression 判定用に canonical email を非可逆 hash 化する SSoT。
 *
 * `getSuppressedEmailSet()` (data cache 側) と `sendEmail()` (呼び出し側)
 * の両方でこの関数を通すことで、hash 空間で `.has()` 判定できる。
 * `normalizeEmailForIdentity` の後に必ずこれに通す前提。
 *
 * M6: `SUPPRESSION_HASH_SECRET` が設定されていれば HMAC-SHA256 で keyed hash を
 * 計算し、Data Cache dump からの dictionary attack (共通メールアドレス ~10M件で
 * 全 suppression set を復元可能) を防ぐ。未設定時は plain SHA-256 に fallback
 * （local / test 用）。本番は `validateProductionEnv()` が fail-closed。
 * cache 値は再生成で自動移行するため migration 不要。
 */
export function hashSuppressedEmailCandidate(canonicalEmail: string): string {
  const secret = serverEnv.SUPPRESSION_HASH_SECRET;
  if (secret && secret.length > 0) {
    return createHmac("sha256", secret).update(canonicalEmail).digest("hex");
  }
  return createHash("sha256").update(canonicalEmail).digest("hex");
}

export async function getCustomerByUserId(userId: string) {
  return prisma.customer.findUnique({
    where: { userId },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      lastNameKana: true,
      firstNameKana: true,
      companyName: true,
      customerType: true,
      email: true,
      phoneNumber: true,
      postalCode: true,
      prefecture: true,
      city: true,
      streetAddress: true,
      building: true,
      status: true,
      notes: true,
      totalReservations: true,
      totalSpent: true,
      lastReservationAt: true,
      firstReservationAt: true,
      isActive: true,
      marketingOptIn: true,
      phoneContactOptIn: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * 会員 Customer と同じ emailCanonical を持つ、未リンク (userId=null) かつ
 * 非匿名化の guest Customer が存在するかを返す。
 *
 * email 自動リンクは IDOR になるため行わず、mypage では警告表示のみに使う。
 */
export async function hasUnlinkedGuestCustomerForEmail(params: {
  readonly email: string;
  readonly excludeCustomerId: string;
}): Promise<boolean> {
  if (params.email.length === 0) return false;

  const emailCanonical = normalizeEmailForIdentity(params.email);
  const guest = await prisma.customer.findFirst({
    where: {
      emailCanonical,
      userId: null,
      anonymizedAt: null,
      NOT: { id: params.excludeCustomerId },
    },
    select: { id: true },
  });
  return guest !== null;
}

/**
 * 顧客一斉配信（Phase 4: 顧客管理強化）の送信対象を解決する。
 *
 * 指定された `customerIds` のうち `marketingOptIn: true` の顧客のみ返す
 * （opt-out 済み顧客・存在しない customerId は同意ゲートとして除外）。
 * 呼び出し側 `sendCustomerBroadcast`（`src/shared/lib/email/customer-emails.ts`）が
 * `customerIds.length - 戻り値.length` を excluded としてカウントする。
 */
export async function findCustomersForBroadcast(
  customerIds: string[],
): Promise<{ id: string; email: string }[]> {
  return prisma.customer.findMany({
    where: { id: { in: customerIds }, marketingOptIn: true },
    select: { id: true, email: true },
  });
}
