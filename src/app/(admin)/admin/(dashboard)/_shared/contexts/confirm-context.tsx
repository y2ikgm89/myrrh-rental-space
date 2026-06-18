"use client";

/**
 * ConfirmProvider + useConfirm
 *
 * window.confirm() の代替。Promise-based API で AlertDialog を表示。
 * usage: const confirmed = await confirm({ title, description })
 */

import { createContext, use, useState, useRef, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/admin/components/ui";
import { buttonVariants } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | undefined>(
  undefined,
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: "",
  });

  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  };

  const handleConfirm = () => {
    setOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  };

  const handleCancel = () => {
    setOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  };

  return (
    <ConfirmContext value={{ confirm }}>
      {children}
      {/* 確認ダイアログは短文＋ボタンのみ。Dialog 既定の max-w-lg は広すぎるため
          AlertDialog 用途に合わせ max-w-sm に締める（width だけ上書き、footer はそのまま）。 */}
      <AlertDialog open={open} onOpenChange={(v) => !v && handleCancel()}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description && (
              <AlertDialogDescription>
                {options.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {options.cancelLabel ?? "キャンセル"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                options.variant === "destructive" &&
                  buttonVariants({ variant: "destructive" }),
              )}
            >
              {options.confirmLabel ?? "確認"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext>
  );
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const context = use(ConfirmContext);
  if (context === undefined) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return context.confirm;
}
