"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@/admin/components/ui";
import { updateInquirySla } from "@/admin/actions/inquiry/ops";
import { formatDateTimeLocalInJst } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";

type InquirySlaCardProps = {
  inquiryId: string;
  slaExpiresAt: string | null;
};

export function InquirySlaCard({
  inquiryId,
  slaExpiresAt,
}: InquirySlaCardProps) {
  const [value, setValue] = useState(() =>
    slaExpiresAt ? formatDateTimeLocalInJst(slaExpiresAt) : "",
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // NotificationList.tsx と同型: 「超過バッジ」の基準時刻読み取りは意図的な
  // impure read (React Compiler purity ルール対象外として明示 disable)。
  // eslint-disable-next-line react-hooks/purity, @eslint-react/purity -- Client Component: SLA 超過判定の基準時刻読み取りは意図的
  const nowMs = Date.now();
  const isExpired = slaExpiresAt
    ? new Date(slaExpiresAt).getTime() < nowMs
    : false;

  const submit = (nextValue: string | null) => {
    startTransition(async () => {
      const result = await updateInquirySla(inquiryId, nextValue);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("SLA対応期限を更新しました");
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          SLA対応期限
          {isExpired && <Badge variant="destructive">超過</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="datetime-local"
          aria-label="SLA対応期限"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isPending}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => submit(value || null)}
            disabled={isPending}
          >
            保存
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending || (!value && !slaExpiresAt)}
            onClick={() => {
              setValue("");
              submit(null);
            }}
          >
            クリア
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
