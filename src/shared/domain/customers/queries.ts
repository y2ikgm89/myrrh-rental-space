import "server-only";

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
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 10,
  });

  return customers;
}

/**
 * メールアドレス重複事前チェック（顧客作成・編集フォームの onBlur 用）
 *
 * `excludeId` を渡すと該当 ID を除外して検索（編集時に自分自身の email を許可）。
 * UNIQUE 制約 P2002 失敗を画面上で事前警告するための軽量 lookup。
 */
export async function findCustomerByEmailExcept(
  email: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return prisma.customer.findFirst({
    where: {
      email,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
}

/**
 * sendEmail() の suppression 判定用に bulk fetch する。
 *
 * 引数 `emails` の中で `emailDeliveryStatus` が `HARD_BOUNCED` / `COMPLAINED`
 * の宛先のみを `Set<email>` で返す。N×sequential `findUnique` を 1 回の
 * `findMany` + WHERE IN に置換することで hot path（送信前 check）の DB
 * round-trip を排除する。
 *
 * Next.js 16 公式 `'use cache'` + `cacheTag(SUPPRESSED_EMAILS)` で短期 cache
 * に乗せ、Resend webhook（bounce / complaint 受信）の `revalidateTag` で
 * 即時 invalidate される。`cacheLife("minutes")` は webhook lag を許容する
 * 短期 staleness（最新の bounce 反映までの最大遅延）。
 *
 * 顧客が DB に存在しない宛先（system / staff / inquiry guest）は Set に含まれない
 * → 呼び出し側は「観測なし＝送信続行」として扱う。
 *
 * @see https://nextjs.org/docs/app/api-reference/directives/use-cache
 * @see https://nextjs.org/docs/app/api-reference/functions/revalidateTag
 */
export async function getSuppressedEmailSet(
  emails: readonly string[],
): Promise<Set<string>> {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.SUPPRESSED_EMAILS);

  if (emails.length === 0) return new Set();

  const rows = await prisma.customer.findMany({
    where: {
      email: { in: [...emails] },
      emailDeliveryStatus: {
        in: [EmailDeliveryStatus.HARD_BOUNCED, EmailDeliveryStatus.COMPLAINED],
      },
    },
    select: { email: true },
  });
  return new Set(rows.map((r) => r.email));
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
