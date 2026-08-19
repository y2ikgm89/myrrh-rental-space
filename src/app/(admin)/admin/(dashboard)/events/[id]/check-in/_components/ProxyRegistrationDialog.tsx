"use client";

import { useActionState, useEffect, useRef } from "react";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import type { z } from "zod";
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
import type { SubmissionResult } from "@conform-to/react";
import { adminProxyRegistrationSchema } from "@/shared/lib/validations/event-registration-onsite";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";
import {
  HiddenControlInput,
  useFieldControl,
} from "@/shared/lib/conform/control";
import { useRadioGroupKeyboard } from "@/shared/lib/a11y/use-radio-group-keyboard";
import { formatJstMonthDay, formatTimeShort } from "@/shared/lib/date-format";

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
    prev: SubmissionResult | undefined,
    formData: FormData,
  ) => Promise<SubmissionResult>;
};

// JST-DRIFT-04: timeZone 未指定だと SSR 側 (Cloud Run UTC) と CSR 側 (browser 局所 tz)
// で表示日時が異なる可能性があり、React hydration mismatch と管理者向け slot 表示の
// JST ずれを同時に起こす silent bug。date-format.ts の SSoT 契約に従い明示的に JST 固定。
function formatSlotLabel(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dateLabel = formatJstMonthDay(start);
  return `${dateLabel} ${formatTimeShort(start)}〜${formatTimeShort(end)}`;
}

/**
 * 事前代行登録 Dialog（管理者が電話・口頭申込を代理登録）。
 *
 * WalkInDialog との違い:
 * - メール必須（確認メールを送信するため）
 * - attendedAt は打刻しない（当日出席は check-in ボタンで別途操作）
 * - 送信文言・タイトルを walk-in と区別
 */
