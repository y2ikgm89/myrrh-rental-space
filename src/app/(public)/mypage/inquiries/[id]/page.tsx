/**
 * /mypage/inquiries/[id] — お問い合わせ詳細ページ
 *
 * メッセージスレッド型 card レイアウト: 顧客メッセージとスタッフ返信を
 * 独立 card として視覚的に識別。連絡先は footer に配置。
 */

import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerInquiryById } from "../../_lib/inquiry-queries";
import { Heading } from "@/public/components/design-system/heading";
import { Badge } from "@/public/components/design-system/badge";
import { INQUIRY_STATUS_CONFIG } from "../_components/inquiry-status";
import { formatSerializedDate } from "@/shared/lib/serialize";

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

const DATE_FORMAT_OPTIONS = {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const;

export default async function MypageInquiryDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { id } = await params;

  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const inquiry = await getCustomerInquiryById(id, customer.id);

  if (!inquiry) {
    notFound();
  }

  const statusConfig =
    INQUIRY_STATUS_CONFIG[inquiry.status] ?? INQUIRY_STATUS_CONFIG["NEW"];

  const submittedDate = formatSerializedDate(
    inquiry.createdAt,
    DATE_FORMAT_OPTIONS,
  );
  const repliedDate =
    inquiry.repliedAt !== null
      ? formatSerializedDate(inquiry.repliedAt, DATE_FORMAT_OPTIONS)
      : null;

  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        {/* 長 subject の overflow / 英数文字列の伸び両対応。 */}
        <Heading
          level={1}
          className="min-w-0 break-words [overflow-wrap:anywhere]"
        >
          {inquiry.subject}
        </Heading>
        {statusConfig && (
          <Badge variant={statusConfig.variant} className="shrink-0">
            {statusConfig.label}
          </Badge>
        )}
      </header>

      <div className="mt-8 space-y-4">
        <article
          aria-labelledby="customer-message-heading"
          className="border border-border p-4 sm:p-6"
        >
          <header className="mb-4 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4">
            <h2
              id="customer-message-heading"
              className="text-base font-medium text-foreground"
            >
              あなたから
            </h2>
            <time
              className="text-sm text-muted-foreground"
              dateTime={inquiry.createdAt}
            >
              {submittedDate}
            </time>
          </header>
          {/* UGC message body は break-words + [overflow-wrap:anywhere] で
              長英数列 / URL / 記号列の container overflow を阻止。 */}
          <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground [overflow-wrap:anywhere]">
            {inquiry.message}
          </p>
        </article>

        {inquiry.replyMessage !== null && (
          <article
            aria-labelledby="staff-reply-heading"
            className="border border-accent/30 bg-accent/5 p-4 sm:p-6"
          >
            <header className="mb-4 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4">
              <h2
                id="staff-reply-heading"
                className="text-base font-medium text-accent"
              >
                スタッフから
              </h2>
              {repliedDate !== null && inquiry.repliedAt !== null && (
                <time
                  className="text-sm text-muted-foreground"
                  dateTime={inquiry.repliedAt}
                >
                  {repliedDate}
                </time>
              )}
            </header>
            <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {inquiry.replyMessage}
            </p>
          </article>
        )}
      </div>

      {inquiry.companyName && (
        <p className="mt-10 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
          会社名: <span className="text-foreground">{inquiry.companyName}</span>
        </p>
      )}

      <footer className="mt-10 border-t border-border pt-6">
        <Link
          href="/mypage/inquiries"
          className="inline-flex min-h-11 items-center gap-2 text-base text-foreground underline underline-offset-4 transition-colors hover:text-accent"
        >
          <span aria-hidden="true">←</span>
          お問い合わせ一覧に戻る
        </Link>
      </footer>
    </div>
  );
}
