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

type Props = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly eventId: string;
  readonly tickets: Ticket[];
  readonly onSuccess: () => void;
  readonly action: (
    input: WalkInRegistrationInput,
  ) => Promise<
    MutationResult<{ registrationId: string; eventId: string; name: string }>
  >;
};

export function WalkInDialog({
  open,
  onOpenChange,
  eventId,
  tickets,
  onSuccess,
  action,
}: Props) {
  const firstTicketId = tickets[0]?.id ?? "";
  const [ticketId, setTicketId] = useState<string>(firstTicketId);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTicketId(firstTicketId);
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

  if (tickets.length === 0) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>当日参加を受け付けられません</DialogTitle>
            <DialogDescription>
              このイベントには有効なチケット種別がありません。
              先にイベント編集画面でチケットを設定してください。
            </DialogDescription>
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "受付中…" : "受付確定 (即出席)"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
