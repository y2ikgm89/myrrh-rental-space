"use client";

/**
 * AddSectionDialog — 「+ 追加」ボタンクリック時に開く Dialog。
 *
 * SectionTypePicker で type を選択すると `createPageSection` を呼んで
 * セクションを追加し、再フェッチする。
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/admin/components/ui";
import { createPageSection } from "@/admin/actions/page-section";
import { isMutationError } from "@/shared/lib/mutation-result";
import { SectionTypePicker } from "./SectionTypePicker";

interface AddSectionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pageId: string;
  readonly availableTypes: readonly string[];
  readonly onCreated?: (sectionId: string) => void;
}

export function AddSectionDialog({
  open,
  onOpenChange,
  pageId,
  availableTypes,
  onCreated,
}: AddSectionDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSelect = (type: string) => {
    startTransition(async () => {
      const result = await createPageSection({ pageId, type });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("セクションを追加しました");
      onOpenChange(false);
      onCreated?.(result.id);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80svh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>セクションを追加</DialogTitle>
        </DialogHeader>
        <SectionTypePicker
          availableTypes={availableTypes}
          onSelect={handleSelect}
          disabled={isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
