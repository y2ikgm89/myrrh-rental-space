import "server-only";

import { hashPassword } from "better-auth/crypto";
import { Role } from "@/shared/db/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import type { CreateUserInput, UpdateUserInput } from "@/admin/lib/validations/user";

async function ensureUserExists(id: string): Promise<{
  id: string;
  role: Role;
  reservations: number;
  posts: number;
}> {
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
    throw new DomainError("ユーザーが見つかりません", "NOT_FOUND");
  }

  return {
    id: user.id,
    role: user.role,
    reservations: user._count.reservations,
    posts: user._count.posts,
  };
}

async function ensureEmailAvailable(email: string, currentId?: string): Promise<void> {
  const existing = currentId
    ? await prisma.user.findFirst({
        where: {
          email,
          NOT: { id: currentId },
        },
        select: { id: true },
      })
    : await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

  if (existing) {
    throw new DomainError("このメールアドレスは既に使用されています", "CONFLICT");
  }
}

export async function createUser(
  data: CreateUserInput,
): Promise<{ id: string }> {
  await ensureEmailAvailable(data.email);
  const hashedPassword = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role,
      accounts: {
        create: {
          accountId: data.email,
          providerId: "credential",
          password: hashedPassword,
        },
      },
    },
  });

  return { id: user.id };
}

export async function updateUser(
  id: string,
  data: UpdateUserInput,
): Promise<void> {
  await ensureUserExists(id);
  await ensureEmailAvailable(data.email, id);

  const hashedPassword =
    data.password && data.password.length >= 8
      ? await hashPassword(data.password)
      : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
      },
    });

    const credentialAccount = await tx.account.findFirst({
      where: {
        userId: id,
        providerId: "credential",
      },
      select: { id: true },
    });

    if (credentialAccount) {
      await tx.account.update({
        where: { id: credentialAccount.id },
        data: {
          accountId: data.email,
          ...(hashedPassword ? { password: hashedPassword } : {}),
        },
      });
      return;
    }

    if (hashedPassword) {
      await tx.account.create({
        data: {
          userId: id,
          accountId: data.email,
          providerId: "credential",
          password: hashedPassword,
        },
      });
    }
  });
}

export async function deleteUser(
  id: string,
  actorUserId: string,
): Promise<void> {
  if (actorUserId === id) {
    throw new DomainError("自分自身を削除することはできません", "CONFLICT");
  }

  const user = await ensureUserExists(id);
  if (user.reservations > 0 || user.posts > 0) {
    throw new DomainError(
      `このユーザーには予約${user.reservations}件、投稿${user.posts}件が関連付けられています。先に関連データを削除してください`,
      "CONFLICT",
    );
  }

  await prisma.user.delete({
    where: { id },
  });
}

export async function updateUserRole(
  id: string,
  role: Role,
): Promise<{ oldRole: Role; newRole: Role }> {
  const user = await ensureUserExists(id);

  await prisma.user.update({
    where: { id },
    data: { role },
  });

  return {
    oldRole: user.role,
    newRole: role,
  };
}
