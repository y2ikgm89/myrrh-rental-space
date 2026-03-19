"use client";

import type { ReactElement } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Input, Textarea } from "@/public/components/design-system";
import type { PublicReservationInput } from "@/shared/lib/validations/public-reservation";

export function CustomerStep({
  form,
  onNext,
  onBack,
}: {
  readonly form: UseFormReturn<PublicReservationInput>;
  readonly onNext: () => void;
  readonly onBack: () => void;
}): ReactElement {
  return (
    <div>
      <h2 className="mb-6 font-heading text-xl tracking-tight md:text-2xl">
        お客様情報
      </h2>

      <div className="grid gap-5 md:grid-cols-2">
        <Input
          id="reservation-lastname"
          label="姓"
          type="text"
          placeholder="山田"
          {...(form.formState.errors.lastName?.message && {
            error: form.formState.errors.lastName.message,
          })}
          {...form.register("lastName")}
        />
        <Input
          id="reservation-firstname"
          label="名"
          type="text"
          placeholder="太郎"
          {...(form.formState.errors.firstName?.message && {
            error: form.formState.errors.firstName.message,
          })}
          {...form.register("firstName")}
        />
      </div>

      <div className="mt-5">
        <Input
          id="reservation-email"
          label="メールアドレス"
          type="email"
          placeholder="mail@example.com"
          {...(form.formState.errors.email?.message && {
            error: form.formState.errors.email.message,
          })}
          {...form.register("email")}
        />
      </div>

      <div className="mt-5">
        <Input
          id="reservation-phone"
          label="電話番号（任意）"
          type="tel"
          placeholder="03-1234-5678"
          {...(form.formState.errors.phoneNumber?.message && {
            error: form.formState.errors.phoneNumber.message,
          })}
          {...form.register("phoneNumber")}
        />
      </div>

      <div className="mt-5">
        <Textarea
          id="reservation-notes"
          label="備考（任意）"
          rows={3}
          placeholder="ご要望などございましたらお書きください"
          {...(form.formState.errors.notes?.message && {
            error: form.formState.errors.notes.message,
          })}
          {...form.register("notes")}
        />
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-6 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-primary px-8 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          確認画面へ
        </button>
      </div>
    </div>
  );
}
