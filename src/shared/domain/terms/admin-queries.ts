import "server-only";

import { TermsStatus } from "@/shared/db/enums";
import { prisma } from "@/shared/db/prisma";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import {
  getTermsTypeDefaults,
  type TermsAgreementItem,
  type TermsDetail,
  type TermsVersionDetail,
  type TermsWithVersion,
} from "@/shared/lib/validations/terms";

const AGREEMENTS_PER_PAGE = 20;

type ActiveTermsOption = {
  id: string;
  title: string;
  type: string;
};

function maskIpAddress(ip: string | null): string | null {
  if (!ip) {
    return null;
  }

  const lastDot = ip.lastIndexOf(".");
  if (lastDot === -1) {
    return ip;
  }

  return `${ip.slice(0, lastDot + 1)}***`;
}

export async function getAdminTermsList(): Promise<TermsWithVersion[]> {
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

  return terms.map((term) => {
    const currentVersion = term.versions[0] ?? null;

    return {
      id: term.id,
      type: term.type,
      title: term.title,
      slug: term.slug,
      isActive: term.isActive,
      currentVersion: currentVersion
        ? {
            id: currentVersion.id,
            version: currentVersion.version,
            contentHtml: currentVersion.contentHtml,
            contentJson: currentVersion.contentJson,
            publishedAt: currentVersion.publishedAt ?? new Date(0),
          }
        : null,
      _count: {
        spaces: term._count.spaces,
      },
    };
  });
}

export async function getActiveTermsForSelectOptions(): Promise<
  ActiveTermsOption[]
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

export async function getTermsDefaultsForType(
  type: string,
): Promise<{ title: string; slug: string } | null> {
  const defaults = getTermsTypeDefaults(type);
  if (!defaults) {
    return null;
  }

  const existing = await prisma.terms.findUnique({
    where: { slug: defaults.slug },
    select: { id: true },
  });

  if (!existing) {
    return defaults;
  }

  const similarTerms = await prisma.terms.findMany({
    where: {
      slug: { startsWith: defaults.slug },
    },
    select: { slug: true },
  });

  const usedNumbers = new Set<number>([1]);
  for (const term of similarTerms) {
    const match = term.slug.match(
      new RegExp(`^${RegExp.escape(defaults.slug)}-(\\d+)$`),
    );
    const suffix = match?.[1];
    if (suffix) {
      usedNumbers.add(Number.parseInt(suffix, 10));
    }
  }

  let nextSuffix = 2;
  while (usedNumbers.has(nextSuffix)) {
    nextSuffix += 1;
  }

  return {
    title: `${defaults.title} ${nextSuffix}`,
    slug: `${defaults.slug}-${nextSuffix}`,
  };
}

export async function getAdminTermsById(
  id: string,
): Promise<TermsDetail | null> {
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
    return null;
  }

  return toPlainObject(terms);
}

export async function getAdminTermsVersionById(
  versionId: string,
): Promise<TermsVersionDetail | null> {
  const version = await prisma.termsVersion.findUnique({
    where: { id: versionId },
  });

  return toPlainObject(version);
}

export async function getAdminTermsAgreements(
  termsId: string,
  page: number,
): Promise<{ agreements: TermsAgreementItem[]; total: number }> {
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

  const agreements: TermsAgreementItem[] = rawAgreements.map((agreement) => ({
    id: agreement.id,
    agreedAt: agreement.agreedAt.toISOString(),
    version: agreement.version.version,
    guestName: agreement.guestName,
    guestEmail: agreement.guestEmail,
    userName: agreement.user?.name ?? null,
    userEmail: agreement.user?.email ?? null,
    reservationId: agreement.reservationId,
    ipAddress: maskIpAddress(agreement.ipAddress),
  }));

  return { agreements, total };
}
