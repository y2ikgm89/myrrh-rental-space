import type { ReactElement } from "react";
import type { InquiryAttachmentItem } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";

interface InquiryAttachmentListProps {
  readonly attachments: Serialized<InquiryAttachmentItem>[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function InquiryAttachmentList({
  attachments,
}: InquiryAttachmentListProps): ReactElement | null {
  if (attachments.length === 0) return null;

  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="mb-4 text-base font-medium text-foreground">
        添付ファイル
      </h2>
      <ul className="space-y-2">
        {attachments.map((attachment) => (
          <li key={attachment.id}>
            <a
              href={`/api/mypage/inquiries/attachments/${attachment.id}`}
              className="inline-flex min-h-11 items-center gap-2 border border-border px-4 py-2 text-sm text-foreground underline underline-offset-4 transition-colors hover:text-accent"
            >
              <span className="truncate">{attachment.filename}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                ({formatFileSize(attachment.sizeBytes)})
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
