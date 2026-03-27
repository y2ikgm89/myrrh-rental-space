/**
 * /mypage/inquiries/[id] — お問い合わせ詳細ページ
 *
 * 顧客のお問い合わせ詳細を表示。
 */

import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { verifyCustomerSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerInquiryById } from "../../_lib/inquiry-queries";
import { Heading } from "@/public/components/design-system/heading";
import { Badge } from "@/public/components/design-system/badge";
import { INQUIRY_STATUS_CONFIG } from "../_components/inquiry-status";
import { formatSerializedDate } from "@/shared/lib/serialize";

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

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

  const formattedDate = formatSerializedDate(inquiry.createdAt, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="max-w-2xl">
      <Link
        href="/mypage/inquiries"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; お問い合わせ一覧に戻る
      </Link>

      <div className="mt-4">
        <div className="flex items-start justify-between gap-4">
          <Heading level={2}>{inquiry.subject}</Heading>
          {statusConfig && (
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          )}
        </div>

        <dl className="mt-6 space-y-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              お問い合わせ日
            </dt>
            <dd className="mt-1">{formattedDate}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              お名前
            </dt>
            <dd className="mt-1">{inquiry.name}</dd>
          </div>
          {inquiry.companyName && (
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                会社名
              </dt>
              <dd className="mt-1">{inquiry.companyName}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              メールアドレス
            </dt>
            <dd className="mt-1">{inquiry.email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              メッセージ
            </dt>
            <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-surface p-4">
              {inquiry.message}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
