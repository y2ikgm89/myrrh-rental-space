import Link from "next/link";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { Badge } from "@/public/components/design-system/badge";
import { Stack } from "@/public/components/design-system/stack";
import { INQUIRY_STATUS_CONFIG } from "./inquiry-status";
import type { InquiryStatus } from "@/shared/lib/validations/enums/prisma-types";

interface InquiryItem {
  readonly id: string;
  /** "INQ-XXXXXXXX" 形式の受付番号。問い合わせ先での照合キー。 */
  readonly receiptNumber: string;
  readonly subject: string;
  readonly status: InquiryStatus;
  /** スタッフ返信件数。0 なら「返信あり」バッジを出さない。 */
  readonly replyCount: number;
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
            // 44px touch target + focus-visible ring で WCAG 2.4.7 / 2.5.5 担保。
            className="block min-h-11 border border-border p-4 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-2 sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {inquiry.subject}
                </p>
                {/* 受付番号は subject 下に小さく (照合用の補助情報)。 */}
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  受付番号: {inquiry.receiptNumber}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatSerializedDate(inquiry.createdAt)}</span>
                  {inquiry.replyCount > 0 && (
                    // 旧 plain text <span> から Badge に格上げ。color-only な
                    // 「返信あり」の WCAG 1.4.1 (Use of Color) 違反を解消し、
                    // ステータスバッジ群と視覚一貫性を持たせる。
                    <Badge variant="success" className="shrink-0">
                      返信あり
                    </Badge>
                  )}
                </div>
              </div>
              {config && (
                <Badge variant={config.variant} className="shrink-0">
                  {config.label}
                </Badge>
              )}
            </div>
          </Link>
        );
      })}
    </Stack>
  );
}
