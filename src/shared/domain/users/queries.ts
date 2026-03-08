import "server-only";

import { Role } from "@/shared/db/enums";
import { prisma, type Prisma } from "@/shared/db/prisma";
import type {
  UserData,
  UserListParams,
  UserListResult,
  UserStats,
} from "@/shared/domain/users/types";

function toUserData(user: {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    reservations: number;
    posts: number;
  };
}): UserData {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    image: user.image,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    _count: user._count,
  };
}

export async function getUsers(
  params: UserListParams = {},
): Promise<UserListResult> {
  const {
    page = 1,
    perPage = 20,
    search,
    role,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = params;

  const where = {
    AND: [
      search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
      role && role !== "ALL" ? { role } : {},
    ],
  } satisfies Prisma.UserWhereInput;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        _count: {
          select: {
            reservations: true,
            posts: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map(toUserData),
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  };
}

export async function getUser(id: string): Promise<UserData | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          reservations: true,
          posts: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  return toUserData(user);
}

export async function getUserStats(): Promise<UserStats> {
  const [total, admins, users, recentUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: { role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } },
    }),
    prisma.user.count({ where: { role: Role.USER } }),
    prisma.user.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  return { total, admins, users, recentUsers };
}
