"use client";

import Link from "next/link";
import type { InquiryStatus } from "@/shared/db/enums";
import { Badge } from "@/public/components/design-system/badge";
import { INQUIRY_STATUS_CONFIG } from "./inquiry-status";

interface InquiryItem {
  readonly id: string;
  readonly subject: string;
  readonly status: InquiryStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function InquiryList({
  inquiries,
}: {
  readonly inquiries: readonly InquiryItem[];
}) {
  return (
    <div className="space-y-4">
      {inquiries.map((inquiry) => {
        const config =
          INQUIRY_STATUS_CONFIG[inquiry.status] ?? INQUIRY_STATUS_CONFIG["NEW"];
        return (
          <Link
            key={inquiry.id}
            href={`/mypage/inquiries/${inquiry.id}`}
            className="block rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {inquiry.subject}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(inquiry.createdAt).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              {config && <Badge variant={config.variant}>{config.label}</Badge>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
