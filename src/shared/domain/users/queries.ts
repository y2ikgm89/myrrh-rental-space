import "server-only";

import { Role } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import type { Prisma } from "@generated/prisma/client";
import type {
  NotificationStaffCandidate,
  UserData,
  UserListParams,
  UserListResult,
  UserStats,
} from "@/shared/domain/users/types";

/** 通知先に指定できる管理ロール（公開ユーザー・顧客を除く）。 */
const NOTIFICATION_STAFF_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.EDITOR,
  Role.VIEWER,
];

/**
 * 通知先ピッカー用に、管理ロールのスタッフ一覧を取得する（ページングなし）。
 */
export async function getNotificationStaffCandidates(): Promise<
  NotificationStaffCandidate[]
> {
  const users = await prisma.user.findMany({
    where: { role: { in: NOTIFICATION_STAFF_ROLES } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  }));
}

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
  const { search, role, sortBy = "createdAt", sortOrder = "desc" } = params;
  const {
    skip,
    take,
    page,
    limit: perPage,
  } = paginate({ page: params.page, limit: params.perPage ?? 20 });

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
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map(toUserData),
    total,
    page,
    perPage,
    totalPages: calcTotalPages(total, perPage),
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

/** ユーザーに紐づくアカウントのプロバイダーID一覧を取得 */
export async function getAccountProviders(userId: string): Promise<string[]> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { providerId: true },
  });
  return accounts.map((a) => a.providerId);
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
