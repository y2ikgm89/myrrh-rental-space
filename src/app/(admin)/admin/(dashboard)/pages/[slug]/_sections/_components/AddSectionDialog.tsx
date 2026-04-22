"use client";

/**
 * セクション追加ダイアログ
 *
 * 17セクションタイプを5カテゴリに分類して表示
 */

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/admin/components/ui";
import {
  sectionTypeLabels,
  sectionTypeDescriptions,
  sectionTypesByCategory,
} from "@/shared/lib/validations/section";
import { SectionTypeIcon } from "./SectionTypeIcon";

interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (type: string) => void;
  disabled: boolean;
}

export function AddSectionDialog({
  open,
  onOpenChange,
  onAdd,
  disabled,
}: AddSectionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[var(--modal-max-height)] overflow-hidden flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>セクションを追加</AlertDialogTitle>
          <AlertDialogDescription>
            ページに追加するセクションタイプを選択
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-5 py-4 overflow-y-auto">
          {sectionTypesByCategory.map(({ category, label, types }) => (
            <div key={category}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {label}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {types.map((type) => {
                  const typeLabel = sectionTypeLabels[type];
                  const description = sectionTypeDescriptions[type];

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        onAdd(type);
                        onOpenChange(false);
                      }}
                      disabled={disabled}
                      className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="p-2 rounded-md bg-primary/10 shrink-0">
                        <SectionTypeIcon
                          type={type}
                          className="h-5 w-5 text-primary"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{typeLabel}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
