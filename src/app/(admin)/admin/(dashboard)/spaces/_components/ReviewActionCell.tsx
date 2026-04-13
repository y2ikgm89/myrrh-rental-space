"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { toggleReviewVisibility, deleteReview } from "@/admin/actions/review";
import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

type ReviewActionCellProps = {
  reviewId: string;
  isPublished: boolean;
};

// =============================================================================
// ReviewActionCell Component
// =============================================================================

export function ReviewActionCell({
  reviewId,
  isPublished,
}: ReviewActionCellProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isToggling, startToggleTransition] = useTransition();
  const router = useRouter();

  const handleToggleVisibility = () => {
    startToggleTransition(async () => {
      const result = await toggleReviewVisibility(reviewId, !isPublished);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success(isPublished ? "非公開にしました" : "公開しました");
        router.refresh();
      }
    });
  };

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem
          onClick={handleToggleVisibility}
          disabled={isToggling}
        >
          {isPublished ? "非公開にする" : "公開する"}
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>
          削除
        </ActionDropdownItem>
      </ActionDropdown>
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={`レビュー #${reviewId.slice(0, 8)}`}
        onConfirm={async () => {
          const result = await deleteReview(reviewId);
          if (isMutationError(result)) {
            toast.error(result.error);
          } else {
            toast.success("レビューを削除しました");
            router.refresh();
          }
        }}
      />
    </>
  );
}
