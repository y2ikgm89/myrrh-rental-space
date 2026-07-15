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
import { formatPrice } from "@/shared/lib/pricing/format";

/**
 * 管理者返金ダイアログ (task #9 PR#4)。
 *
 * 「金額 (空欄=残額全額)」+「理由 (プリセット or 自由入力)」の 2 field を受けて、
 * 呼出側の `onConfirm` に options を渡す。amount / reason の server 側 validation は
 * `refundReservationPaymentCommand` が担当 (残額超過等は VALIDATION reject)。
 *
 * conform を使わず useState で保持しているのは:
 * - 2 field の小規模フォーム (conform overkill)
 * - amount / reason 両方 optional (parseWithZod の空入力→undefined 変換の罠を回避)
 * - 呼出側 (`refundReservationPayment` action) は options 引数直渡し pattern
 */

const REASON_PRESETS = [
  { value: "顧客都合キャンセル", label: "顧客都合キャンセル" },
  { value: "スペース側事情", label: "スペース側事情" },
  { value: "重複予約", label: "重複予約" },
  { value: "custom", label: "その他 (自由入力)" },
] as const;

const CUSTOM_REASON_MAX = 500;

interface RefundDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** 予約合計 (税込)。金額 input の placeholder + 超過 client validation に使う */
  readonly totalPriceWithTax: number;
  /** 部分返金既発生時の累積額 (未指定なら 0)。残額 = totalPriceWithTax - cumulativeRefunded */
  readonly cumulativeRefunded?: number;
  readonly onConfirm: (options: { amount?: number; reason?: string }) => void;
  readonly isPending: boolean;
}

export function RefundDialog({
  open,
  onOpenChange,
  totalPriceWithTax,
  cumulativeRefunded = 0,
  onConfirm,
  isPending,
}: RefundDialogProps) {
  const [amountStr, setAmountStr] = useState("");
  const [reasonPreset, setReasonPreset] = useState<string>("");
  const [customReason, setCustomReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const remaining = Math.max(0, totalPriceWithTax - cumulativeRefunded);
  const isFullRefund = amountStr.trim() === "";
  const reason =
    reasonPreset === "custom"
      ? customReason.trim()
      : reasonPreset === ""
        ? ""
        : reasonPreset;

  const resetForm = () => {
    setAmountStr("");
    setReasonPreset("");
    setCustomReason("");
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    setError(null);

    // amount 未指定 → 全額返金
    let amountNum: number | undefined;
    if (!isFullRefund) {
      // Codex P2 (PR #1127) 対応: `Number.parseInt` は "1.9" → 1、"1e3" → 1 のように
      // 先頭数字だけ切り出して truncate するため、fractional / exponent 入力を silent に
      // 別金額へ変換してしまう。正規表現で「正の整数のみ (符号・小数点・指数・
      // カンマ・空白 NG)」を厳格に validate する。
      const trimmed = amountStr.trim();
      if (!/^\d+$/.test(trimmed)) {
        setError(
          "金額は正の整数のみ入力できます (小数点・指数・カンマ・空白は不可)。",
        );
        return;
      }
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setError("金額は 1 以上の整数で入力してください。");
        return;
      }
      if (parsed > remaining) {
        setError(`金額が残額 (${formatPrice(remaining)}) を超えています。`);
        return;
      }
      amountNum = parsed;
    }

    // custom 選択時に自由入力が空なら error
    if (reasonPreset === "custom" && customReason.trim() === "") {
      setError("理由を入力してください。");
      return;
    }
    if (customReason.length > CUSTOM_REASON_MAX) {
      setError(`理由は ${CUSTOM_REASON_MAX} 文字以内で入力してください。`);
      return;
    }

    onConfirm({
      ...(amountNum !== undefined ? { amount: amountNum } : {}),
      ...(reason !== "" ? { reason } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>返金処理</DialogTitle>
          <DialogDescription>
            この操作は取り消せません。返金額と理由を確認して実行してください。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="refund-amount">返金額 (円、空欄で残額全額)</Label>
            <Input
              id="refund-amount"
              type="number"
              min="1"
              step="1"
              placeholder={`${formatPrice(remaining)} (残額全額)`}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              合計 {formatPrice(totalPriceWithTax)} — 累積返金額{" "}
              {formatPrice(cumulativeRefunded)} — 残額 {formatPrice(remaining)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="refund-reason-preset">返金理由 (任意)</Label>
            <Select
              value={reasonPreset}
              onValueChange={setReasonPreset}
              disabled={isPending}
            >
              <SelectTrigger id="refund-reason-preset">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {REASON_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reasonPreset === "custom" ? (
            <div className="space-y-2">
              <Label htmlFor="refund-custom-reason">理由 (自由入力)</Label>
              <Textarea
                id="refund-custom-reason"
                rows={3}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                disabled={isPending}
                maxLength={CUSTOM_REASON_MAX}
              />
              <p className="text-xs text-muted-foreground">
                {customReason.length} / {CUSTOM_REASON_MAX}
              </p>
            </div>
          ) : null}

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
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? "処理中..." : "返金する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
