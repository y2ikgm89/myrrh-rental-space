"use client";

import { useState, useTransition } from "react";
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
  SubmitButton,
} from "@/admin/components/ui";
import { toast } from "sonner";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import type { WalkInRegistrationInput } from "@/admin/actions/event-registration";

type Ticket = {
  id: string;
  name: string;
  price: number;
};

type SlotInfo = {
  id: string;
  /** ISO 8601 文字列（Date を page 側でシリアライズ） */
  startAt: string;
  endAt: string;
};

type Props = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly eventId: string;
  readonly tickets: Ticket[];
  readonly slots: SlotInfo[];
  readonly onSuccess: () => void;
  readonly action: (
    input: WalkInRegistrationInput,
  ) => Promise<
    MutationResult<{ registrationId: string; eventId: string; name: string }>
  >;
};

function formatSlotLabel(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dateLabel = start.toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateLabel} ${startTime}〜${endTime}`;
}

export function WalkInDialog({
  open,
  onOpenChange,
  eventId,
  tickets,
  slots,
  onSuccess,
  action,
}: Props) {
  const firstTicketId = tickets[0]?.id ?? "";
  const firstSlotId = slots[0]?.id ?? "";
  const [ticketId, setTicketId] = useState<string>(firstTicketId);
  const [slotId, setSlotId] = useState<string>(firstSlotId);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTicketId(firstTicketId);
    setSlotId(firstSlotId);
    setName("");
    setEmail("");
    setPhone("");
    setQuantity(1);
    setNote("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slotId) {
      toast.error("タイムスロットを選択してください");
      return;
    }
    if (!ticketId) {
      toast.error("チケット種別を選択してください");
      return;
    }
    if (!name.trim()) {
      toast.error("氏名を入力してください");
      return;
    }
    startTransition(async () => {
      const result = await action({
        eventId,
        slotId,
        ticketId,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
        quantity,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      reset();
      onSuccess();
    });
  }

  if (tickets.length === 0 || slots.length === 0) {
    const reason =
      tickets.length === 0
        ? "先にイベント編集画面でチケットを設定してください。"
        : "先にイベント編集画面でタイムスロットを設定してください。";
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>当日参加を受け付けられません</DialogTitle>
            <DialogDescription>{reason}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>当日参加を受付</DialogTitle>
          <DialogDescription>
            来場された参加者をその場で登録し、即出席扱いにします。確認メールは送信しません。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* スロット選択 */}
          {slots.length > 1 && (
            <div className="space-y-2">
              <Label>タイムスロット</Label>
              <div
                role="radiogroup"
                aria-label="タイムスロット"
                className="flex flex-wrap gap-2"
              >
                {slots.map((s) => {
                  const selected = slotId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSlotId(s.id)}
                      className={
                        selected
                          ? "rounded-md border-2 border-primary bg-primary/10 px-3 py-2 text-sm font-medium"
                          : "rounded-md border-2 border-muted-foreground/30 bg-background px-3 py-2 text-sm hover:border-muted-foreground/60"
                      }
                    >
                      {formatSlotLabel(s.startAt, s.endAt)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* チケット選択 */}
          {tickets.length > 1 && (
            <div className="space-y-2">
              <Label>チケット種別</Label>
              <div
                role="radiogroup"
                aria-label="チケット種別"
                className="flex flex-wrap gap-2"
              >
                {tickets.map((t) => {
                  const selected = ticketId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTicketId(t.id)}
                      className={
                        selected
                          ? "rounded-md border-2 border-primary bg-primary/10 px-3 py-2 text-sm font-medium"
                          : "rounded-md border-2 border-muted-foreground/30 bg-background px-3 py-2 text-sm hover:border-muted-foreground/60"
                      }
                    >
                      {t.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.price === 0
                          ? "無料"
                          : `¥${t.price.toLocaleString()}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 氏名 (必須) */}
          <div className="space-y-2">
            <Label htmlFor="walk-in-name">
              氏名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="walk-in-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              maxLength={100}
            />
          </div>

          {/* 参加人数 */}
          <div className="space-y-2">
            <Label htmlFor="walk-in-qty">参加人数</Label>
            <Input
              id="walk-in-qty"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={quantity}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                setQuantity(Number.isFinite(n) && n > 0 ? n : 1);
              }}
            />
          </div>

          {/* メール (任意) */}
          <div className="space-y-2">
            <Label htmlFor="walk-in-email">メール (任意)</Label>
            <Input
              id="walk-in-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              placeholder="未入力可"
            />
          </div>

          {/* 電話 (任意) */}
          <div className="space-y-2">
            <Label htmlFor="walk-in-phone">電話 (任意)</Label>
            <Input
              id="walk-in-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
              placeholder="未入力可"
            />
          </div>

          {/* メモ */}
          <div className="space-y-2">
            <Label htmlFor="walk-in-note">メモ (任意)</Label>
            <Input
              id="walk-in-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder="未入力可"
            />
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label="受付確定 (即出席)"
              pendingLabel="受付中…"
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
