import "server-only";

import { createHash } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { CustomerStatus, EmailDeliveryStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
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
 * `emailDeliveryStatus` が `HARD_BOUNCED` / `COMPLAINED` の全 Customer の
 * `emailCanonical` を hash 化して `Set<hexDigest>` で返す。呼び出し側は
 * recipient を `hashSuppressedEmailCandidate(email)` で hash してから
 * `.has()` で判定する。
 *
 * ## Cache に **plaintext PII を焼かない**設計 (Codex review, PR #945)
 *
 * 以前 (N16-1 audit の第一段階 fix) は plaintext の `emailCanonical` を Set に
 * 入れて cache していた。cache key からは PII が消えたものの、cache **値**
 * には suppression list 全体の canonical email が plaintext で残っていた
 * (Data Cache 側に PII 残存)。
 *
 * SHA-256 に通した非可逆 hash に変えることで、cache 値からも plaintext を
 * 除去する。呼び出し側は既知の canonical email を同じ hash 関数に通して
 * `.has()` で判定するため、意味論は等価 (deterministic hash + Set 判定)。
 *
 * ## Invalidation / 顧客不在の宛先
 *
 * `cacheTag(SUPPRESSED_EMAILS)` で Resend webhook (bounce/complaint) の
 * `revalidateTag` で即時 invalidate。顧客 DB に存在しない宛先 (system / staff /
 * inquiry guest) は Set に含まれない → 呼び出し側は「観測なし＝送信続行」。
 *
 * @see https://nextjs.org/docs/app/api-reference/directives/use-cache
 * @see https://nextjs.org/docs/app/api-reference/functions/revalidateTag
 */
export async function getSuppressedEmailSet(): Promise<Set<string>> {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.SUPPRESSED_EMAILS);

  const rows = await prisma.customer.findMany({
    where: {
      emailDeliveryStatus: {
        in: [EmailDeliveryStatus.HARD_BOUNCED, EmailDeliveryStatus.COMPLAINED],
      },
    },
    select: { emailCanonical: true },
  });

  return new Set(
    rows.map((row) => hashSuppressedEmailCandidate(row.emailCanonical)),
  );
}

/**
 * suppression 判定用に canonical email を非可逆 hash 化する SSoT。
 *
 * `getSuppressedEmailSet()` (data cache 側) と `sendEmail()` (呼び出し側)
 * の両方でこの関数を通すことで、hash 空間で `.has()` 判定できる。
 * `normalizeEmailForIdentity` の後に必ずこれに通す前提。
 */
export function hashSuppressedEmailCandidate(canonicalEmail: string): string {
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
