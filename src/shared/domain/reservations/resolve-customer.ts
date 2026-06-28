import "server-only";

import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { CustomerType } from "@generated/prisma/enums";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";

// ---------------------------------------------------------------------------
// Types (moved from commands.ts)
// ---------------------------------------------------------------------------

export interface ResolveCustomerTx {
  readonly customer: {
    findUnique(args: object): Promise<{ id: string } | null>;
    findFirst(args: object): Promise<{ id: string } | null>;
    create(args: object): Promise<{ id: string }>;
    update(args: object): Promise<{ id: string }>;
  };
}

export type CustomerData = {
  lastName: string;
  firstName: string;
  email: string;
  phoneNumber?: string | null | undefined;
  companyName?: string | null | undefined;
  customerType?: CustomerType | undefined;
  userId?: string | null | undefined;
};

// ---------------------------------------------------------------------------
// resolveOrCreateCustomer — verified ownership boundary
// ---------------------------------------------------------------------------
// - Authenticated submissions resolve only by userId.
// - Guest submissions resolve only unlinked guest customers by emailCanonical.
// - Submitted email is contact data, not proof of account ownership.
// ---------------------------------------------------------------------------

export async function resolveOrCreateCustomer(
  data: CustomerData,
  tx?: ResolveCustomerTx,
): Promise<string> {
  const db = tx ?? prisma;
  const emailCanonical = normalizeEmailForIdentity(data.email);

  if (data.userId) {
    const existingByUser = await db.customer.findUnique({
      where: { userId: data.userId },
      select: { id: true },
    });
    if (existingByUser) {
      return existingByUser.id;
    }
  } else {
    const existingGuest = await db.customer.findFirst({
      where: { emailCanonical, userId: null },
      select: { id: true },
    });
    if (existingGuest) {
      return existingGuest.id;
    }
  }

  // 新規作成（P2002 競合対策付き — userId or guest emailCanonical の同時リクエスト）
  try {
    const customer = await db.customer.create({
      data: {
        lastName: data.lastName,
        firstName: data.firstName,
        email: data.email,
        emailCanonical,
        phoneNumber: data.phoneNumber || null,
        companyName: data.companyName || null,
        customerType: data.customerType ?? CustomerType.PERSONAL,
        userId: data.userId || null,
      },
      select: { id: true },
    });
    return customer.id;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      if (data.userId) {
        const fallback = await db.customer.findUnique({
          where: { userId: data.userId },
          select: { id: true },
        });
        if (fallback) return fallback.id;
      }

      const fallback = await db.customer.findFirst({
        where: { emailCanonical, userId: null },
        select: { id: true },
      });
      if (fallback) return fallback.id;
    }
    throw e;
  }
}
