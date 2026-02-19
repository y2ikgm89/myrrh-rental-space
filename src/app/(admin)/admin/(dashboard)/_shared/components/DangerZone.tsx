"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui/card";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import type { ActionResult } from "@/admin/types/server-actions";

type DangerZoneProps = {
  deleteLabel: string;
  itemName?: string;
  onDelete: () => Promise<ActionResult>;
  redirectTo: string;
};

export function DangerZone({
  deleteLabel,
  itemName,
  onDelete,
  redirectTo,
}: DangerZoneProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await onDelete();
      if (result.success) {
        router.push(redirectTo);
      } else {
        setOpen(false);
        toast.error(result.error);
      }
    });
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-destructive">
          危険な操作
        </CardTitle>
        <CardDescription>この操作は取り消せません</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={isPending}
        >
          {deleteLabel}
        </Button>
      </CardContent>
      <DeleteConfirmDialog
        open={open}
        onOpenChange={setOpen}
        itemName={itemName}
        onConfirm={handleConfirm}
        isPending={isPending}
      />
    </Card>
  );
}
