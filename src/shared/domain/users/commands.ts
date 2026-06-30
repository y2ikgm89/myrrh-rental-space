import "server-only";

import { Role } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { canInviteRole, canModifyUser } from "@/shared/lib/admin-roles";
import type {
  CreateUserInput,
  UpdateUserInput,
} from "@/shared/lib/validations/user";

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

async function ensureEmailAvailable(
  email: string,
  currentId?: string,
): Promise<void> {
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
    throw new DomainError(
      "このメールアドレスは既に使用されています",
      "CONFLICT",
    );
  }
}

export async function createUser(
  data: CreateUserInput,
  actor: { id: string; role: Role },
): Promise<{ id: string }> {
  if (!canInviteRole(actor.role, data.role)) {
    throw new DomainError(
      "このロールでユーザーを作成する権限がありません",
      "FORBIDDEN",
    );
  }

  await ensureEmailAvailable(data.email);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role,
    },
  });

  return { id: user.id };
}

export async function updateUser(
  id: string,
  data: UpdateUserInput,
  actor: { id: string; role: Role },
): Promise<void> {
  const existing = await ensureUserExists(id);

  // 対象ユーザーの現在のロールを操作できるか
  if (!canModifyUser(actor.role, existing.role)) {
    throw new DomainError(
      "このユーザーを編集する権限がありません",
      "FORBIDDEN",
    );
  }

  // ロール変更を伴う場合、新ロールへの付与権限も必要（特権昇格防止）
  if (data.role !== existing.role && !canInviteRole(actor.role, data.role)) {
    throw new DomainError("このロールに変更する権限がありません", "FORBIDDEN");
  }

  await ensureEmailAvailable(data.email, id);

  await prisma.user.update({
    where: { id },
    data: {
      email: data.email,
      name: data.name,
      role: data.role,
      accounts: {
        deleteMany: {
          providerId: "credential",
        },
      },
    },
  });
}

export async function deleteUser(
  id: string,
  actor: { id: string; role: Role },
): Promise<void> {
  if (actor.id === id) {
    throw new DomainError("自分自身を削除することはできません", "CONFLICT");
  }

  const user = await ensureUserExists(id);

  if (!canModifyUser(actor.role, user.role)) {
    throw new DomainError(
      "このユーザーを削除する権限がありません",
      "FORBIDDEN",
    );
  }

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

/**
 * ロールのみを変更する特権操作（SUPER_ADMIN 専用）
 *
 * 既存の `updateUser` と違い、SUPER_ADMIN の格上げ・格下げを含む全ロール変更に対応。
 * Server Action 側で `checkAdminAuth()` + `user.role === Role.SUPER_ADMIN` を先に通すことで保護する。
 *
 * 追加の domain 不変条件:
 * - 自分自身のロールは変更不可（lockout 防止）
 * - 最後の SUPER_ADMIN を降格不可（UI からの SUPER_ADMIN 復旧経路を保全）
 */
export async function updateUserRole(
  id: string,
  role: Role,
  actor: { id: string; role: Role },
): Promise<{ oldRole: Role; newRole: Role }> {
  if (actor.id === id) {
    throw new DomainError("自分自身のロールは変更できません", "CONFLICT");
  }

  const user = await ensureUserExists(id);

  if (user.role === Role.SUPER_ADMIN && role !== Role.SUPER_ADMIN) {
    const superAdminCount = await prisma.user.count({
      where: { role: Role.SUPER_ADMIN },
    });
    if (superAdminCount <= 1) {
      throw new DomainError(
        "最後のSUPER_ADMINのロールは変更できません",
        "CONFLICT",
      );
    }
  }

  await prisma.user.update({
    where: { id },
    data: { role },
  });

  return {
    oldRole: user.role,
    newRole: role,
  };
}
