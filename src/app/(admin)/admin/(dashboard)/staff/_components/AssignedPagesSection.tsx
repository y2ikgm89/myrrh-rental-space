"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Label,
  SubmitButton,
} from "@/admin/components/ui";
import { setAssignedPageIdsForUserAction } from "@/admin/actions/user-page-assignments";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { PageAssignmentOption } from "@/shared/domain/pages/types";

type AssignedPagesSectionProps = {
  userId: string;
  pages: PageAssignmentOption[];
  assignedPageIds: string[];
  canEdit: boolean;
};

export function AssignedPagesSection({
  userId,
  pages,
  assignedPageIds,
  canEdit,
}: AssignedPagesSectionProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(assignedPageIds);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = (pageId: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...current, pageId] : current.filter((id) => id !== pageId),
    );
  };

  const allSelected =
    pages.length > 0 && pages.every((page) => selectedIds.includes(page.id));

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await setAssignedPageIdsForUserAction(userId, selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("割り当てページを更新しました");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          割り当てページ
        </CardTitle>
        <CardDescription>
          編集者が管理画面で編集できるページを選択します。未割り当てのページは編集できません。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              割り当て可能なページがありません
            </p>
          ) : (
            <div className="space-y-3">
              {canEdit && (
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">
                    {selectedIds.length}件選択中
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      setSelectedIds(
                        allSelected ? [] : pages.map((page) => page.id),
                      )
                    }
                  >
                    {allSelected ? "すべて解除" : "すべて選択"}
                  </Button>
                </div>
              )}
              <div className="space-y-2 rounded-lg border p-3">
                {pages.map((page) => {
                  const checkboxId = `assigned-page-${page.id}`;
                  return (
                    <div key={page.id} className="flex items-start gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={selectedIds.includes(page.id)}
                        disabled={!canEdit || isPending}
                        onCheckedChange={(checked) =>
                          toggle(page.id, checked === true)
                        }
                      />
                      <Label
                        htmlFor={checkboxId}
                        className="cursor-pointer text-sm font-normal leading-snug"
                      >
                        <span className="font-medium">{page.title}</span>
                        <span className="ml-2 text-muted-foreground">
                          /{page.slug}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {canEdit && pages.length > 0 && (
            <SubmitButton isPending={isPending} label="保存" />
          )}
        </form>
      </CardContent>
    </Card>
  );
}
