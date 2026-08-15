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
import type { AnonymizeCustomerReason } from "@/shared/domain/customers/customer-lifecycle-commands";

type AnonymizeCustomerConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onConfirm: (reason: AnonymizeCustomerReason) => void;
  isPending?: boolean;
};

const REASON_OPTIONS: {
  value: AnonymizeCustomerReason;
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
    description: "誤登録・重複顧客のクリーンアップ等、管理者判断の削除",
  },
  {
    value: "data-retention",
    label: "データ保持期限経過",
    description: "所定の保存期間 (例: 5年) を経過したデータの削除",
  },
];

function isAnonymizeCustomerReason(
  value: string,
): value is AnonymizeCustomerReason {
  return REASON_OPTIONS.some((option) => option.value === value);
}

/**
 * STATE-03: 顧客匿名化用の確認ダイアログ (理由選択 UI 付き)。
 *
 * 決済歴のある顧客は物理削除できないため、旧「削除」の UI は「匿名化 + 理由」に置換された。
 * 理由コードは AuditLog / Customer.anonymizedReason に記録される (append-only 証跡)。
 */
export function AnonymizeCustomerConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isPending = false,
}: AnonymizeCustomerConfirmDialogProps) {
  const [reason, setReason] =
    useState<AnonymizeCustomerReason>("customer-requested");

  const displayTitle = title ?? "顧客を匿名化しますか？";
  const displayDescription =
    description ??
    "この操作は取り消せません。予約・領収書・お問い合わせは残りますが、個人情報は削除されます。";

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
            onValueChange={(v) => {
              if (isAnonymizeCustomerReason(v)) setReason(v);
            }}
            disabled={isPending}
            aria-label="匿名化の理由"
          >
            {REASON_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-start gap-3">
                <RadioGroupItem
                  value={option.value}
                  id={`anonymize-reason-${option.value}`}
                  className="mt-1"
                />
                <Label
                  htmlFor={`anonymize-reason-${option.value}`}
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
