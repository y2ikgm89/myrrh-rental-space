import "server-only";

import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { CustomerType } from "@generated/prisma/enums";

// ---------------------------------------------------------------------------
// Types (moved from commands.ts)
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
// resolveOrCreateCustomer — 3-step resolution (Shopify-style)
// ---------------------------------------------------------------------------
// Step 1: If userId provided, find by userId → return id (no data changes)
// Step 2: Find by email
//   - If found AND linked (userId != null) → return id (no data changes)
//   - If found AND unlinked (userId == null) → data unchanged (別人の可能性),
//     set userId only if provided (login user linking)
//   - If not found → create new
// Step 3: Return customerId
// ---------------------------------------------------------------------------

export async function resolveOrCreateCustomer(
  data: CustomerData,
  tx?: Tx,
): Promise<string> {
  const db = tx ?? prisma;

  // Step 1: userId が提供されている場合、userId で検索 → 見つかればそのまま返す（データ変更なし）
  if (data.userId) {
    const existingByUser = await db.customer.findUnique({
      where: { userId: data.userId },
      select: { id: true },
    });
    if (existingByUser) {
      return existingByUser.id;
    }
  }

  // Step 2: email で検索
  const existingByEmail = await db.customer.findUnique({
    where: { email: data.email },
    select: { id: true, userId: true },
  });

  if (existingByEmail) {
    // リンク済み (userId != null) → データ変更なし、ID のみ返す
    if (existingByEmail.userId != null) {
      return existingByEmail.id;
    }

    // 未リンク (userId == null) → 顧客データは上書きしない（別人の可能性）
    // ログイン済みの場合のみ userId をリンク
    if (data.userId) {
      await db.customer.update({
        where: { id: existingByEmail.id },
        data: { userId: data.userId },
      });
    }

    return existingByEmail.id;
  }

  // Step 3: 新規作成（P2002 競合対策付き — 同一 email の同時リクエスト）
  try {
    const customer = await db.customer.create({
      data: {
        lastName: data.lastName,
        firstName: data.firstName,
        email: data.email,
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
      // 競合で作成に失敗 → email で再検索
      const fallback = await db.customer.findUnique({
        where: { email: data.email },
        select: { id: true },
      });
      if (fallback) return fallback.id;
    }
    throw e;
  }
}
