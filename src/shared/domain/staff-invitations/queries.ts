import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Role } from "@generated/prisma/enums";
import type { InvitationData } from "@/shared/domain/staff-invitations/types";

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

export async function validateInvitationToken(
  token: string,
): Promise<InvitationData | null> {
  const invitation = await prisma.staffInvitation.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
  });

  if (!invitation) {
    return null;
  }

  return toInvitationData(invitation);
}

export async function getPendingInvitations(): Promise<InvitationData[]> {
  const invitations = await prisma.staffInvitation.findMany({
    where: {
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
  });

  return invitations.map(toInvitationData);
}
