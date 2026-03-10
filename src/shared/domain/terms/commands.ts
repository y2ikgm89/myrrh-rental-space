import "server-only";

import { TermsStatus } from "@/shared/db/enums";
import { parsePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import type {
  CreateTermsInput,
  CreateTermsVersionInput,
  UpdateTermsInput,
  UpdateTermsVersionInput,
} from "@/shared/lib/validations/terms";

type CreateTermsWithVersionInput = CreateTermsInput & {
  contentJson: string;
  contentHtml: string;
};

type CreateTermsVersionWithHtmlInput = CreateTermsVersionInput & {
  contentHtml: string;
};

type UpdateTermsVersionWithHtmlInput = UpdateTermsVersionInput & {
  contentHtml: string;
};

function parseEditorStateJson(contentJson: string) {
  return parsePrismaInputJson(contentJson, "コンテンツJSONが不正です");
}

async function ensureUniqueSlug(
  slug: string,
  currentId?: string,
): Promise<void> {
  const existing = currentId
    ? await prisma.terms.findFirst({
        where: {
          slug,
          id: { not: currentId },
        },
        select: { id: true },
      })
    : await prisma.terms.findUnique({
        where: { slug },
        select: { id: true },
      });

  if (existing) {
    throw new DomainError("このスラッグは既に使用されています", "CONFLICT");
  }
}

async function ensureTermsExists(id: string): Promise<void> {
  const existing = await prisma.terms.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }
}

export async function createTerms(
  input: CreateTermsInput,
): Promise<{ id: string }> {
  await ensureUniqueSlug(input.slug);

  const terms = await prisma.terms.create({
    data: input,
  });

  return { id: terms.id };
}

export async function createTermsWithVersion(
  input: CreateTermsWithVersionInput,
  userId: string,
): Promise<{ id: string; versionId: string }> {
  await ensureUniqueSlug(input.slug);

  const contentJson = parseEditorStateJson(input.contentJson);

  return prisma.$transaction(async (tx) => {
    const terms = await tx.terms.create({
      data: {
        type: input.type,
        title: input.title,
        slug: input.slug,
        isActive: input.isActive,
      },
    });

    const version = await tx.termsVersion.create({
      data: {
        termsId: terms.id,
        contentJson,
        contentHtml: input.contentHtml,
        version: 1,
        status: TermsStatus.DRAFT,
        createdBy: userId,
      },
    });

    return { id: terms.id, versionId: version.id };
  });
}

export async function updateTerms(
  id: string,
  input: UpdateTermsInput,
): Promise<void> {
  await ensureTermsExists(id);

  if (input.slug) {
    await ensureUniqueSlug(input.slug, id);
  }

  await prisma.terms.update({
    where: { id },
    data: input,
  });
}

export async function deleteTerms(id: string): Promise<void> {
  const [terms, spacesCount] = await Promise.all([
    prisma.terms.findUnique({
      where: { id },
      select: { id: true },
    }),
    prisma.space.count({
      where: { termsId: id },
    }),
  ]);

  if (!terms) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }

  if (spacesCount > 0) {
    throw new DomainError(
      `この規約は ${spacesCount} 件のスペースで使用されているため削除できません`,
      "CONFLICT",
    );
  }

  await prisma.terms.delete({ where: { id } });
}

export async function toggleTermsActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  await ensureTermsExists(id);

  await prisma.terms.update({
    where: { id },
    data: { isActive },
  });
}

export async function createTermsVersion(
  input: CreateTermsVersionWithHtmlInput,
  userId: string,
): Promise<{ id: string; version: number }> {
  const [terms, existingDraft, latestVersion] = await Promise.all([
    prisma.terms.findUnique({
      where: { id: input.termsId },
      select: { id: true },
    }),
    prisma.termsVersion.findFirst({
      where: {
        termsId: input.termsId,
        status: TermsStatus.DRAFT,
      },
      select: { id: true },
    }),
    prisma.termsVersion.findFirst({
      where: { termsId: input.termsId },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
  ]);

  if (!terms) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }

  if (existingDraft) {
    throw new DomainError(
      "下書きが既に存在します。先に公開または削除してください。",
      "CONFLICT",
    );
  }

  const nextVersion = (latestVersion?.version ?? 0) + 1;
  const contentJson = parseEditorStateJson(input.contentJson);

  const version = await prisma.termsVersion.create({
    data: {
      termsId: input.termsId,
      contentJson,
      contentHtml: input.contentHtml,
      version: nextVersion,
      status: TermsStatus.DRAFT,
      createdBy: userId,
    },
  });

  return {
    id: version.id,
    version: version.version,
  };
}

export async function updateTermsVersion(
  versionId: string,
  input: UpdateTermsVersionWithHtmlInput,
): Promise<void> {
  const version = await prisma.termsVersion.findUnique({
    where: { id: versionId },
    select: { status: true },
  });

  if (!version) {
    throw new DomainError("バージョンが見つかりません", "NOT_FOUND");
  }

  if (version.status !== TermsStatus.DRAFT) {
    throw new DomainError("公開済みのバージョンは編集できません", "CONFLICT");
  }

  await prisma.termsVersion.update({
    where: { id: versionId },
    data: {
      contentJson: parseEditorStateJson(input.contentJson),
      contentHtml: input.contentHtml,
    },
  });
}

export async function publishTermsVersion(
  versionId: string,
  userId: string,
): Promise<void> {
  const version = await prisma.termsVersion.findUnique({
    where: { id: versionId },
    select: { termsId: true, status: true },
  });

  if (!version) {
    throw new DomainError("バージョンが見つかりません", "NOT_FOUND");
  }

  if (version.status === TermsStatus.PUBLISHED) {
    throw new DomainError("このバージョンは既に公開されています", "CONFLICT");
  }

  await prisma.$transaction(async (tx) => {
    await tx.termsVersion.updateMany({
      where: {
        termsId: version.termsId,
        isCurrentVersion: true,
      },
      data: { isCurrentVersion: false },
    });

    await tx.termsVersion.update({
      where: { id: versionId },
      data: {
        status: TermsStatus.PUBLISHED,
        isCurrentVersion: true,
        publishedAt: new Date(),
        publishedBy: userId,
      },
    });
  });
}

export async function archiveTermsVersion(versionId: string): Promise<void> {
  const version = await prisma.termsVersion.findUnique({
    where: { id: versionId },
    select: { isCurrentVersion: true },
  });

  if (!version) {
    throw new DomainError("バージョンが見つかりません", "NOT_FOUND");
  }

  if (version.isCurrentVersion) {
    throw new DomainError(
      "現在有効なバージョンはアーカイブできません",
      "CONFLICT",
    );
  }

  await prisma.termsVersion.update({
    where: { id: versionId },
    data: { status: TermsStatus.ARCHIVED },
  });
}

export async function deleteTermsVersion(versionId: string): Promise<void> {
  const version = await prisma.termsVersion.findUnique({
    where: { id: versionId },
    select: { status: true },
  });

  if (!version) {
    throw new DomainError("バージョンが見つかりません", "NOT_FOUND");
  }

  if (version.status !== TermsStatus.DRAFT) {
    throw new DomainError(
      "公開済みまたはアーカイブ済みのバージョンは削除できません",
      "CONFLICT",
    );
  }

  await prisma.termsVersion.delete({ where: { id: versionId } });
}
