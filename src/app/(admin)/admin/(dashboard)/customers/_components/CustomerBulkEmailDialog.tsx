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

/**
 * 顧客一括メール送信ダイアログ (Phase 4 顧客管理強化: Task 10)。
 *
 * `CancellationReasonDialog.tsx` と同型の「プリセット + 自由入力」パターン。
 * 件名 (Input) + 本文 (Textarea) の2フィールドを持つ点がキャンセル理由ダイアログ
 * (自由入力1フィールド) との違い。
 */

const BODY_PRESETS = [
  { value: "custom", label: "自由入力" },
  {
    value: "campaign",
    label: "キャンペーンのお知らせ",
    subject: "【お得なお知らせ】キャンペーンのご案内",
    body: "いつもご利用いただきありがとうございます。\n\n現在開催中のキャンペーンについてご案内いたします。",
  },
  {
    value: "maintenance",
    label: "メンテナンスのお知らせ",
    subject: "【重要】システムメンテナンスのお知らせ",
    body: "いつもご利用いただきありがとうございます。\n\n下記日程でシステムメンテナンスを実施いたします。",
  },
] as const;

const BODY_MAX = 5000;

interface CustomerBulkEmailDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (options: { subject: string; body: string }) => void;
  readonly isPending: boolean;
  readonly targetCount: number;
}

export function CustomerBulkEmailDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  targetCount,
}: CustomerBulkEmailDialogProps) {
  const [preset, setPreset] = useState<string>("custom");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setPreset("custom");
    setSubject("");
    setBody("");
    setError(null);
  };

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const found = BODY_PRESETS.find((p) => p.value === value);
    if (found && "subject" in found) {
      setSubject(found.subject);
      setBody(found.body);
    } else {
      setSubject("");
      setBody("");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    setError(null);
    if (subject.trim() === "") {
      setError("件名を入力してください。");
      return;
    }
    if (body.trim() === "") {
      setError("本文を入力してください。");
      return;
    }
    if (body.length > BODY_MAX) {
      setError(`本文は ${BODY_MAX} 文字以内で入力してください。`);
      return;
    }
    onConfirm({ subject: subject.trim(), body: body.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>一括メール送信</DialogTitle>
          <DialogDescription>
            {targetCount}
            件の顧客のうち、メール配信に同意済みの顧客のみに送信されます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-email-preset">テンプレート</Label>
            <Select
              value={preset}
              onValueChange={handlePresetChange}
              disabled={isPending}
            >
              <SelectTrigger id="bulk-email-preset">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {BODY_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-email-subject">件名</Label>
            <Input
              id="bulk-email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isPending}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-email-body">本文</Label>
            <Textarea
              id="bulk-email-body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={isPending}
              maxLength={BODY_MAX}
            />
            <p className="text-xs text-muted-foreground">
              {body.length} / {BODY_MAX}
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
            {isPending ? "送信中..." : "送信する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
