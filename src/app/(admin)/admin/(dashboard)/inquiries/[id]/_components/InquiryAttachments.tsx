"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconDownload, IconPaperclip, IconTrash } from "@tabler/icons-react";
import { formatDate } from "@/shared/lib/date-format";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import {
  uploadInquiryAttachment,
  deleteInquiryAttachment,
} from "@/admin/actions/inquiry";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { InquiryAttachmentItem } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";
import {
  INQUIRY_ATTACHMENT_ACCEPT,
  INQUIRY_ATTACHMENT_MAX_SIZE_BYTES,
} from "@/shared/lib/r2/inquiry-attachment";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

type InquiryAttachmentsProps = {
  inquiryId: string;
  attachments: Serialized<InquiryAttachmentItem>[];
  /** 匿名化済みなら true。既存添付は anonymize 時に削除済みのため新規追加のみ隠す。 */
  isAnonymized?: boolean;
};

export function InquiryAttachments({
  inquiryId,
  attachments,
  isAnonymized = false,
}: InquiryAttachmentsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, startUploadTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 送信前に弾く。Server Action の `bodySizeLimit` を超えるとフレームワークが
    // request 自体を reject するため、action は返らず `isMutationError` にも
    // 到達せず、**画面には何も出ない**（下の toast も出ない）。
    // `next.config.ts` の上限はこの値より上に取ってあるので、ここが最初の関門になる。
    if (file.size > INQUIRY_ATTACHMENT_MAX_SIZE_BYTES) {
      const maxMB = Math.round(
        INQUIRY_ATTACHMENT_MAX_SIZE_BYTES / (1024 * 1024),
      );
      toast.error(`ファイルサイズは${String(maxMB)}MB以下にしてください`);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("inquiryId", inquiryId);

    startUploadTransition(async () => {
      const result = await uploadInquiryAttachment(formData);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("添付ファイルをアップロードしました");
        router.refresh();
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    });
  };

  const handleDelete = (attachmentId: string) => {
    setDeletingId(attachmentId);
    startDeleteTransition(async () => {
      const result = await deleteInquiryAttachment(attachmentId, inquiryId);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("添付ファイルを削除しました");
        router.refresh();
      }
      setDeletingId(null);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">添付ファイル</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {attachments.length > 0 ? (
          <ul className="space-y-2">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <IconPaperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {attachment.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.sizeBytes)} ・{" "}
                      {formatDate(attachment.createdAt, true)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button asChild variant="ghost" size="sm">
                    <a
                      href={`/admin/api/inquiries/attachments/${attachment.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${attachment.filename} をダウンロード`}
                    >
                      <IconDownload className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting && deletingId === attachment.id}
                    onClick={() => handleDelete(attachment.id)}
                    aria-label={`${attachment.filename} を削除`}
                  >
                    <IconTrash className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            添付ファイルはありません
          </p>
        )}

        {!isAnonymized && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={INQUIRY_ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={handleFileChange}
              disabled={isUploading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? "アップロード中..." : "ファイルを追加"}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              JPEG / PNG / WebP（5MB以下）・ PDF（10MB以下）
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
