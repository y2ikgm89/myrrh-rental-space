"use client";

import { useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@/admin/components/ui";

/**
 * 領収書再発行ダイアログ (RECEIPT-USEDAT-P2、`/admin/receipts/[serialNo]` 版)。
 *
 * 予約詳細ページ側の `ReissueReceiptDialog` と役割は同じだが、独立した領収書詳細ページ
 * では以下の追加確認を求める:
 * - 「以前の領収書は無効化されます / 顧客へ新しい確認メールが自動送信されます」の acknowledgement checkbox
 * - reason は最低 5 文字以上 (説明責任 + 監査品質)
 *
 * 送信は parent が `reissueReservationReceipt` / `reissueEventRegistrationReceipt` を
 * polymorphic に振り分ける (receipt が reservation-side か event-registration-side かで分岐)。
 */

const REASON_MIN = 5;
const REASON_MAX = 500;

interface ReceiptReissueDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentSerialNo: string;
  readonly currentRevision: number;
  readonly onConfirm: (reason: string) => void;
  readonly isPending: boolean;
}

export function ReceiptReissueDialog({
  open,
  onOpenChange,
  currentSerialNo,
  currentRevision,
  onConfirm,
  isPending,
}: ReceiptReissueDialogProps) {
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setReason("");
      setAcknowledged(false);
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN) {
      setError(`再発行理由は ${REASON_MIN} 文字以上で入力してください。`);
      return;
    }
    if (trimmed.length > REASON_MAX) {
      setError(`理由は ${REASON_MAX} 文字以内で入力してください。`);
      return;
    }
    if (!acknowledged) {
      setError("確認事項にチェックを入れてください。");
      return;
    }
    onConfirm(trimmed);
  };

  const canSubmit = acknowledged && reason.trim().length >= REASON_MIN;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>領収書を再発行</DialogTitle>
          <DialogDescription>
            現在の領収書 (No. {currentSerialNo}
            {currentRevision > 0 ? ` / 訂正 rev.${currentRevision}` : ""}) を
            無効化し、新しい連番で再発行します。元領収書は監査証跡として残ります。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reissue-reason">
              再発行理由 (必須、{REASON_MIN} 文字以上)
            </Label>
            <Textarea
              id="reissue-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              maxLength={REASON_MAX}
              placeholder="例: 宛名の誤入力訂正、発行事業者情報の変更、顧客からの再発行依頼 (保存し忘れ) など"
            />
            <p className="text-xs text-muted-foreground">
              {reason.length} / {REASON_MAX}
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
            <Checkbox
              id="reissue-acknowledge"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked)}
              disabled={isPending}
            />
            <Label
              htmlFor="reissue-acknowledge"
              className="text-sm font-normal leading-relaxed"
            >
              以前の領収書は無効化されます。顧客には新しい確認メールが自動送信され、
              旧領収書の再取得はできなくなります。
            </Label>
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
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || !canSubmit}
          >
            {isPending ? "処理中..." : "再発行する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
