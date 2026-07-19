import "server-only";

import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { sendWelcomeEmail } from "@/shared/lib/email/welcome-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { getAppUrl } from "@/shared/lib/constants";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";
import type { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";

/** ensureCustomerLinked で使用する仮名（LINE ログイン時に name がない場合） */
export const CUSTOMER_PLACEHOLDER_NAME = "未設定";

const CUSTOMER_LINK_SELECT = {
  id: true,
  email: true,
  lastName: true,
  firstName: true,
  userId: true,
  isActive: true,
  status: true,
} as const;

export interface LinkedCustomer {
  id: string;
  email: string;
  lastName: string;
  firstName: string;
  userId: string | null;
  isActive: boolean;
  status: CustomerStatus;
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
  if (linked) {
    // 既紐付け顧客でも、ゲスト時に送信したお問い合わせが後から届く可能性があるため
    // 毎回 backfill を試みる (updateMany なので該当なしなら no-op)。
    await backfillGuestInquiriesForCustomer(linked.id, linked.email);
    return { customer: linked, isNew: false };
  }

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

    // INQ-MP-01: ゲスト送信 (未ログイン) の Inquiry.customerId は null で保存されるため、
    // 同一 email で OAuth 登録した直後に紐付ける。email は canonicalize
    // (trim + lowercase) 上で `mode: 'insensitive'` 比較し、大文字小文字/前後空白の
    // 差異でも match する。customerId=null の record のみを対象にする
    // (別 Customer に既紐付け済みのものは絶対に上書きしない)。
    await backfillGuestInquiriesForCustomer(customer.id, customer.email);

    fireAndForget(
      sendWelcomeEmail({
        customerId: customer.id,
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
      if (fallback) {
        await backfillGuestInquiriesForCustomer(fallback.id, fallback.email);
        return { customer: fallback, isNew: false };
      }
    }
    throw e;
  }
}

/**
 * INQ-MP-01: ゲスト (未ログイン) 送信で `customerId: null` のまま保存された
 * Inquiry を、同一 email の Customer に紐付ける。
 *
 * - `customerId: null` の record のみを対象にし、別 Customer に既に紐付いた
 *   record は絶対に上書きしない (誤紐付けの防止)。
 * - email 比較は `mode: 'insensitive'` (case-fold) + `trim` (呼出側 canonical
 *   化) で、大文字小文字と前後空白の差異でも match する。Inquiry テーブル側
 *   には canonical 列がないため per-row の canonicalize は不能で、DB 側の
 *   case-insensitive 比較に頼る。
 * - `updateMany` なので該当 0 件でも例外にはならない。
 */
async function backfillGuestInquiriesForCustomer(
  customerId: string,
  email: string,
): Promise<void> {
  const normalized = normalizeEmailForIdentity(email);
  if (normalized.length === 0) return;

  await prisma.inquiry.updateMany({
    where: {
      customerId: null,
      email: { equals: normalized, mode: "insensitive" },
    },
    data: { customerId },
  });
}
