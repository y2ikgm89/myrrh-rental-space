"use client";

import { useTransition } from "react";
import Link from "next/link";
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
} from "@/admin/components/ui";
import { InquiryStatusBadge } from "@/admin/components/status-badges";
import { updateInquiryStatus } from "@/admin/actions/inquiry";
import type { InquiryData } from "@/admin/actions/inquiry";
import {
  isValidInquiryStatus,
  type InquiryStatus,
} from "@/shared/lib/validations/enums";

type InquiryDetailProps = {
  inquiry: InquiryData;
};

export function InquiryDetail({ inquiry }: InquiryDetailProps) {
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = async (status: InquiryStatus) => {
    startTransition(async () => {
      const result = await updateInquiryStatus(inquiry.id, status);
      if (!result.success) {
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
            <CardTitle>件名</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{inquiry.subject}</p>
          </CardContent>
        </Card>

        {/* 本文 */}
        <Card>
          <CardHeader>
            <CardTitle>お問い合わせ内容</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{inquiry.message}</p>
          </CardContent>
        </Card>
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
        <Card>
          <CardHeader>
            <CardTitle>送信者情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">お名前</p>
              <p className="font-medium">{inquiry.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">メールアドレス</p>
              <a
                href={`mailto:${inquiry.email}`}
                className="text-primary hover:underline"
              >
                {inquiry.email}
              </a>
            </div>
          </CardContent>
        </Card>

        {/* 返信アクション */}
        <Card>
          <CardHeader>
            <CardTitle>アクション</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link
                href={`mailto:${inquiry.email}?subject=Re: ${encodeURIComponent(inquiry.subject)}`}
              >
                メールで返信
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
