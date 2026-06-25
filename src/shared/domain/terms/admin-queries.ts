import "server-only";

import { prisma } from "@/shared/db/prisma";
import { paginate } from "@/shared/lib/pagination";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";

/**
 * 管理画面向け規約クエリ
 * キャッシュなし（Server Component で都度取得）
 */

const ADMIN_LIST_SELECT = {
  id: true,
  type: true,
  slug: true,
  title: true,
  isPublished: true,
  publishedAt: true,
  requiredAtReservation: true,
  requiredAtInquiry: true,
  requiredAtSignup: true,
  showInFooter: true,
  footerOrder: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  _count: { select: { agreements: true } },
} as const;

const ADMIN_DETAIL_SELECT = {
  id: true,
  type: true,
  slug: true,
  title: true,
  contentJson: true,
  contentHtml: true,
  isPublished: true,
  publishedAt: true,
  requiredAtReservation: true,
  requiredAtInquiry: true,
  requiredAtSignup: true,
  showInFooter: true,
  footerOrder: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

export type AdminTermsListItem = Serialized<{
  id: string;
  type: string;
  slug: string;
  title: string;
  isPublished: boolean;
  publishedAt: Date | null;
  requiredAtReservation: boolean;
  requiredAtInquiry: boolean;
  requiredAtSignup: boolean;
  showInFooter: boolean;
  footerOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  agreementsCount: number;
}>;

export type AdminTermsDetail = Serialized<{
  id: string;
  type: string;
  slug: string;
  title: string;
  contentJson: unknown;
  contentHtml: string;
  isPublished: boolean;
  publishedAt: Date | null;
  requiredAtReservation: boolean;
  requiredAtInquiry: boolean;
  requiredAtSignup: boolean;
  showInFooter: boolean;
  footerOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}>;

/**
 * 管理: 規約一覧（ソフトデリート除外）
 */
export async function getAdminTermsList(): Promise<AdminTermsListItem[]> {
  const items = await prisma.termsDocument.findMany({
    where: { deletedAt: null },
    orderBy: [{ footerOrder: "asc" }, { title: "asc" }],
    select: ADMIN_LIST_SELECT,
  });

  return toPlainArray(
    items.map((item) => ({
      ...item,
      agreementsCount: item._count.agreements,
    })),
  );
}

/**
 * 管理: 削除済み規約一覧（ゴミ箱）
 */
export async function getDeletedTermsList(): Promise<AdminTermsListItem[]> {
  const items = await prisma.termsDocument.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: ADMIN_LIST_SELECT,
  });

  return toPlainArray(
    items.map((item) => ({
      ...item,
      agreementsCount: item._count.agreements,
    })),
  );
}

/**
 * 管理: 削除済み規約の件数（バッジ表示用）
 */
export async function getDeletedTermsCount(): Promise<number> {
  return prisma.termsDocument.count({
    where: { deletedAt: { not: null } },
  });
}

/**
 * 管理: id で規約取得
 */
export async function getAdminTermsById(
  id: string,
): Promise<AdminTermsDetail | null> {
  const result = await prisma.termsDocument.findUnique({
    where: { id },
    select: ADMIN_DETAIL_SELECT,
  });

  return result ? toPlainObject(result) : null;
}

/**
 * 管理: 同意記録一覧
 */
const AGREEMENT_LIST_SELECT = {
  id: true,
  termsId: true,
  customerId: true,
  guestEmail: true,
  contentHash: true,
  agreedAt: true,
  context: true,
  resourceId: true,
  ipAddress: true,
  terms: { select: { title: true, slug: true, type: true } },
  customer: {
    select: { id: true, lastName: true, firstName: true, email: true },
  },
} as const;

export type AdminAgreementListItem = Serialized<{
  id: string;
  termsId: string;
  customerId: string | null;
  guestEmail: string | null;
  contentHash: string;
  agreedAt: Date;
  context: string;
  resourceId: string | null;
  ipAddress: string | null;
  terms: { title: string; slug: string; type: string };
  customer: {
    id: string;
    lastName: string;
    firstName: string;
    email: string;
  } | null;
}>;

export interface AdminAgreementsFilter {
  termsId?: string | undefined;
  context?: string | undefined;
  customerId?: string | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
}

export async function getAdminAgreements(
  filter: AdminAgreementsFilter = {},
): Promise<{
  items: AdminAgreementListItem[];
  total: number;
}> {
  const { skip, take } = paginate({
    page: filter.page,
    limit: filter.perPage ?? 50,
  });

  const where = {
    ...(filter.termsId !== undefined && { termsId: filter.termsId }),
    ...(filter.context !== undefined && { context: filter.context }),
    ...(filter.customerId !== undefined && { customerId: filter.customerId }),
  };

  const [items, total] = await Promise.all([
    prisma.termsAgreement.findMany({
      where,
      orderBy: { agreedAt: "desc" },
      skip,
      take,
      select: AGREEMENT_LIST_SELECT,
    }),
    prisma.termsAgreement.count({ where }),
  ]);

  return { items: toPlainArray(items), total };
}
