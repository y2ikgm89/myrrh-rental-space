"use client";

import { useState } from "react";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { buttonVariants } from "./ui/button";
import type { AnonymizeInquiryReason } from "@/shared/domain/inquiries/anonymize-commands";

type AnonymizeInquiryConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onConfirm: (reason: AnonymizeInquiryReason) => void;
  isPending?: boolean;
};

const REASON_OPTIONS: {
  value: AnonymizeInquiryReason;
  label: string;
  description: string;
}[] = [
  {
    value: "customer-requested",
    label: "顧客からの依頼",
    description: "顧客本人が削除を希望した場合 (GDPR / 個人情報保護法相当)",
  },
  {
    value: "admin-purge",
    label: "管理者による削除",
    description: "スパム・誤送信等、管理者判断の削除",
  },
  {
    value: "data-retention",
    label: "データ保持期限経過",
    description: "所定の保存期間を経過したデータの削除",
  },
];

/**
 * Inquiry Overhaul Phase 6: お問い合わせ匿名化用の確認ダイアログ (理由選択 UI 付き)。
 *
 * `AnonymizeCustomerConfirmDialog` と同型 UI。理由コードは AuditLog /
 * `Inquiry.anonymizedReason` に記録される (append-only 証跡)。
 */
export function AnonymizeInquiryConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isPending = false,
}: AnonymizeInquiryConfirmDialogProps) {
  const [reason, setReason] =
    useState<AnonymizeInquiryReason>("customer-requested");

  const displayTitle = title ?? "お問い合わせを匿名化しますか？";
  const displayDescription =
    description ??
    "この操作は取り消せません。お問い合わせ本文・返信・添付ファイルの個人情報が削除されます。";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{displayTitle}</AlertDialogTitle>
          <AlertDialogDescription>{displayDescription}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <Label className="text-sm font-medium">匿名化の理由</Label>
          <RadioGroup
            value={reason}
            onValueChange={(v) => setReason(v as AnonymizeInquiryReason)}
            disabled={isPending}
            aria-label="匿名化の理由"
          >
            {REASON_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-start gap-3">
                <RadioGroupItem
                  value={option.value}
                  id={`anonymize-inquiry-reason-${option.value}`}
                  className="mt-1"
                />
                <Label
                  htmlFor={`anonymize-inquiry-reason-${option.value}`}
                  className="flex-1 cursor-pointer space-y-0.5"
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {option.description}
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(reason)}
            disabled={isPending}
            className={buttonVariants({ variant: "destructive" })}
          >
            {isPending ? "匿名化中..." : "匿名化する"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
