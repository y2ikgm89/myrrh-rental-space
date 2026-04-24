"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui/button";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { toAppRoute } from "@/shared/lib/typed-routes";

type DetailDeleteButtonProps = {
  itemName?: string;
  onDelete: () => Promise<MutationResult<unknown>>;
  redirectTo: string;
  successMessage?: string;
};

export function DetailDeleteButton({
  itemName,
  onDelete,
  redirectTo,
  successMessage,
}: DetailDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await onDelete();
      if (!isMutationError(result)) {
        if (successMessage) toast.success(successMessage);
        router.push(toAppRoute(redirectTo));
      } else {
        setOpen(false);
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        <IconTrash className="mr-2 h-4 w-4" />
        削除
      </Button>
      <DeleteConfirmDialog
        open={open}
        onOpenChange={setOpen}
        {...(itemName !== undefined && { itemName })}
        onConfirm={handleConfirm}
        isPending={isPending}
      />
    </>
  );
}
