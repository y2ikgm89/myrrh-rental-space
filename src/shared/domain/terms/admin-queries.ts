import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import { paginate } from "@/shared/lib/pagination";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";

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
  scopes: true,
  changelog: true,
  showInFooter: true,
  displayOrder: true,
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
  scopes: true,
  changelog: true,
  showInFooter: true,
  displayOrder: true,
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
  scopes: TermsScope[];
  changelog: string | null;
  showInFooter: boolean;
  displayOrder: number;
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
  scopes: TermsScope[];
  changelog: string | null;
  showInFooter: boolean;
  displayOrder: number;
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
    orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
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
 * 管理: TermsDocument 編集の想定影響件数 (現状 hash 未同意者数)。
 *
 * 「保存すると N 名の顧客に再同意を求めます」という admin 側 inline warning
 * の元データ。TERMS-REAGREE-P3B。
 *
 * 判定ロジック:
 *   - 対象 doc の LOGIN_SIGNUP scope 有無を確認し、未含なら影響件数ゼロで即返却
 *   - 現行 `contentHtml` の sha256 hash を計算
 *   - `Customer.isActive: true` の顧客のうち、以下の全てを満たす者は「同意済み」:
 *       (customerId, scope=LOGIN_SIGNUP, contentHash が現行 hash と一致) の
 *       TermsAgreement が 1 件以上存在
 *   - 「同意済みでない active 顧客数」= 影響件数
 *
 * 計算モデルは Phase 1 の `getReagreeRequiredTermsForCustomer` と同じ差分検出
 * (hash 一致 = 同意済み) を全 active customer に集約適用したもの。
 *
 * @returns
 *   `{ affected, totalActiveCustomers, scopeApplies }`
 *   `scopeApplies: false` なら影響件数は常に 0 (LOGIN_SIGNUP scope 外の doc)。
 */
export async function getReagreeAffectedCustomerCount(
  termsId: string,
): Promise<{
  readonly affected: number;
  readonly totalActiveCustomers: number;
  readonly scopeApplies: boolean;
}> {
  const doc = await prisma.termsDocument.findUnique({
    where: { id: termsId },
    select: {
      contentHtml: true,
      scopes: true,
      deletedAt: true,
      isPublished: true,
    },
  });
  if (!doc) {
    return { affected: 0, totalActiveCustomers: 0, scopeApplies: false };
  }

  const totalActiveCustomers = await prisma.customer.count({
    where: { isActive: true },
  });

  const scopeApplies = doc.scopes.includes(TermsScope.LOGIN_SIGNUP);
  if (!scopeApplies) {
    return { affected: 0, totalActiveCustomers, scopeApplies: false };
  }

  const currentHash = createHash("sha256")
    .update(doc.contentHtml)
    .digest("hex");

  // TermsAgreement.customerId は customers への FK を持たない論理参照なので、
  // リレーションフィルタ（`NOT: { termsAgreements: { some: ... } }`）が使えない。
  // 「同意済みの有効顧客」を数えて総数から引く 2 段クエリで同じ値を出す。
  // `notIn` で除外しないのは、同意者数ぶんの id を SQL に載せずに済ませるため。
  const agreedCustomerIds = await prisma.termsAgreement.findMany({
    where: {
      termsId,
      scope: TermsScope.LOGIN_SIGNUP,
      contentHash: currentHash,
      customerId: { not: null },
    },
    select: { customerId: true },
    distinct: ["customerId"],
  });

  const agreedActiveCount =
    agreedCustomerIds.length > 0
      ? await prisma.customer.count({
          where: {
            isActive: true,
            id: {
              in: agreedCustomerIds
                .map((row) => row.customerId)
                .filter((id): id is string => typeof id === "string"),
            },
          },
        })
      : 0;

  return {
    affected: totalActiveCustomers - agreedActiveCount,
    totalActiveCustomers,
    scopeApplies: true,
  };
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
  scope: true,
  resourceId: true,
  ipAddress: true,
  userAgent: true,
  terms: { select: { title: true, slug: true, type: true } },
} as const;

/**
 * 同意記録に顧客の表示情報を貼り直す。
 *
 * `TermsAgreement.customerId` は `customers` への FK を持たない論理参照
 * （証跡テーブルを FK の参照アクションで書き換えさせないため。schema.prisma の
 * TermsAgreement.customerId 参照）なので `include` で引けない。id を集めて 1 回だけ
 * 引き直し Map で合流する。**マージ等で削除済みの顧客は `customer: null` になる** —
 * `customerId` 自体は「誰が同意したか」の証跡として残る。
 */
async function attachAgreementCustomers<
  T extends { readonly customerId: string | null },
>(
  rows: readonly T[],
): Promise<(T & { customer: AdminAgreementListItem["customer"] })[]> {
  const customerIds = [
    ...new Set(
      rows
        .map((row) => row.customerId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  const customers =
    customerIds.length > 0
      ? await prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, lastName: true, firstName: true, email: true },
        })
      : [];
  const byId = new Map(customers.map((customer) => [customer.id, customer]));

  return rows.map((row) => ({
    ...row,
    customer:
      row.customerId === null ? null : (byId.get(row.customerId) ?? null),
  }));
}

export type AdminAgreementListItem = Serialized<{
  id: string;
  termsId: string;
  customerId: string | null;
  guestEmail: string | null;
  contentHash: string;
  agreedAt: Date;
  scope: TermsScope;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
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
  scope?: TermsScope | undefined;
  customerId?: string | undefined;
  guestEmailKeyword?: string | undefined;
  agreedAtFrom?: Date | undefined;
  agreedAtTo?: Date | undefined;
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
    ...(filter.scope !== undefined && { scope: filter.scope }),
    ...(filter.customerId !== undefined && { customerId: filter.customerId }),
    ...(filter.guestEmailKeyword !== undefined &&
      filter.guestEmailKeyword.length > 0 && {
        guestEmail: {
          contains: filter.guestEmailKeyword,
          mode: "insensitive" as const,
        },
      }),
    ...((filter.agreedAtFrom !== undefined ||
      filter.agreedAtTo !== undefined) && {
      agreedAt: {
        ...(filter.agreedAtFrom !== undefined && { gte: filter.agreedAtFrom }),
        ...(filter.agreedAtTo !== undefined && { lte: filter.agreedAtTo }),
      },
    }),
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

  return { items: toPlainArray(await attachAgreementCustomers(items)), total };
}
