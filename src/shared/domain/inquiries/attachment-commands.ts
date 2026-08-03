import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { deleteObjectFromBucket } from "@/shared/lib/r2/delete";
import { getR2InquiriesBucketName } from "@/shared/lib/r2/client";
import { generateStorageKey, STORAGE_PREFIXES } from "@/shared/lib/r2/keys";
import {
  detectMediaMimeFromMagicBytes,
  type SupportedMediaMimeType,
} from "@/shared/lib/r2/media-magic-bytes";
import {
  INQUIRY_ATTACHMENT_FILENAME_MAX_LENGTH,
  truncateFilename,
} from "@/shared/lib/r2/filename";
import { MEDIA_MAX_SIZE_BYTES } from "@/shared/lib/r2/media-size";
import { putPrivateObject } from "@/shared/lib/r2/upload";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

/**
 * お問い合わせ添付として許可する MIME（inquiry-overhaul completion design §6.4）。
 * 画像 3 種 + PDF のみ。動画・音声・GIF・SVG は非対応（`media-magic-bytes` の
 * 汎用一覧からさらに絞り込む — 添付は「見積書 PDF / 現地写真」用途に限定する）。
 */
export const INQUIRY_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const satisfies readonly SupportedMediaMimeType[];

type InquiryAttachmentMimeType =
  (typeof INQUIRY_ATTACHMENT_ALLOWED_MIME_TYPES)[number];

function isAllowedInquiryAttachmentMime(
  mime: SupportedMediaMimeType,
): mime is InquiryAttachmentMimeType {
  switch (mime) {
    case "image/jpeg":
    case "image/png":
    case "image/webp":
    case "application/pdf":
      return true;
    default:
      return false;
  }
}

/** 事前ガード用の aggregate 上限（許可 MIME 中の最大 = PDF の 10MB）。 */
const AGGREGATE_MAX_SIZE_BYTES = Math.max(
  ...INQUIRY_ATTACHMENT_ALLOWED_MIME_TYPES.map(
    (mime) => MEDIA_MAX_SIZE_BYTES[mime],
  ),
);

export type InquiryAttachmentUploader =
  { type: "STAFF"; userId: string } | { type: "CUSTOMER"; customerId: string };

type UploadInquiryAttachmentInput = {
  file: File;
  inquiryId: string;
  /** 特定の返信に紐付ける場合に指定。省略時は Inquiry 本体への添付。 */
  replyId?: string | null;
  uploader: InquiryAttachmentUploader;
};

export type InquiryAttachmentResult = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  replyId: string | null;
  createdAt: Date;
};

/**
 * お問い合わせ添付を private R2 bucket にアップロードし DB 行を作成する。
 *
 * 処理順序:
 * 1. inquiry 存在確認（soft-deleted / anonymized 済みは拒否）
 * 2. CUSTOMER uploader は inquiry.customerId 一致を強制（IDOR 防止）
 * 3. replyId 指定時は同一 inquiry に属するか確認。CUSTOMER は自 reply のみ可
 * 4. aggregate size 事前ガード → magic-byte で MIME 確定 → per-type size 上限
 * 5. private bucket へ PutObject（`buildPublicUrl` は一切呼ばない）
 * 6. DB 行作成。失敗時は R2 orphan を削除（uploadMediaCommand と同型の補償）
 *
 * STAFF の RBAC は action 層。domain では STAFF に ownership 制約を課さない。
 */
