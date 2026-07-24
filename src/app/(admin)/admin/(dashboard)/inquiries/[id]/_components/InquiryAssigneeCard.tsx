"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
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
import { assignInquiry } from "@/admin/actions/inquiry/ops";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { AssignableStaffOption } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";

const UNASSIGNED_VALUE = "__UNASSIGNED__";

type InquiryAssigneeCardProps = {
  inquiryId: string;
  assigneeId: string | null;
  staff: Serialized<AssignableStaffOption>[];
};

export function InquiryAssigneeCard({
  inquiryId,
  assigneeId,
  staff,
}: InquiryAssigneeCardProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleChange = (value: string) => {
    const nextAssigneeId = value === UNASSIGNED_VALUE ? null : value;
    startTransition(async () => {
      const result = await assignInquiry(inquiryId, nextAssigneeId);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("担当者を更新しました");
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>担当者</CardTitle>
      </CardHeader>
      <CardContent>
        <Select
          value={assigneeId ?? UNASSIGNED_VALUE}
          onValueChange={handleChange}
          disabled={isPending}
        >
          <SelectTrigger aria-label="担当者を変更">
            <SelectValue placeholder="担当者を選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED_VALUE}>未割当</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
