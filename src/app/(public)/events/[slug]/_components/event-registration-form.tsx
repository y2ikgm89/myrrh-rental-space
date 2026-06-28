"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
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
import { registerForEvent } from "@/public/actions/event-registration";
import type { z } from "zod";
import type { publicEventRegistrationSchema } from "@/shared/lib/validations/event-registration";
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
}

export function EventRegistrationForm({
  eventId,
  turnstileSiteKey,
  scheduleMode,
  slots,
  tickets,
  requiredTerms = [],
}: EventRegistrationFormProps): ReactElement {
  const firstAvailableSlot = slots.find((slot) => slot.status === "available");
  const initialSlotId = firstAvailableSlot?.id ?? slots[0]?.id ?? "";
  const [selectedSlotId, setSelectedSlotId] = useState<string>(initialSlotId);
  const [selectedTicketId, setSelectedTicketId] = useState<string>(
    tickets[0]?.id ?? "",
  );
  const [submitted, setSubmitted] = useState(false);
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
    registerForEvent,
    undefined,
  );

  // Server-only validation (bundle 削減): `onValidate` / `constraint` を渡さない
  // と Conform は提交時にサーバへ送信し、`lastResult` 経由でフィールドエラーを反映する
  // (公式: validation.md 「Optional: Client validation. Fallback to server validation if not provided」)。
  // これにより client bundle から zod / @conform-to/zod (約 302KB) が DCE される。
  // HTML5 の required / min / max は JSX 上のリテラル attribute で担保。
  const [form, fields] = useForm<z.input<typeof publicEventRegistrationSchema>>(
    {
      id: "event-registration-form",
      lastResult,
      defaultValue: {
        eventId,
        slotId: initialSlotId,
        ticketId: tickets[0]?.id ?? "",
        quantity: 1,
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
          お申し込みを受け付けました
        </Heading>
        <p className="mt-3 text-muted-foreground">
          確認メールをお送りしましたのでご確認ください。
        </p>
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
  const quantityMax =
    selectedRemainingCapacity !== null
      ? Math.max(1, Math.min(selectedRemainingCapacity, 10))
      : 10;
  const canSubmitSelectedSlot = selectedSlot?.status === "available";

  return (
    <section aria-label="参加申込" className="space-y-4">
      <div className="space-y-1">
        <Heading level={2}>参加申込</Heading>
        {selectedRemainingCapacity !== null ? (
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
                const isDisabled = slot.status !== "available";
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
          min={1}
          max={quantityMax}
          {...(fields.quantity.errors?.[0] !== undefined && {
            error: fields.quantity.errors[0],
          })}
          {...getInputProps(fields.quantity, { type: "number" })}
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
          action={TURNSTILE_ACTIONS.event_registration}
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
          {isPending ? "送信中..." : "申し込む"}
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