export async function uploadInquiryAttachmentCommand(
  input: UploadInquiryAttachmentInput,
): Promise<InquiryAttachmentResult> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id: input.inquiryId },
    select: {
      id: true,
      customerId: true,
      deletedAt: true,
      anonymizedAt: true,
    },
  });
  if (!inquiry || inquiry.deletedAt !== null || inquiry.anonymizedAt !== null) {
    throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
  }

  if (
    input.uploader.type === "CUSTOMER" &&
    inquiry.customerId !== input.uploader.customerId
  ) {
    throw new DomainError(
      "このお問い合わせに添付をアップロードする権限がありません",
      "FORBIDDEN",
    );
  }

  if (input.replyId) {
    const reply = await prisma.inquiryReply.findUnique({
      where: { id: input.replyId },
      select: { id: true, inquiryId: true, authorCustomerId: true },
    });
    if (!reply || reply.inquiryId !== input.inquiryId) {
      throw new DomainError("返信が見つかりません", "NOT_FOUND");
    }
    if (
      input.uploader.type === "CUSTOMER" &&
      reply.authorCustomerId !== input.uploader.customerId
    ) {
      throw new DomainError(
        "この返信に添付をアップロードする権限がありません",
        "FORBIDDEN",
      );
    }
  }

  if (input.file.size > AGGREGATE_MAX_SIZE_BYTES) {
    const maxMB = Math.round(AGGREGATE_MAX_SIZE_BYTES / (1024 * 1024));
    throw new DomainError(
      `ファイルサイズは${maxMB}MB以下にしてください`,
      "VALIDATION",
    );
  }

  const arrayBuffer = await input.file.arrayBuffer();
  const body = new Uint8Array(arrayBuffer);

  // trust boundary: client 供給の file.type は信用せず magic-byte で確定する。
  const detected = detectMediaMimeFromMagicBytes(body);
  if (!detected || !isAllowedInquiryAttachmentMime(detected)) {
    throw new DomainError(
      "対応形式（JPEG / PNG / WebP / PDF）のファイルのみアップロードできます",
      "VALIDATION",
    );
  }

  const perTypeLimit = MEDIA_MAX_SIZE_BYTES[detected];
  if (input.file.size > perTypeLimit) {
    const limitMB = Math.round(perTypeLimit / (1024 * 1024));
    throw new DomainError(
      `この形式 (${detected}) は ${limitMB}MB 以下にしてください`,
      "VALIDATION",
    );
  }

  const bucket = getR2InquiriesBucketName();
  const key = generateStorageKey({
    prefix: STORAGE_PREFIXES.INQUIRIES,
    contentType: detected,
    folder: input.inquiryId,
  });

  const putResult = await putPrivateObject(bucket, key, body, detected);
  if (!putResult.success) {
    throw new DomainError(putResult.error, "UNEXPECTED");
  }

  try {
    return await prisma.inquiryAttachment.create({
      data: {
        inquiryId: input.inquiryId,
        replyId: input.replyId ?? null,
        r2Key: key,
        mimeType: detected,
        sizeBytes: input.file.size,
        // multipart の filename は client が自由に決められる。VarChar(255) を
        // 超えると PostgreSQL が 22001 を投げ、DomainError にならないので 500 になる。
        filename: truncateFilename(
          input.file.name,
          INQUIRY_ATTACHMENT_FILENAME_MAX_LENGTH,
        ),
        uploadedById:
          input.uploader.type === "STAFF" ? input.uploader.userId : null,
        uploadedByCustomerId:
          input.uploader.type === "CUSTOMER" ? input.uploader.customerId : null,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        replyId: true,
        createdAt: true,
      },
    });
  } catch (error) {
    // orphan cleanup: DB 保存に失敗した private object を残さない。
    const cleanup = await deleteObjectFromBucket(bucket, key);
    if (!cleanup.success) {
      logError(normalizeError(error), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "uploadInquiryAttachment.orphanCleanup",
          bucket,
          key,
        },
      });
    }
    throw new DomainError("添付ファイルの保存に失敗しました", "UNEXPECTED");
  }
}

type DeleteInquiryAttachmentActor =
  { type: "STAFF_ADMIN" } | { type: "CUSTOMER"; customerId: string };

type DeleteInquiryAttachmentInput = {
  attachmentId: string;
  actor: DeleteInquiryAttachmentActor;
};

/**
 * お問い合わせ添付を削除する。R2 object を先に削除し、成功後に DB 行を削除する
 * （retention purge と同じ「R2 → DB」の順序、DB 行だけ残る orphan を避ける）。
 *
 * 権限: STAFF（管理画面）は常に削除可。CUSTOMER はアップロード本人の添付のみ
 * 削除可（現時点で customer 側 UI からの削除導線は未配線だが、domain contract
 * としてここで強制する）。
 */
export async function deleteInquiryAttachmentCommand(
  input: DeleteInquiryAttachmentInput,
): Promise<void> {
  const attachment = await prisma.inquiryAttachment.findUnique({
    where: { id: input.attachmentId },
    select: { id: true, r2Key: true, uploadedByCustomerId: true },
  });
  if (!attachment) {
    throw new DomainError("添付ファイルが見つかりません", "NOT_FOUND");
  }

  if (
    input.actor.type === "CUSTOMER" &&
    attachment.uploadedByCustomerId !== input.actor.customerId
  ) {
    throw new DomainError(
      "この添付ファイルを削除する権限がありません",
      "FORBIDDEN",
    );
  }

  const deleteResult = await deleteObjectFromBucket(
    getR2InquiriesBucketName(),
    attachment.r2Key,
  );
  if (!deleteResult.success) {
    throw new DomainError("ファイルの削除に失敗しました", "UNEXPECTED");
  }

  await prisma.inquiryAttachment.delete({ where: { id: attachment.id } });
}
