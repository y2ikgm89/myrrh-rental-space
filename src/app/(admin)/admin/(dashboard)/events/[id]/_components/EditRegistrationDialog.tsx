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
  Textarea,
} from "@/admin/components/ui";
import { updateEventRegistration } from "@/admin/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface EditRegistrationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly registration: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    note: string | null;
    quantity: number;
  };
}

export function EditRegistrationDialog({
  open,
  onOpenChange,
  registration,
}: EditRegistrationDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(registration.name);
  const [email, setEmail] = useState(registration.email ?? "");
  const [phone, setPhone] = useState(registration.phone ?? "");
  const [note, setNote] = useState(registration.note ?? "");
  const [quantity, setQuantity] = useState(String(registration.quantity));
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(registration.name);
      setEmail(registration.email ?? "");
      setPhone(registration.phone ?? "");
      setNote(registration.note ?? "");
      setQuantity(String(registration.quantity));
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    setError(null);
    const quantityNum = Number.parseInt(quantity, 10);
    if (!Number.isInteger(quantityNum) || quantityNum < 1) {
      setError("参加人数は1以上の整数で入力してください。");
      return;
    }

    setIsPending(true);
    const result = await updateEventRegistration({
      registrationId: registration.id,
      name,
      email: email.trim() === "" ? undefined : email,
      phone: phone.trim() === "" ? undefined : phone,
      note: note.trim() === "" ? undefined : note,
      quantity: quantityNum,
    });
    setIsPending(false);

    if (isMutationError(result)) {
      setError(result.error);
      return;
    }
    toast.success("参加登録を更新しました");
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>参加登録を編集</DialogTitle>
          <DialogDescription>
            氏名・連絡先・参加人数・備考を修正できます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-reg-name">氏名</Label>
            <Input
              id="edit-reg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-reg-email">メール</Label>
            <Input
              id="edit-reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-reg-phone">電話番号</Label>
            <Input
              id="edit-reg-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-reg-quantity">参加人数</Label>
            <Input
              id="edit-reg-quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-reg-note">備考</Label>
            <Textarea
              id="edit-reg-note"
              rows={3}
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
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isPending}
          >
            {isPending ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
