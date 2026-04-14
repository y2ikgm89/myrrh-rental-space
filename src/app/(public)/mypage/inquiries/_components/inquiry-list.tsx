"use client";

import Link from "next/link";
import type { InquiryStatus } from "@/shared/lib/validations/enums/prisma-types";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { Badge } from "@/public/components/design-system/badge";
import { Stack } from "@/public/components/design-system/stack";
import { INQUIRY_STATUS_CONFIG } from "./inquiry-status";

interface InquiryItem {
  readonly id: string;
  readonly subject: string;
  readonly status: InquiryStatus;
  readonly replyMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function InquiryList({
  inquiries,
}: {
  readonly inquiries: readonly InquiryItem[];
}) {
  return (
    <Stack gap="md">
      {inquiries.map((inquiry) => {
        const config =
          INQUIRY_STATUS_CONFIG[inquiry.status] ?? INQUIRY_STATUS_CONFIG["NEW"];
        return (
          <Link
            key={inquiry.id}
            href={`/mypage/inquiries/${inquiry.id}`}
            className="block border border-border p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {inquiry.subject}
                </p>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatSerializedDate(inquiry.createdAt)}</span>
                  {inquiry.replyMessage !== null && (
                    <span className="text-accent">返信あり</span>
                  )}
                </div>
              </div>
              {config && <Badge variant={config.variant}>{config.label}</Badge>}
            </div>
          </Link>
        );
      })}
    </Stack>
  );
}
