import "server-only";

import type { Role } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { isAdminOrHigherRole } from "@/shared/lib/admin-roles";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { AuditAction } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import type { InquiryInternalNoteItem } from "@/shared/domain/inquiries/types";

// ============================================================================
// 担当者アサイン
// ============================================================================

async function findActiveInquiryOrThrow(
  inquiryId: string,
): Promise<{ id: string; assigneeId: string | null }> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    select: { id: true, deletedAt: true, assigneeId: true },
  });
  if (!inquiry || inquiry.deletedAt !== null) {
    throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
  }
  return inquiry;
}

/**
 * Inquiry の担当者を set/clear する。`assigneeId: null` で担当解除。
 *
 * 割当可能なのは `inquiry:update` 権限を持つロール (ADMIN / SUPER_ADMIN) のみ
 * — EDITOR / VIEWER に割り当てても実際に対応できないため。
 * 変更は granular AuditLog (`inquiry.assignee`) に before/after を記録する
 * (`executeAdminMutationResult` の generic logAction は resourceId までしか
 * 持たないため、diff が必要なここでは個別に記録する)。
 */
export async function assignInquiryCommand(
  inquiryId: string,
  assigneeId: string | null,
  actorUserId: string,
): Promise<{ id: string; assigneeId: string | null }> {
  const inquiry = await findActiveInquiryOrThrow(inquiryId);

  if (inquiry.assigneeId === assigneeId) {
    return { id: inquiryId, assigneeId };
  }

  if (assigneeId) {
    const assignee = await prisma.user.findUnique({
      where: { id: assigneeId },
      select: { role: true },
    });
    if (!assignee || !isAdminOrHigherRole(assignee.role)) {
      throw new DomainError("担当者が見つかりません", "NOT_FOUND");
    }
  }

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: { assigneeId },
  });

  await createAuditLogRecord({
    userId: actorUserId,
    action: AuditAction.UPDATE,
    resource: "inquiry.assignee",
    resourceId: inquiryId,
    oldValue: { assigneeId: inquiry.assigneeId },
    newValue: { assigneeId },
  });

  return { id: inquiryId, assigneeId };
}

// ============================================================================
// SLA 期限
// ============================================================================

/** Inquiry の SLA 対応期限を set/clear する。`slaExpiresAt: null` でクリア。 */
export async function updateInquirySlaCommand(
  inquiryId: string,
  slaExpiresAt: Date | null,
): Promise<{ id: string; slaExpiresAt: Date | null }> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    select: { id: true, deletedAt: true, slaExpiresAt: true },
  });
  if (!inquiry || inquiry.deletedAt !== null) {
    throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
  }

  const before = inquiry.slaExpiresAt?.getTime() ?? null;
  const after = slaExpiresAt?.getTime() ?? null;
  if (before === after) {
    return { id: inquiryId, slaExpiresAt };
  }

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: { slaExpiresAt },
  });

  return { id: inquiryId, slaExpiresAt };
}

// ============================================================================
// 内部メモ (スタッフ専用、顧客非公開)
// ============================================================================

