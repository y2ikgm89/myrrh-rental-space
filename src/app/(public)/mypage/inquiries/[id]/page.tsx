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
    <div className="mx-auto max-w-2xl">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <Heading level={1}>{inquiry.subject}</Heading>
        {statusConfig && (
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        )}
      </header>

      <div className="mt-8 space-y-4">
        <article
          aria-labelledby="customer-message-heading"
          className="border border-border p-5 sm:p-6"
        >
          <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
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
          <p className="whitespace-pre-wrap leading-relaxed text-foreground">
            {inquiry.message}
          </p>
        </article>

        {inquiry.replyMessage !== null && (
          <article
            aria-labelledby="staff-reply-heading"
            className="border border-accent/30 bg-accent/5 p-5 sm:p-6"
          >
            <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
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
            <p className="whitespace-pre-wrap leading-relaxed text-foreground">
              {inquiry.replyMessage}
            </p>
          </article>
        )}
      </div>

      {inquiry.companyName && (
        <p className="mt-10 text-sm text-muted-foreground">
          会社名: <span className="text-foreground">{inquiry.companyName}</span>
        </p>
      )}

      <footer className="mt-10 border-t border-border pt-6">
        <Link
          href="/mypage/inquiries"
          className="inline-flex min-h-11 items-center text-sm text-foreground underline underline-offset-4 hover:text-accent transition-colors"
        >
          お問い合わせ一覧に戻る
        </Link>
      </footer>
    </div>
  );
}
