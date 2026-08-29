"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Label,
} from "@/admin/components/ui";
import { setInquiryTags } from "@/admin/actions/inquiry/ops";
import { isMutationError } from "@/shared/lib/mutation-result";
import type {
  InquiryTagItem,
  InquiryTagOption,
} from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";

type InquiryTagsCardProps = {
  inquiryId: string;
  tags: Serialized<InquiryTagItem>[];
  allTags: Serialized<InquiryTagOption>[];
};

export function InquiryTagsCard({
  inquiryId,
  tags,
  allTags,
}: InquiryTagsCardProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const selectedIds = new Set(tags.map((t) => t.id));

  const handleToggle = (tagId: string, checked: boolean) => {
    const nextIds = checked
      ? [...selectedIds, tagId]
      : [...selectedIds].filter((id) => id !== tagId);

    startTransition(async () => {
      const result = await setInquiryTags(inquiryId, nextIds);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("タグを更新しました");
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>タグ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {allTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            タグが登録されていません
          </p>
        ) : (
          <div className="space-y-2">
            {allTags.map((tag) => (
              <div key={tag.id} className="flex items-center gap-2">
                <Checkbox
                  id={`inquiry-tag-${tag.id}`}
                  checked={selectedIds.has(tag.id)}
                  disabled={isPending}
                  onCheckedChange={(checked) => handleToggle(tag.id, checked)}
                />
                <Label
                  htmlFor={`inquiry-tag-${tag.id}`}
                  className="cursor-pointer text-sm font-normal"
                >
                  {tag.name}
                </Label>
              </div>
            ))}
          </div>
        )}
        <Link
          href="/admin/inquiries/tags"
          className="inline-block text-sm text-primary hover:underline"
        >
          タグを管理
        </Link>
      </CardContent>
    </Card>
  );
}