/** internal メモを作成する。inquiry の存在チェックのみ (status 制約なし)。 */
export async function createInquiryInternalNoteCommand(
  inquiryId: string,
  authorId: string,
  body: string,
): Promise<InquiryInternalNoteItem> {
  await findActiveInquiryOrThrow(inquiryId);

  const note = await prisma.inquiryInternalNote.create({
    data: { inquiryId, authorId, body },
    select: {
      id: true,
      body: true,
      authorId: true,
      author: { select: { name: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    id: note.id,
    body: note.body,
    authorId: note.authorId,
    authorName: note.author?.name ?? null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

/**
 * internal メモを削除する。削除可能なのは投稿者本人、または ADMIN 以上のロール。
 * `InquiryInternalNote.author` は `onDelete: Restrict` (User 削除では消えない) だが、
 * メモ自体の削除は他スタッフの誤操作防止のため権限を絞る。
 */
export async function deleteInquiryInternalNoteCommand(
  noteId: string,
  actorUserId: string,
  actorRole: Role,
): Promise<{ id: string }> {
  const note = await prisma.inquiryInternalNote.findUnique({
    where: { id: noteId },
    select: { id: true, authorId: true },
  });
  if (!note) {
    throw new DomainError("メモが見つかりません", "NOT_FOUND");
  }

  if (note.authorId !== actorUserId && !isAdminOrHigherRole(actorRole)) {
    throw new DomainError(
      "他のスタッフが作成したメモは削除できません",
      "FORBIDDEN",
    );
  }

  await prisma.inquiryInternalNote.delete({ where: { id: noteId } });

  return { id: noteId };
}

// ============================================================================
// タグ付与 (Inquiry ↔ InquiryTag 全置換)
// ============================================================================

/**
 * Inquiry へのタグ付与を `tagIds` へ全置換する (add/remove の差分計算はしない)。
 * 空配列を渡すと全タグ解除になる。
 */
export async function setInquiryTagsCommand(
  inquiryId: string,
  tagIds: string[],
): Promise<{ id: string; tagIds: string[] }> {
  await findActiveInquiryOrThrow(inquiryId);

  const uniqueTagIds = [...new Set(tagIds)];

  if (uniqueTagIds.length > 0) {
    const existing = await prisma.inquiryTag.findMany({
      where: { id: { in: uniqueTagIds } },
      select: { id: true },
    });
    if (existing.length !== uniqueTagIds.length) {
      throw new DomainError("存在しないタグが含まれています", "NOT_FOUND");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.inquiryTagOnInquiry.deleteMany({ where: { inquiryId } });
    if (uniqueTagIds.length > 0) {
      await tx.inquiryTagOnInquiry.createMany({
        data: uniqueTagIds.map((tagId) => ({ inquiryId, tagId })),
        skipDuplicates: true,
      });
    }
  });

  return { id: inquiryId, tagIds: uniqueTagIds };
}

// ============================================================================
// タグマスタ CRUD
// ============================================================================

export type InquiryTagFormData = {
  name: string;
  color: string | null;
};

async function ensureInquiryTagNameAvailable(
  name: string,
  currentId?: string,
): Promise<void> {
  const existing = await prisma.inquiryTag.findFirst({
    where: { name, ...(currentId ? { id: { not: currentId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError("同じ名前のタグが既に存在します", "CONFLICT");
  }
}

export async function createInquiryTagCommand(
  data: InquiryTagFormData,
): Promise<{ id: string }> {
  await ensureInquiryTagNameAvailable(data.name);

  const tag = await prisma.inquiryTag.create({
    data: { name: data.name, color: data.color },
  });

  return { id: tag.id };
}

export async function updateInquiryTagCommand(
  id: string,
  data: InquiryTagFormData,
): Promise<{ id: string }> {
  const tag = await prisma.inquiryTag.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!tag) {
    throw new DomainError("タグが見つかりません", "NOT_FOUND");
  }

  await ensureInquiryTagNameAvailable(data.name, id);

  await prisma.inquiryTag.update({
    where: { id },
    data: { name: data.name, color: data.color },
  });

  return { id };
}

/**
 * タグマスタを削除する。1 件でも Inquiry に付与されていれば CONFLICT で拒否する
 * (Restrict-style ガード。cascade で付与状態を静かに消さない)。
 */
export async function deleteInquiryTagCommand(id: string): Promise<{
  id: string;
}> {
  const tag = await prisma.inquiryTag.findUnique({
    where: { id },
    include: { _count: { select: { inquiries: true } } },
  });
  if (!tag) {
    throw new DomainError("タグが見つかりません", "NOT_FOUND");
  }

  if (tag._count.inquiries > 0) {
    throw new DomainError(
      `このタグは${tag._count.inquiries}件のお問い合わせに付与されています。先にタグの付与を解除してください。`,
      "CONFLICT",
    );
  }

  await prisma.inquiryTag.delete({ where: { id } });

  return { id };
}
