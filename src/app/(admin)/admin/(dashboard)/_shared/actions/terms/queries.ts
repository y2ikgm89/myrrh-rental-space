"use server";

import { prisma } from "@/shared/lib/prisma";
import { TermsStatus } from "@/shared/generated/prisma/enums";
import {
  type TermsWithVersion,
  type TermsDetail,
  type TermsVersionDetail,
  type TermsAgreementItem,
  getTermsTypeDefaults,
} from "@/shared/lib/validations/terms";
import { createSuccess, type ActionResult } from "@/admin/types/server-actions";
import { withPermission } from "@/admin/lib/server-action-helpers";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";

// =============================================================================
// Terms Queries
// =============================================================================

/**
 * 全規約一覧を取得（管理画面用）
 */
export const getTermsList = withPermission<[], TermsWithVersion[]>(
  "terms",
  "read",
)(async (_user): Promise<ActionResult<TermsWithVersion[]>> => {
  const terms = await prisma.terms.findMany({
    include: {
      versions: {
        where: { isCurrentVersion: true },
        take: 1,
        select: {
          id: true,
          version: true,
          contentHtml: true,
          contentJson: true,
          publishedAt: true,
        },
      },
      _count: {
        select: {
          spaces: true,
          agreements: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = terms.map((t) => ({
    id: t.id,
    type: t.type,
    title: t.title,
    slug: t.slug,
    isActive: t.isActive,
    currentVersion: t.versions[0]
      ? {
          id: t.versions[0].id,
          version: t.versions[0].version,
          contentHtml: t.versions[0].contentHtml,
          contentJson: t.versions[0].contentJson,
          publishedAt: t.versions[0].publishedAt!,
        }
      : null,
    _count: {
      spaces: t._count.spaces,
    },
  }));

  return createSuccess("規約一覧を取得しました", result);
});

/**
 * アクティブな規約一覧を取得（ドロップダウン用）
 */
export async function getActiveTermsForSelect(): Promise<
  { id: string; title: string; type: string }[]
> {
  const terms = await prisma.terms.findMany({
    where: {
      isActive: true,
      versions: {
        some: {
          isCurrentVersion: true,
          status: TermsStatus.PUBLISHED,
        },
      },
    },
    select: {
      id: true,
      title: true,
      type: true,
    },
    orderBy: { title: "asc" },
  });

  return toPlainArray(terms);
}

/**
 * 規約タイプからデフォルトのタイトル・スラッグを取得（重複回避付き）
 */
export async function getDefaultsForTermsType(
  type: string,
): Promise<{ title: string; slug: string } | null> {
  const defaults = getTermsTypeDefaults(type);
  if (!defaults) return null;

  // まず基本スラッグが使用可能かチェック
  const existing = await prisma.terms.findUnique({
    where: { slug: defaults.slug },
    select: { id: true },
  });

  if (!existing) {
    return defaults;
  }

  // 重複がある場合、同じプレフィックスのスラッグを検索
  const similarTerms = await prisma.terms.findMany({
    where: {
      slug: { startsWith: defaults.slug },
    },
    select: { slug: true },
  });

  // 使用中の番号を収集
  const usedNumbers = new Set<number>([1]);
  for (const term of similarTerms) {
    const match = term.slug.match(
      new RegExp(`^${RegExp.escape(defaults.slug)}-(\\d+)$`),
    );
    if (match?.[1]) {
      usedNumbers.add(parseInt(match[1], 10));
    }
  }

  // 最小の空き番号を見つける
  let suffix = 2;
  while (usedNumbers.has(suffix)) {
    suffix++;
  }

  return {
    title: `${defaults.title} ${suffix}`,
    slug: `${defaults.slug}-${suffix}`,
  };
}

/**
 * 規約詳細を取得
 */
export const getTermsById = withPermission<[string], TermsDetail | null>(
  "terms",
  "read",
)(async (_user, id): Promise<ActionResult<TermsDetail | null>> => {
  const terms = await prisma.terms.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          status: true,
          publishedAt: true,
          isCurrentVersion: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          spaces: true,
          agreements: true,
        },
      },
    },
  });

  if (!terms) {
    return createSuccess("規約が見つかりませんでした", null);
  }

  return createSuccess("規約詳細を取得しました", toPlainObject(terms));
});

/**
 * 規約バージョン詳細を取得
 */
export const getTermsVersionById = withPermission<
  [string],
  TermsVersionDetail | null
>(
  "terms",
  "read",
)(async (
  _user,
  versionId,
): Promise<ActionResult<TermsVersionDetail | null>> => {
  const version = await prisma.termsVersion.findUnique({
    where: { id: versionId },
  });

  return createSuccess("バージョン詳細を取得しました", toPlainObject(version));
});

// =============================================================================
// Terms Agreement Viewer
// =============================================================================

const AGREEMENTS_PER_PAGE = 20;

// IPアドレスの末尾をマスク（例: 192.168.1.*** ）
function maskIpAddress(ip: string | null): string | null {
  if (!ip) return null;
  const lastDot = ip.lastIndexOf(".");
  if (lastDot === -1) return ip; // IPv6等は未対応→そのまま返す
  return `${ip.slice(0, lastDot + 1)}***`;
}

/**
 * 同意記録一覧を取得（管理画面閲覧用）
 */
export const getTermsAgreements = withPermission<
  [string, number],
  { agreements: TermsAgreementItem[]; total: number }
>(
  "terms",
  "read",
)(async (
  _user,
  termsId,
  page,
): Promise<ActionResult<{ agreements: TermsAgreementItem[]; total: number }>> => {
  const skip = (page - 1) * AGREEMENTS_PER_PAGE;

  const [rawAgreements, total] = await Promise.all([
    prisma.termsAgreement.findMany({
      where: { termsId },
      orderBy: { agreedAt: "desc" },
      skip,
      take: AGREEMENTS_PER_PAGE,
      select: {
        id: true,
        agreedAt: true,
        guestName: true,
        guestEmail: true,
        reservationId: true,
        ipAddress: true,
        version: {
          select: { version: true },
        },
        user: {
          select: { name: true, email: true },
        },
      },
    }),
    prisma.termsAgreement.count({ where: { termsId } }),
  ]);

  const agreements: TermsAgreementItem[] = rawAgreements.map((a) => ({
    id: a.id,
    agreedAt: a.agreedAt.toISOString(),
    version: a.version.version,
    guestName: a.guestName,
    guestEmail: a.guestEmail,
    userName: a.user?.name ?? null,
    userEmail: a.user?.email ?? null,
    reservationId: a.reservationId,
    ipAddress: maskIpAddress(a.ipAddress),
  }));

  return createSuccess("同意記録を取得しました", { agreements, total });
});
