"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import Link from "next/link";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { IconCircleCheck } from "@tabler/icons-react";
import { Button } from "@/public/components/design-system/button";
import { Heading } from "@/public/components/design-system/heading";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import {
  registerForEvent,
  registerForEventWaitlist,
} from "@/public/actions/event-registration";
import type { z } from "zod";
import { publicEventRegistrationSchema } from "@/shared/lib/validations/event-registration";
import {
  formatEventDateTimeRange,
  formatEventPrice,
} from "@/public/lib/format-event-date";
import type { EventTicketOption } from "@/shared/domain/events/ticket-types";
import {
  shouldExposePublicEventSlotSelector,
  type PublicEventScheduleMode,
  type PublicEventSlotOption,
} from "@/shared/domain/events/public-slot-options";
import { cn } from "@/shared/lib/cn";
import {
  TermsConsentChecklist,
  type ConsentTerm,
} from "@/app/(public)/_shared/components/forms/TermsConsentChecklist";

interface EventRegistrationFormProps {
  readonly eventId: string;
  readonly turnstileSiteKey: string | null;
  readonly scheduleMode: PublicEventScheduleMode;
  readonly slots: readonly PublicEventSlotOption[];
  readonly tickets: readonly EventTicketOption[];
  readonly requiredTerms?: readonly ConsentTerm[];
  readonly isLoggedIn: boolean;
  readonly slug: string;
  /**
   * "register" = 通常の空き枠への申込 (registerForEvent)。
   * "waitlist" = 満員時のキャンセル待ち登録 (registerForEventWaitlist)。
   * action / Turnstile action / 送信文言 / 完了メッセージがこれで分岐する。
   * 入力フィールド自体は publicEventRegistrationSchema /
   * publicEventWaitlistRegistrationSchema が同一形状のため共通。
   */
  readonly mode: "register" | "waitlist";
}

