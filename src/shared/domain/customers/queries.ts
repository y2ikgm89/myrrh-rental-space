import "server-only";

import { prisma } from "@/shared/db/prisma";
import type {
  CustomerData,
  CustomerFilters,
  CustomerPagination,
  CustomerSearchResult,
  CustomerStats,
  CustomerWithReservations,
  GetCustomersResult,
} from "@/shared/domain/customers/types";
import type { CustomerWhereInput } from "@/shared/types/prisma";

function buildCustomerWhere(filters: CustomerFilters): CustomerWhereInput {
  const where: CustomerWhereInput = {};

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
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
    ];
  }

  return where;
}

export async function getCustomers(
  filters: CustomerFilters = {},
  pagination: CustomerPagination = {},
): Promise<GetCustomersResult> {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = pagination;
  const where = buildCustomerWhere(filters);

  const [total, customers] = await prisma.$transaction([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        lastName: true,
        firstName: true,
        lastNameKana: true,
        firstNameKana: true,
        email: true,
        phoneNumber: true,
        address: true,
        status: true,
        notes: true,
        totalReservations: true,
        totalSpent: true,
        lastReservationAt: true,
        firstReservationAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const formattedCustomers: CustomerData[] = customers.map((customer) => ({
    id: customer.id,
    lastName: customer.lastName,
    firstName: customer.firstName,
    lastNameKana: customer.lastNameKana,
    firstNameKana: customer.firstNameKana,
    email: customer.email,
    phoneNumber: customer.phoneNumber,
    address: customer.address,
    status: customer.status,
    notes: customer.notes,
    totalReservations: customer.totalReservations,
    totalSpent: customer.totalSpent,
    lastReservationAt: customer.lastReservationAt?.toISOString() ?? null,
    firstReservationAt: customer.firstReservationAt?.toISOString() ?? null,
    isActive: customer.isActive,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  }));

  return {
    customers: formattedCustomers,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getCustomerById(
  id: string,
): Promise<CustomerWithReservations | null> {
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
    email: customer.email,
    phoneNumber: customer.phoneNumber,
    address: customer.address,
    status: customer.status,
    notes: customer.notes,
    totalReservations: customer.totalReservations,
    totalSpent: customer.totalSpent,
    lastReservationAt: customer.lastReservationAt?.toISOString() ?? null,
    firstReservationAt: customer.firstReservationAt?.toISOString() ?? null,
    isActive: customer.isActive,
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
    new: statusCounts.get("NEW") ?? 0,
    regular: statusCounts.get("REGULAR") ?? 0,
    vip: statusCounts.get("VIP") ?? 0,
    inactive: statusCounts.get("INACTIVE") ?? 0,
    blacklist: statusCounts.get("BLACKLIST") ?? 0,
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
      ],
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      email: true,
      phoneNumber: true,
      status: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 10,
  });

  return customers;
}
