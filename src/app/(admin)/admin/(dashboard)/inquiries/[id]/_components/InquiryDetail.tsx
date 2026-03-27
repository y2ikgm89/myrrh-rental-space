"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate } from "@/shared/lib/utils";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/admin/components/ui";
import { SubmitButton } from "@/admin/components/ui";
import { InquiryStatusBadge } from "@/admin/components/status-badges";
import { updateInquiryStatus, replyToInquiry } from "@/admin/actions/inquiry";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { InquiryWithCustomer } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";
import type { InquiryStatus } from "@/shared/db/enums";
import { isValidInquiryStatus } from "@/shared/lib/validations/enums/guards";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";

type InquiryDetailProps = {
  inquiry: Serialized<InquiryWithCustomer>;
};

export function InquiryDetail({ inquiry }: InquiryDetailProps) {
  const [isPending, startTransition] = useTransition();
  const [replyText, setReplyText] = useState("");
  const [isReplying, startReplyTransition] = useTransition();
  const router = useRouter();

  const handleStatusChange = async (status: InquiryStatus) => {
    startTransition(async () => {
      const result = await updateInquiryStatus(inquiry.id, status);
      if (isMutationError(result)) {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* メイン情報 */}
      <div className="md:col-span-2 space-y-6">
        {/* 受付日時 */}
        <p className="text-sm text-muted-foreground">
          受付日時: {formatDate(inquiry.createdAt, true)}
        </p>

        {/* 件名 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">件名</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{inquiry.subject}</p>
          </CardContent>
        </Card>

        {/* 本文 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              お問い合わせ内容
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{inquiry.message}</p>
          </CardContent>
        </Card>

        {/* 返信済み表示 */}
        {inquiry.replyMessage ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                回答内容
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="whitespace-pre-wrap">{inquiry.replyMessage}</p>
              <p className="text-xs text-muted-foreground">
                {inquiry.repliedBy?.name ?? "スタッフ"} -{" "}
                {inquiry.repliedAt ? formatDate(inquiry.repliedAt, true) : ""}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                回答を送信
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="回答内容を入力してください..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={6}
                disabled={isReplying}
              />
              <div className="flex justify-end">
                <SubmitButton
                  isPending={isReplying}
                  label="回答を送信"
                  pendingLabel="送信中..."
                  disabled={!replyText.trim()}
                  onClick={() => {
                    startReplyTransition(async () => {
                      const result = await replyToInquiry(
                        inquiry.id,
                        replyText,
                      );
                      if (isMutationError(result)) {
                        toast.error(result.error);
                      } else {
                        toast.success("回答を送信しました");
                        setReplyText("");
                        router.refresh();
                      }
                    });
                  }}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* サイドバー */}
      <div className="space-y-6">
        {/* ステータス */}
        <Card>
          <CardHeader>
            <CardTitle>ステータス</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">現在:</span>
              <InquiryStatusBadge status={inquiry.status} />
            </div>
            <Select
              value={inquiry.status}
              onValueChange={(value) => {
                if (isValidInquiryStatus(value)) handleStatusChange(value);
              }}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="ステータスを変更" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEW">新規</SelectItem>
                <SelectItem value="IN_PROGRESS">対応中</SelectItem>
                <SelectItem value="RESOLVED">解決済み</SelectItem>
                <SelectItem value="CLOSED">クローズ</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* 送信者情報 */}
        <DetailSection title="送信者情報">
          <div className="space-y-4">
            <DetailField label="お名前" value={inquiry.name} />
            {inquiry.companyName ? (
              <DetailField label="会社名・団体名" value={inquiry.companyName} />
            ) : null}
            <DetailField
              label="メールアドレス"
              value={
                <a
                  href={`mailto:${inquiry.email}`}
                  className="text-primary hover:underline"
                >
                  {inquiry.email}
                </a>
              }
            />
            <DetailField
              label="紐づけ顧客"
              value={
                inquiry.customer ? (
                  <Link
                    href={`/admin/customers/${inquiry.customer.id}`}
                    className="text-primary hover:underline"
                  >
                    {inquiry.customer.lastName} {inquiry.customer.firstName}
                  </Link>
                ) : (
                  "なし"
                )
              }
            />
          </div>
        </DetailSection>

        {/* 外部メールアクション */}
        <Card>
          <CardHeader>
            <CardTitle>外部メール</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link
                href={`mailto:${inquiry.email}?subject=Re: ${encodeURIComponent(inquiry.subject)}`}
              >
                メールクライアントで返信
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