export function ProxyRegistrationDialog({
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
  const [lastResult, formAction, isPending] = useActionState(action, undefined);

  const [form, fields] = useForm<z.input<typeof adminProxyRegistrationSchema>>({
    id: `admin-proxy-${eventId}`,
    lastResult,
    constraint: getZodConstraint(adminProxyRegistrationSchema),
    defaultValue: {
      eventId,
      slotId: firstSlotId,
      ticketId: firstTicketId,
      quantity: "1",
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: adminProxyRegistrationSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由は helper の JSDoc）。ここでは権限拒否・定員超過・
    // 機能 OFF がこの経路で返る。
    onSubmit: dispatchWithoutFormReset(formAction),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  // slot / ticket は button 要素の独自 radio group（WAI-ARIA APG の roving
  // tabindex）で選ぶため、conform には hidden input 経由で伝える。
  const slotIdControl = useFieldControl(fields.slotId);
  const ticketIdControl = useFieldControl(fields.ticketId);
  const slotId = slotIdControl.value ?? firstSlotId;
  const ticketId = ticketIdControl.value ?? firstTicketId;

  const slotRadio = useRadioGroupKeyboard<SlotInfo, string, HTMLButtonElement>({
    items: slots,
    selected: slotId,
    onSelect: (id) => slotIdControl.change(id),
    getKey: (s) => s.id,
    disabled: slots.length <= 1,
  });
  const ticketRadio = useRadioGroupKeyboard<Ticket, string, HTMLButtonElement>({
    items: tickets,
    selected: ticketId,
    onSelect: (id) => ticketIdControl.change(id),
    getKey: (t) => t.id,
    disabled: tickets.length <= 1,
  });

  // 成功したらダイアログを閉じて一覧を更新する。`resetForm: true` の reply は
  // `initialValue === null` を返すので、それを合図にする。
  const handledResultRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (!lastResult || lastResult.initialValue !== null) return;
    if (handledResultRef.current === lastResult) return;
    handledResultRef.current = lastResult;
    onOpenChange(false);
    onSuccess();
  }, [lastResult, onOpenChange, onSuccess]);

  function handleOpenChange(next: boolean) {
    if (!next) form.reset();
    onOpenChange(next);
  }

  const formErrors = form.errors;

  if (tickets.length === 0 || slots.length === 0) {
    const reason =
      tickets.length === 0
        ? "先にイベント編集画面でチケットを設定してください。"
        : "先にイベント編集画面でタイムスロットを設定してください。";
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>代行登録を受け付けられません</DialogTitle>
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
          <DialogTitle>事前代行登録</DialogTitle>
          <DialogDescription>
            電話・口頭で申込を受けた参加者を代理で登録します。確認メールを送信します。
          </DialogDescription>
        </DialogHeader>
        <form {...getFormProps(form)} action={formAction} className="space-y-4">
          <input type="hidden" name={fields.eventId.name} value={eventId} />
          {/* radio group は button 要素なので、値は hidden input で conform に渡す */}
          <HiddenControlInput field={fields.slotId} control={slotIdControl} />
          <HiddenControlInput
            field={fields.ticketId}
            control={ticketIdControl}
          />
          {/* スロット選択 */}
          {slots.length > 1 && (
            <div className="space-y-2">
              <Label>タイムスロット</Label>
              <div
                role="radiogroup"
                aria-label="タイムスロット"
                className="flex flex-wrap gap-2"
              >
                {slots.map((s, index) => {
                  const selected = slotId === s.id;
                  const itemProps = slotRadio.getItemProps(s, index);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      ref={itemProps.ref}
                      tabIndex={itemProps.tabIndex}
                      onKeyDown={itemProps.onKeyDown}
                      onClick={() => slotIdControl.change(s.id)}
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
                {tickets.map((t, index) => {
                  const selected = ticketId === t.id;
                  const itemProps = ticketRadio.getItemProps(t, index);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      ref={itemProps.ref}
                      tabIndex={itemProps.tabIndex}
                      onKeyDown={itemProps.onKeyDown}
                      onClick={() => ticketIdControl.change(t.id)}
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
            <Label htmlFor={fields.name.id}>
              氏名 <span className="text-destructive">*</span>
            </Label>
            <Input
              {...getInputProps(fields.name, { type: "text" })}
              autoFocus
              maxLength={100}
            />
            {fields.name.errors && (
              <p
                id={fields.name.errorId}
                role="alert"
                className="text-sm text-destructive"
              >
                {fields.name.errors.join(", ")}
              </p>
            )}
          </div>

          {/* メール (必須) — walk-in との最大の差分 */}
          <div className="space-y-2">
            <Label htmlFor={fields.email.id}>
              メール <span className="text-destructive">*</span>
            </Label>
            <Input
              {...getInputProps(fields.email, { type: "email" })}
              inputMode="email"
              autoComplete="email"
              maxLength={255}
              placeholder="participant@example.com"
            />
            {fields.email.errors && (
              <p
                id={fields.email.errorId}
                role="alert"
                className="text-sm text-destructive"
              >
                {fields.email.errors.join(", ")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              確認メールをこのアドレスに送信します。
            </p>
          </div>

          {/* 参加人数 */}
          <div className="space-y-2">
            <Label htmlFor={fields.quantity.id}>参加人数</Label>
            <Input
              {...getInputProps(fields.quantity, { type: "number" })}
              inputMode="numeric"
              min={1}
              max={100}
            />
            {fields.quantity.errors && (
              <p
                id={fields.quantity.errorId}
                role="alert"
                className="text-sm text-destructive"
              >
                {fields.quantity.errors.join(", ")}
              </p>
            )}
          </div>

          {/* 電話 (任意) */}
          <div className="space-y-2">
            <Label htmlFor={fields.phone.id}>電話 (任意)</Label>
            <Input
              {...getInputProps(fields.phone, { type: "tel" })}
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              placeholder="未入力可"
            />
            {fields.phone.errors && (
              <p
                id={fields.phone.errorId}
                role="alert"
                className="text-sm text-destructive"
              >
                {fields.phone.errors.join(", ")}
              </p>
            )}
          </div>

          {/* メモ */}
          <div className="space-y-2">
            <Label htmlFor={fields.note.id}>メモ (任意)</Label>
            <Input
              {...getInputProps(fields.note, { type: "text" })}
              maxLength={2000}
              placeholder="未入力可"
            />
            {fields.note.errors && (
              <p
                id={fields.note.errorId}
                role="alert"
                className="text-sm text-destructive"
              >
                {fields.note.errors.join(", ")}
              </p>
            )}
          </div>

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

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
              label="事前登録を確定"
              pendingLabel="登録中…"
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
