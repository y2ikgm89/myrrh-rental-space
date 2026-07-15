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
  Textarea,
} from "@/admin/components/ui";

/**
 * 領収書再発行ダイアログ (task #7 PR#6)。
 *
 * 「再発行理由」を必須入力させて `reissueReservationReceipt` server action を呼ぶ。
 * 元 Receipt は orphan 化 (`reservationId` = NULL)、新 Receipt は同 `reservationId` +
 * `reissuedFromId` chain + `revision +1` + 新 `serialNo` で発行される (domain command 側)。
 */

const REASON_MAX = 500;

interface ReissueReceiptDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** 元 Receipt の serialNo (dialog 表示に使う) */
  readonly currentSerialNo: string;
  /** 元 Receipt の revision (dialog 表示に使う) */
  readonly currentRevision: number;
  readonly onConfirm: (reason: string) => void;
  readonly isPending: boolean;
}

export function ReissueReceiptDialog({
  open,
  onOpenChange,
  currentSerialNo,
  currentRevision,
  onConfirm,
  isPending,
}: ReissueReceiptDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // DialogOverlay/X ボタン経由の close で state reset。
      // parent 直呼び (成功時の `setReissueDialogOpen(false)` 等) 経由の close は
      // parent 側で `key` prop を bump することで Dialog を re-mount し fresh state に戻す
      // pattern を推奨 (React docs "Adjusting Some State When a Prop Changes" 準拠)。
      // Codex P2 (PR #1131) 対応。
      setReason("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setError("再発行理由の入力が必要です。");
      return;
    }
    if (trimmed.length > REASON_MAX) {
      setError(`理由は ${REASON_MAX} 文字以内で入力してください。`);
      return;
    }
    onConfirm(trimmed);
  };

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
            <Label htmlFor="reissue-reason">再発行理由 (必須)</Label>
            <Textarea
              id="reissue-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              maxLength={REASON_MAX}
              placeholder="例: 宛名の誤入力訂正、発行事業者情報の変更"
            />
            <p className="text-xs text-muted-foreground">
              {reason.length} / {REASON_MAX}
            </p>
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
          <Button type="button" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "処理中..." : "再発行する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