export function EventRegistrationForm({
  eventId,
  turnstileSiteKey,
  scheduleMode,
  slots,
  tickets,
  requiredTerms = [],
  isLoggedIn,
  slug,
  mode,
}: EventRegistrationFormProps): ReactElement {
  // waitlist モードでは定義上すべてのスロットが "available" ではない
  // (derivePublicEventRegistrationState が "waitlist-available" を返すのは
  // 登録期間内の全スロットが "sold-out" の場合のみ)。そのため選択可能な
  // status を mode で分岐する: register は "available"、waitlist は
  // "sold-out"（締切済みスロットへの登録待ちは受け付けない）。
  const joinableSlotStatus = mode === "waitlist" ? "sold-out" : "available";
  const firstAvailableSlot = slots.find(
    (slot) => slot.status === joinableSlotStatus,
  );
  const initialSlotId = firstAvailableSlot?.id ?? slots[0]?.id ?? "";
  const [selectedSlotId, setSelectedSlotId] = useState<string>(initialSlotId);
  const [selectedTicketId, setSelectedTicketId] = useState<string>(
    tickets[0]?.id ?? "",
  );
  const [submitted, setSubmitted] = useState(false);
  // bot対策の時間トラップ: フォーム初回マウント時刻を記録し、
  // Server Action側で送信までの経過時間が短すぎないか検証する。
  const [formRenderedAt] = useState(() => Date.now());
  const [previousResult, setPreviousResult] = useState<unknown>(undefined);
  const [agreedTermsIds, setAgreedTermsIds] = useState<readonly string[]>([]);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const allTermsAgreed =
    requiredTerms.length === 0 ||
    requiredTerms.every((term) => agreedTermsIds.includes(term.id));

  const toggleTermAgreement = (id: string) => {
    setAgreedTermsIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const [lastResult, formAction, isPending] = useActionState(
    mode === "waitlist" ? registerForEventWaitlist : registerForEvent,
    undefined,
  );

  // publicEventRegistrationSchema と publicEventWaitlistRegistrationSchema は
  // 同一 base + 同一 extend 形状 (validations/event-registration.ts 参照)。
  // client 側の conform constraint/validate は progressive enhancement 用の
  // UX ヒントに過ぎず、実際の enforcement は各 Server Action 内部で mode ごとに
  // 正しいスキーマを使う executeConformMutation が担う。そのため client 側は
  // 常に片方の schema で代表させ、mode 分岐による型の union 化を避ける。
  const [form, fields] = useForm<z.input<typeof publicEventRegistrationSchema>>(
    {
      id: "event-registration-form",
      lastResult,
      constraint: getZodConstraint(publicEventRegistrationSchema),
      defaultValue: {
        eventId,
        slotId: initialSlotId,
        ticketId: tickets[0]?.id ?? "",
        quantity: 1,
      },
      onValidate({ formData }) {
        return parseWithZod(formData, {
          schema: publicEventRegistrationSchema,
        });
      },
      shouldValidate: "onBlur",
      shouldRevalidate: "onInput",
    },
  );

  const turnstileTokenControl = useInputControl(fields.turnstileToken);

  // Render 中 state sync: 成功検出 (default `resetForm: true` → initialValue === null)
  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setSubmitted(true);
    }
  }

  // Turnstile DOM reset は副作用のため effect に残置
  useEffect(() => {
    if (lastResult?.status === "error") {
      turnstileRef.current?.reset();
      turnstileTokenControl.change("");
    }
  }, [lastResult, turnstileTokenControl]);

  function handleTurnstileVerify(token: string) {
    turnstileTokenControl.change(token);
  }

  function handleTurnstileExpire() {
    turnstileTokenControl.change("");
  }

  if (submitted) {
    return (
      <div className="border border-accent/30 bg-surface px-8 py-12 text-center">
        <IconCircleCheck
          className="mx-auto h-10 w-10 text-accent"
          aria-hidden
        />
        <Heading level={3} className="mt-4">
          {mode === "waitlist"
            ? "キャンセル待ちに登録しました"
            : "お申し込みを受け付けました"}
        </Heading>
        <p className="mt-3 text-muted-foreground">
          {mode === "waitlist"
            ? "順番が来ましたらメールでご連絡します。"
            : "確認メールをお送りしましたのでご確認ください。"}
        </p>
        {!isLoggedIn && (
          <p className="mt-2 text-sm text-muted-foreground">
            マイページに追加したい方は、確認メール内のリンクからどうぞ。
          </p>
        )}
      </div>
    );
  }

  const formErrorMessage =
    form.errors !== undefined && form.errors.length > 0 ? form.errors[0] : null;
  const selectedSlot =
    slots.find((slot) => slot.id === selectedSlotId) ?? firstAvailableSlot;
  const selectedRemainingCapacity = selectedSlot?.remaining ?? null;
  const showSlotSelector = shouldExposePublicEventSlotSelector({
    scheduleMode,
    slots,
  });
  // waitlist は定員という概念が無い (誰でも並べる) ため、"残り枠" (常に 0) では
  // なく固定上限のみで quantity をキャップする。register は従来通り残枠でキャップ。
  const quantityMax =
    mode === "register" && selectedRemainingCapacity !== null
      ? Math.max(1, Math.min(selectedRemainingCapacity, 10))
      : 10;
  const canSubmitSelectedSlot = selectedSlot?.status === joinableSlotStatus;

  return (
    <section aria-label="参加申込" className="space-y-4">
      {!isLoggedIn && (
        <p className="text-sm text-muted-foreground">
          ご登録済みの方は
          <Link
            href={`/login?redirect=/events/${slug}`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            ログイン
          </Link>
          すると入力が省略されます。
        </p>
      )}
      <div className="space-y-1">
        <Heading level={2}>
          {mode === "waitlist" ? "キャンセル待ち登録" : "参加申込"}
        </Heading>
        {mode === "register" && selectedRemainingCapacity !== null ? (
          <p className="text-sm text-muted-foreground">
            {showSlotSelector ? "選択中の残り枠" : "残り枠"}:{" "}
            <span className="font-medium text-foreground">
              {String(selectedRemainingCapacity)} 名
            </span>
          </p>
        ) : null}
      </div>

      <form
        {...getFormProps(form)}
        action={formAction}
        className="space-y-6 border border-border p-6 sm:p-8"
      >
        <input type="hidden" name={fields.eventId.name} value={eventId} />
        <input
          type="hidden"
          name={fields.slotId.name}
          value={selectedSlot?.id ?? ""}
        />
        <input
          type="hidden"
          name={fields.ticketId.name}
          value={selectedTicketId}
        />
        <input
          type="hidden"
          name={fields.turnstileToken.name}
          value={turnstileTokenControl.value ?? ""}
        />
        <input
          type="hidden"
          name={fields.formRenderedAt.name}
          value={formRenderedAt}
        />
        {/* bot対策のhoneypot: 実在しない項目("website")を装う。人には見えず、
            機械的にフォームを埋めるbotだけが入力してしまう。 */}
        <div
          aria-hidden="true"
          className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden"
        >
          <input
            type="text"
            name={fields.website.name}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
        {agreedTermsIds.map((id) => (
          <input
            key={id}
            type="hidden"
            name={fields.agreedTermsIds.name}
            value={id}
          />
        ))}

        {showSlotSelector && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-foreground">
              参加日時を選択
            </legend>
            <div className="space-y-2">
              {slots.map((slot) => {
                const id = `slot-option-${slot.id}`;
                const isSelected = selectedSlot?.id === slot.id;
                const isDisabled = slot.status !== joinableSlotStatus;
                return (
                  <label
                    key={slot.id}
                    htmlFor={id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-between gap-3 border p-4",
                      isSelected
                        ? "border-accent bg-accent/5"
                        : "border-border hover:border-foreground/30",
                      isDisabled && "cursor-not-allowed opacity-55",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        id={id}
                        type="radio"
                        name="slot-selector"
                        value={slot.id}
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={() => setSelectedSlotId(slot.id)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-medium text-foreground">
                        {formatEventDateTimeRange(slot.startTime, slot.endTime)}
                      </span>
                    </span>
                    <SlotAvailabilityText slot={slot} />
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {fields.slotId.errors !== undefined &&
          fields.slotId.errors.length > 0 && (
            <p
              className="text-sm text-destructive"
              role="alert"
              id={fields.slotId.errorId}
            >
              {fields.slotId.errors[0]}
            </p>
          )}

        {tickets.length > 1 && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-foreground">
              チケット種別を選択
            </legend>
            <div className="space-y-2">
              {tickets.map((ticket) => {
                const id = `ticket-option-${ticket.id}`;
                const isSelected = selectedTicketId === ticket.id;
                return (
                  <label
                    key={ticket.id}
                    htmlFor={id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-between gap-3 border p-4",
                      isSelected
                        ? "border-accent bg-accent/5"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        id={id}
                        type="radio"
                        name="ticket-selector"
                        value={ticket.id}
                        checked={isSelected}
                        onChange={() => setSelectedTicketId(ticket.id)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-medium text-foreground">
                        {ticket.name}
                      </span>
                    </span>
                    <span className="text-sm text-accent">
                      {formatEventPrice(ticket.price)}
                      {ticket.unitSize > 1 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          / {String(ticket.unitSize)}名
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {fields.ticketId.errors !== undefined &&
              fields.ticketId.errors.length > 0 && (
                <p
                  className="text-sm text-destructive"
                  role="alert"
                  id={fields.ticketId.errorId}
                >
                  {fields.ticketId.errors[0]}
                </p>
              )}
          </fieldset>
        )}

        <Input
          label="お名前"
          required
          placeholder="山田 太郎"
          autoComplete="name"
          {...(fields.name.errors?.[0] !== undefined && {
            error: fields.name.errors[0],
          })}
          {...getInputProps(fields.name, { type: "text" })}
        />

        <Input
          label="メールアドレス"
          required
          placeholder="mail@example.com"
          autoComplete="email"
          leadingIcon="IconMail"
          {...(fields.email.errors?.[0] !== undefined && {
            error: fields.email.errors[0],
          })}
          {...getInputProps(fields.email, { type: "email" })}
        />

        <Input
          label="電話番号（任意）"
          placeholder="090-1234-5678"
          autoComplete="tel"
          leadingIcon="IconPhone"
          {...(fields.phone.errors?.[0] !== undefined && {
            error: fields.phone.errors[0],
          })}
          {...getInputProps(fields.phone, { type: "tel" })}
        />

        <Input
          label="参加人数"
          required
          {...(fields.quantity.errors?.[0] !== undefined && {
            error: fields.quantity.errors[0],
          })}
          {...getInputProps(fields.quantity, { type: "number" })}
          min={1}
          max={quantityMax}
        />

        <Textarea
          label="備考（任意）"
          rows={3}
          placeholder="ご質問等あればご記入ください"
          {...(fields.note.errors?.[0] !== undefined && {
            error: fields.note.errors[0],
          })}
          {...getInputProps(fields.note, { type: "text" })}
        />

        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={
            mode === "waitlist"
              ? TURNSTILE_ACTIONS.event_waitlist_register
              : TURNSTILE_ACTIONS.event_registration
          }
          onVerify={handleTurnstileVerify}
          onExpire={handleTurnstileExpire}
        />

        {requiredTerms.length > 0 && (
          <div className="border-t border-border pt-6">
            <TermsConsentChecklist
              terms={requiredTerms}
              agreedIds={agreedTermsIds}
              onToggle={toggleTermAgreement}
              disabled={isPending}
              heading="ご利用規約への同意"
              variant="flat"
            />
          </div>
        )}

        {formErrorMessage !== null && (
          <div
            className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            {formErrorMessage}
          </div>
        )}

        <Button
          type="submit"
          disabled={isPending || !allTermsAgreed || !canSubmitSelectedSlot}
          className="w-full sm:w-auto"
        >
          {isPending
            ? "送信中..."
            : mode === "waitlist"
              ? "キャンセル待ちに登録する"
              : "申し込む"}
        </Button>
      </form>
    </section>
  );
}

function SlotAvailabilityText({
  slot,
}: {
  readonly slot: PublicEventSlotOption;
}): ReactElement {
  switch (slot.status) {
    case "available":
      return (
        <span className="shrink-0 text-sm text-accent">
          残り {String(slot.remaining)} 名
        </span>
      );
    case "sold-out":
      return (
        <span className="shrink-0 text-sm text-muted-foreground">満席</span>
      );
    case "deadline-passed":
      return (
        <span className="shrink-0 text-sm text-muted-foreground">締切</span>
      );
  }
}
