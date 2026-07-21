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
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/admin/components/ui";

/**
 * 予約キャンセル理由入力ダイアログ (Phase 3)。
 *
 * RefundDialog.tsx と同型の「プリセット + 自由入力 + 文字数制限」パターン。
 * 一覧行 (ReservationStatusSelect)・詳細ページ (ReservationDetail)・一括操作
 * (ReservationBulkActions) の3導線から共通で使う。
 */

const REASON_PRESETS = [
  { value: "顧客都合キャンセル", label: "顧客都合キャンセル" },
  { value: "スペース側事情", label: "スペース側事情" },
  { value: "重複予約", label: "重複予約" },
  { value: "custom", label: "その他 (自由入力)" },
] as const;

const CUSTOM_REASON_MAX = 500;

interface CancellationReasonDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (reason?: string) => void;
  readonly isPending: boolean;
  /** 一括キャンセル等、対象件数を明示したい場合に表示 (単発は省略可)。 */
  readonly targetCount?: number;
}

export function CancellationReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  targetCount,
}: CancellationReasonDialogProps) {
  const [reasonPreset, setReasonPreset] = useState<string>("");
  const [customReason, setCustomReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reason =
    reasonPreset === "custom"
      ? customReason.trim()
      : reasonPreset === ""
        ? ""
        : reasonPreset;

  const resetForm = () => {
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

    if (reasonPreset === "custom" && customReason.trim() === "") {
      setError("理由を入力してください。");
      return;
    }
    if (customReason.length > CUSTOM_REASON_MAX) {
      setError(`理由は ${CUSTOM_REASON_MAX} 文字以内で入力してください。`);
      return;
    }

    onConfirm(reason !== "" ? reason : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>予約をキャンセルしますか？</DialogTitle>
          <DialogDescription>
            {targetCount !== undefined
              ? `${targetCount} 件の予約をキャンセルします。この操作は取り消せません。`
              : "この操作後、ステータスは終端状態となり、通常の管理者では戻せません。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cancellation-reason-preset">
              キャンセル理由 (任意)
            </Label>
            <Select
              value={reasonPreset}
              onValueChange={setReasonPreset}
              disabled={isPending}
            >
              <SelectTrigger id="cancellation-reason-preset">
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
              <Label htmlFor="cancellation-custom-reason">
                理由 (自由入力)
              </Label>
              <Textarea
                id="cancellation-custom-reason"
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
            {isPending ? "処理中..." : "キャンセルする"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
