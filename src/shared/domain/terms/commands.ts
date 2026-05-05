import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import type { TermsFormInput } from "@/shared/lib/validations/terms";

interface SlugOnly {
  id: string;
  slug: string;
}

async function ensureSlugAvailable(
  slug: string,
  currentId?: string,
): Promise<void> {
  const existing = await prisma.termsDocument.findFirst({
    where: { slug, ...(currentId && { id: { not: currentId } }) },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError("このスラッグは既に使用されています", "CONFLICT");
  }
}

async function buildContent(input: TermsFormInput) {
  const contentHtml = await renderEditorStateToHtmlLazy(input.contentJson);
  return {
    contentJson: JSON.parse(input.contentJson) as Prisma.InputJsonValue,
    contentHtml,
  };
}

/**
 * 規約作成
 */
export async function createTermsCommand(
  input: TermsFormInput,
): Promise<SlugOnly> {
  await ensureSlugAvailable(input.slug);

  const { contentJson, contentHtml } = await buildContent(input);

  const created = await prisma.termsDocument.create({
    data: {
      type: input.type,
      slug: input.slug,
      title: input.title,
      contentJson,
      contentHtml,
      isPublished: input.isPublished,
      publishedAt: input.isPublished ? new Date() : null,
      requiredAtReservation: input.requiredAtReservation,
      requiredAtInquiry: input.requiredAtInquiry,
      requiredAtSignup: input.requiredAtSignup,
      showInFooter: input.showInFooter,
      footerOrder: input.footerOrder,
    },
    select: { id: true, slug: true },
  });

  return created;
}

/**
 * 規約更新
 */
export async function updateTermsCommand(
  id: string,
  input: TermsFormInput,
): Promise<SlugOnly & { previousSlug: string }> {
  const existing = await prisma.termsDocument.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, isPublished: true, publishedAt: true },
  });
  if (!existing) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }

  if (input.slug !== existing.slug) {
    await ensureSlugAvailable(input.slug, id);
  }

  const { contentJson, contentHtml } = await buildContent(input);

  // 公開状態が false → true に変わった場合のみ publishedAt を更新
  // 既に公開済みなら publishedAt を保持、未公開化なら null
  const publishedAt = (() => {
    if (!input.isPublished) return null;
    if (existing.isPublished && existing.publishedAt)
      return existing.publishedAt;
    return new Date();
  })();

  const updated = await prisma.termsDocument.update({
    where: { id },
    data: {
      type: input.type,
      slug: input.slug,
      title: input.title,
      contentJson,
      contentHtml,
      isPublished: input.isPublished,
      publishedAt,
      requiredAtReservation: input.requiredAtReservation,
      requiredAtInquiry: input.requiredAtInquiry,
      requiredAtSignup: input.requiredAtSignup,
      showInFooter: input.showInFooter,
      footerOrder: input.footerOrder,
    },
    select: { id: true, slug: true },
  });

  return { ...updated, previousSlug: existing.slug };
}

/**
 * 規約削除（ソフトデリート）
 */
export async function softDeleteTermsCommand(id: string): Promise<SlugOnly> {
  const existing = await prisma.termsDocument.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (!existing) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }

  await prisma.termsDocument.update({
    where: { id },
    data: { deletedAt: new Date(), isPublished: false },
  });

  return existing;
}

/**
 * 規約物理削除（ソフトデリート済みのみ）
 */
export async function hardDeleteTermsCommand(
  id: string,
): Promise<{ id: string }> {
  const existing = await prisma.termsDocument.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });
  if (!existing) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }
  if (!existing.deletedAt) {
    throw new DomainError("削除済みの規約のみ物理削除できます", "VALIDATION");
  }

  await prisma.termsDocument.delete({ where: { id } });
  return { id };
}

/**
 * 規約復元（ソフトデリート済みのみ）
 *
 * 復元時は `isPublished: false`（下書き）として戻し、slug 衝突がないか確認する。
 */
export async function restoreTermsCommand(id: string): Promise<SlugOnly> {
  const existing = await prisma.termsDocument.findUnique({
    where: { id },
    select: { id: true, slug: true, deletedAt: true },
  });
  if (!existing) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }
  if (!existing.deletedAt) {
    throw new DomainError("削除済みの規約のみ復元できます", "VALIDATION");
  }

  // 同一 slug の有効レコードが存在しないか確認（削除中に新規作成された可能性）
  const conflict = await prisma.termsDocument.findFirst({
    where: { slug: existing.slug, deletedAt: null, id: { not: id } },
    select: { id: true },
  });
  if (conflict) {
    throw new DomainError(
      "同一スラッグの規約が既に存在するため復元できません。先にスラッグを変更してください。",
      "CONFLICT",
    );
  }

  const restored = await prisma.termsDocument.update({
    where: { id },
    data: { deletedAt: null, isPublished: false, publishedAt: null },
    select: { id: true, slug: true },
  });

  return restored;
}

/**
 * 同意記録の作成（公開フォーム送信時に呼ぶ）
 *
 * @param termsIds 同意した規約 ID 配列
 * @param context  "reservation"/"inquiry"/"signup" 等
 * @param resourceId 紐づくリソース ID（予約 / 問い合わせ ID 等）
 */
export async function recordTermsAgreementsCommand(input: {
  termsIds: readonly string[];
  context: string;
  resourceId?: string | null;
  customerId?: string | null;
  guestEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ count: number }> {
  if (input.termsIds.length === 0) return { count: 0 };

  const docs = await prisma.termsDocument.findMany({
    where: {
      id: { in: [...input.termsIds] },
      deletedAt: null,
      isPublished: true,
    },
    select: { id: true, contentHtml: true },
  });

  if (docs.length === 0) return { count: 0 };

  const data = docs.map((doc) => ({
    termsId: doc.id,
    contentSnapshot: doc.contentHtml,
    contentHash: createHash("sha256").update(doc.contentHtml).digest("hex"),
    context: input.context,
    ...(input.resourceId !== undefined &&
      input.resourceId !== null && { resourceId: input.resourceId }),
    ...(input.customerId !== undefined &&
      input.customerId !== null && { customerId: input.customerId }),
    ...(input.guestEmail !== undefined &&
      input.guestEmail !== null && { guestEmail: input.guestEmail }),
    ...(input.ipAddress !== undefined &&
      input.ipAddress !== null && { ipAddress: input.ipAddress }),
    ...(input.userAgent !== undefined &&
      input.userAgent !== null && { userAgent: input.userAgent }),
  }));

  const result = await prisma.termsAgreement.createMany({ data });
  return { count: result.count };
}
