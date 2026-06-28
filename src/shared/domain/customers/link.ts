import "server-only";

import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { sendWelcomeEmail } from "@/shared/lib/email/welcome-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { getAppUrl } from "@/shared/lib/constants";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";

/** ensureCustomerLinked で使用する仮名（LINE ログイン時に name がない場合） */
export const CUSTOMER_PLACEHOLDER_NAME = "未設定";

const CUSTOMER_LINK_SELECT = {
  id: true,
  email: true,
  lastName: true,
  firstName: true,
  userId: true,
  isActive: true,
} as const;

export interface LinkedCustomer {
  id: string;
  email: string;
  lastName: string;
  firstName: string;
  userId: string | null;
  isActive: boolean;
}

export interface EnsureCustomerLinkedResult {
  customer: LinkedCustomer;
  /** 今回の呼び出しで Customer が新規作成された場合 true */
  isNew: boolean;
}

export async function ensureCustomerLinked(user: {
  id: string;
  email: string;
  name: string;
}): Promise<EnsureCustomerLinkedResult> {
  // 1. userId で紐づけ済み確認
  const linked = await prisma.customer.findUnique({
    where: { userId: user.id },
    select: CUSTOMER_LINK_SELECT,
  });
  if (linked) return { customer: linked, isNew: false };

  // 2. 新規作成（競合状態対策付き）
  // email は連絡先であり本人性の証明ではないため、同じ email の guest Customer を
  // 自動で userId にリンクしない。merge は本人確認/管理者操作の別ワークフローで行う。
  try {
    const customer = await prisma.customer.create({
      data: {
        email: user.email,
        emailCanonical: normalizeEmailForIdentity(user.email),
        lastName: user.name || CUSTOMER_PLACEHOLDER_NAME,
        firstName: "",
        userId: user.id,
      },
      select: CUSTOMER_LINK_SELECT,
    });

    fireAndForget(
      sendWelcomeEmail({
        customerName: customer.lastName ?? user.name ?? "お客様",
        customerEmail: user.email,
        loginUrl: `${getAppUrl()}/mypage`,
      }),
      { operation: "sendWelcomeEmail", category: ErrorCategory.EXTERNAL_API },
    );

    return { customer, isNew: true };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const fallback = await prisma.customer.findUnique({
        where: { userId: user.id },
        select: CUSTOMER_LINK_SELECT,
      });
      if (fallback) return { customer: fallback, isNew: false };
    }
    throw e;
  }
}
