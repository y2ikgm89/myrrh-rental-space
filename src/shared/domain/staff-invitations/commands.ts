import "server-only";

import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Role } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import type { InvitationData } from "@/shared/domain/staff-invitations/types";
import { getAppUrl } from "@/shared/lib/constants";
import { sendStaffInvitationEmail } from "@/shared/lib/email/system-emails";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import {
  INVITATION_EXPIRY_DAYS,
  type CreateInvitationInput,
  type SetupPasswordInput,
} from "@/shared/lib/validations/staff-invitation";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function getExpiryDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + INVITATION_EXPIRY_DAYS);
  return date;
}

function toInvitationData(invitation: {
  id: string;
  email: string;
  role: Role;
  name: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}): InvitationData {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    name: invitation.name,
    expiresAt: invitation.expiresAt.toISOString(),
    usedAt: invitation.usedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
  };
}

async function ensureInvitationAvailable(email: string): Promise<void> {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    throw new DomainError(
      "このメールアドレスは既に登録されています",
      "CONFLICT",
    );
  }

  const existingInvitation = await prisma.staffInvitation.findFirst({
    where: {
      email,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (existingInvitation) {
    throw new DomainError(
      "このメールアドレスには既に有効な招待が存在します。再送する場合は一度削除してください。",
      "CONFLICT",
    );
  }
}

async function loadValidInvitationByToken(token: string): Promise<{
  id: string;
  email: string;
  role: Role;
  name: string | null;
  expiresAt: Date;
  usedAt: Date | null;
}> {
  const invitation = await prisma.staffInvitation.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!invitation) {
    throw new DomainError("無効な招待リンクです", "NOT_FOUND");
  }
  if (invitation.usedAt) {
    throw new DomainError("この招待は既に使用されています", "CONFLICT");
  }
  if (invitation.expiresAt < new Date()) {
    throw new DomainError("この招待は有効期限が切れています", "CONFLICT");
  }

  return invitation;
}

async function ensureInvitationDeletable(id: string): Promise<{
  id: string;
  email: string;
  name: string | null;
  usedAt: Date | null;
}> {
  const invitation = await prisma.staffInvitation.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, usedAt: true },
  });

  if (!invitation) {
    throw new DomainError("招待が見つかりません", "NOT_FOUND");
  }
  if (invitation.usedAt) {
    throw new DomainError("使用済みの招待は操作できません", "CONFLICT");
  }

  return invitation;
}

async function sendInvitationEmailOrThrow(params: {
  email: string;
  name: string | null;
  token: string;
  expiresAt: Date;
  invitationId: string;
  operation: "sendInvitation" | "resendInvitation";
}): Promise<void> {
  const setupUrl = `${getAppUrl()}/admin/setup/${params.token}`;
  const emailResult = await sendStaffInvitationEmail({
    to: params.email,
    staffName: params.name ?? params.email,
    setupUrl,
    expiresAt: params.expiresAt,
  });

  if (!emailResult.success) {
    logError(
      new Error(emailResult.error || "Failed to send invitation email"),
      {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: params.operation,
          invitationId: params.invitationId,
          email: params.email,
        },
      },
    );
    throw new DomainError("招待メールの送信に失敗しました", "UNEXPECTED");
  }
}

export async function sendInvitation(
  input: CreateInvitationInput,
  createdBy: string,
): Promise<InvitationData> {
  await ensureInvitationAvailable(input.email);

  const token = generateToken();
  let invitation: Awaited<ReturnType<typeof prisma.staffInvitation.create>>;

  try {
    invitation = await prisma.staffInvitation.create({
      data: omitUndefined({
        email: input.email,
        token,
        role: input.role,
        name: input.name,
        expiresAt: getExpiryDate(),
        createdBy,
      }),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new DomainError(
        "このメールアドレスには既に有効な招待が存在します。再送する場合は一度削除してください。",
        "CONFLICT",
      );
    }
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "createStaffInvitation", email: input.email },
    });
    throw new DomainError("招待の作成に失敗しました", "UNEXPECTED");
  }

  try {
    await sendInvitationEmailOrThrow({
      email: invitation.email,
      name: invitation.name,
      token,
      expiresAt: invitation.expiresAt,
      invitationId: invitation.id,
      operation: "sendInvitation",
    });
  } catch (error) {
    await prisma.staffInvitation.delete({ where: { id: invitation.id } });
    throw error;
  }

  return toInvitationData(invitation);
}

export async function setupPassword(
  input: SetupPasswordInput,
): Promise<{ userId: string }> {
  const invitation = await loadValidInvitationByToken(input.token);
  const hashedPassword = await hashPassword(input.password);

  let user: { id: string };
  try {
    user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: invitation.email,
          name: invitation.name ?? invitation.email.split("@")[0] ?? "スタッフ",
          role: invitation.role,
          emailVerified: true,
        },
      });

      await tx.account.create({
        data: {
          userId: newUser.id,
          accountId: invitation.email,
          providerId: "credential",
          password: hashedPassword,
        },
      });

      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() },
      });

      return { id: newUser.id };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new DomainError(
        "このメールアドレスは既に登録されています",
        "CONFLICT",
      );
    }

    throw error;
  }

  return { userId: user.id };
}

export async function deleteInvitation(id: string): Promise<void> {
  await ensureInvitationDeletable(id);

  await prisma.staffInvitation.delete({
    where: { id },
  });
}

export async function resendInvitation(id: string): Promise<void> {
  const invitation = await ensureInvitationDeletable(id);
  const token = generateToken();
  const expiresAt = getExpiryDate();

  await prisma.staffInvitation.update({
    where: { id },
    data: {
      token,
      expiresAt,
    },
  });

  await sendInvitationEmailOrThrow({
    email: invitation.email,
    name: invitation.name,
    token,
    expiresAt,
    invitationId: id,
    operation: "resendInvitation",
  });
}
