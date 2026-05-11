"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/admin/components/ui";
import { IconTrash } from "@tabler/icons-react";

// =============================================================================
// Props
// =============================================================================

type TaxonomyDeleteDialogProps = {
  label: string;
  postCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  isPending: boolean;
};

// =============================================================================
// Component
// =============================================================================

export function TaxonomyDeleteDialog({
  label,
  postCount,
  open,
  onOpenChange,
  onDelete,
  isPending,
}: TaxonomyDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          <IconTrash className="mr-2 h-4 w-4" />
          削除
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}を削除しますか？</DialogTitle>
          <DialogDescription>
            {postCount > 0 ? (
              <>
                この{label}には{postCount}
                件の投稿が紐づいています。
                削除すると、投稿との紐づけが解除されます。
              </>
            ) : (
              <>この操作は取り消せません。</>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={isPending}>
            {isPending ? "削除中..." : "削除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
