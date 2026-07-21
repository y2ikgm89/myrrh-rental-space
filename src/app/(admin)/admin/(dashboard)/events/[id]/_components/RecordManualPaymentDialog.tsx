"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/admin/components/ui";
import { recordManualEventPayment } from "@/admin/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const METHOD_OPTIONS = [
  { value: "CASH", label: "現金" },
  { value: "BANK_TRANSFER", label: "銀行振込" },
  { value: "OTHER", label: "その他" },
] as const;

interface RecordManualPaymentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly registrationId: string;
}

export function RecordManualPaymentDialog({
  open,
  onOpenChange,
  registrationId,
}: RecordManualPaymentDialogProps) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("");
  const [note, setNote] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setAmount("");
      setMethod("");
      setNote("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    setError(null);
    const amountNum = Number.parseInt(amount, 10);
    if (!Number.isInteger(amountNum) || amountNum < 1) {
      setError("金額は1以上の整数で入力してください。");
      return;
    }
    if (method !== "CASH" && method !== "BANK_TRANSFER" && method !== "OTHER") {
      setError("入金方法を選択してください。");
      return;
    }

    setIsPending(true);
    const result = await recordManualEventPayment({
      registrationId,
      amount: amountNum,
      method,
      note: note.trim() === "" ? undefined : note,
    });
    setIsPending(false);

    if (isMutationError(result)) {
      setError(result.error);
      return;
    }
    toast.success("入金を記録しました");
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>手動入金記録</DialogTitle>
          <DialogDescription>
            現金・銀行振込等、Stripeを経由しない入金を記録します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manual-payment-amount">金額（円）</Label>
            <Input
              id="manual-payment-amount"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-payment-method">入金方法</Label>
            <Select
              value={method}
              onValueChange={setMethod}
              disabled={isPending}
            >
              <SelectTrigger id="manual-payment-method">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-payment-note">メモ（任意）</Label>
            <Textarea
              id="manual-payment-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isPending}
            />
          </div>
          {error !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "記録中..." : "記録する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
