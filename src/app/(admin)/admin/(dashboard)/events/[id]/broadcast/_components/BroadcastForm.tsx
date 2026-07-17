"use client";

import { useActionState, useEffect } from "react";
import type { ReactElement } from "react";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import type { z } from "zod";
import { Input, SubmitButton, Textarea } from "@/admin/components/ui";
import {
  broadcastEventAction,
  eventBroadcastSchema,
} from "@/admin/actions/event-broadcast";

type BroadcastFormProps = {
  eventId: string;
  eligibleCount: number;
};

/**
 * 管理者オーサリング型 event broadcast (T12) の compose フォーム。
 *
 * conform + Zod 4 の canonical shape (useForm<z.input<typeof schema>>、
 * getZodConstraint、shouldValidate: "onBlur"、shouldRevalidate: "onInput") を
 * 踏襲する。送信は `broadcastEventAction.bind(null, eventId)` で eventId を
 * 部分適用する。
 *
 * 成功検出は `resetForm: true` の action と組で `lastResult.initialValue === null`
 * を見る (`.claude/rules/forms-mutations.md` の client 側定型を SSoT 参照)。
 * 成功後は toast で通知しつつ form は自動 reset される (subject/body が空に戻る)。
 */
export function BroadcastForm({
  eventId,
  eligibleCount,
}: BroadcastFormProps): ReactElement {
  const boundAction = broadcastEventAction.bind(null, eventId);
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm<z.input<typeof eventBroadcastSchema>>({
    id: `event-broadcast-${eventId}`,
    lastResult,
    constraint: getZodConstraint(eventBroadcastSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: eventBroadcastSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      subject: "",
      body: "",
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("一斉配信メールを送信しました");
    }
  }, [lastResult]);

  const formErrorMessage =
    form.errors !== undefined && form.errors.length > 0 ? form.errors[0] : null;
  const disabled = eligibleCount === 0;

  return (
    <form
      {...getFormProps(form)}
      action={action}
      className="space-y-4"
      aria-busy={isPending}
    >
      {formErrorMessage && (
        <div
          className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {formErrorMessage}
        </div>
      )}

      <div className="space-y-1.5">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor={fields.subject.id}
        >
          件名
        </label>
        <Input
          {...getInputProps(fields.subject, { type: "text" })}
          maxLength={200}
          placeholder="例: 【重要】明日の集合場所についてのお知らせ"
          disabled={disabled}
        />
        {fields.subject.errors && fields.subject.errors.length > 0 && (
          <p className="text-sm text-destructive" id={fields.subject.errorId}>
            {fields.subject.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor={fields.body.id}
        >
          本文
        </label>
        <Textarea
          {...getInputProps(fields.body, { type: "text" })}
          rows={12}
          maxLength={5000}
          placeholder={
            "参加者の皆さまへ\n\n運営よりご連絡です。\n(ここに本文を入力)"
          }
          disabled={disabled}
        />
        {fields.body.errors && fields.body.errors.length > 0 && (
          <p className="text-sm text-destructive" id={fields.body.errorId}>
            {fields.body.errors.join(", ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          改行はそのまま保持されます。参加者共通の本文として送信されるため、宛先個別の氏名は含めないでください。
        </p>
      </div>

      <div className="flex items-center justify-end gap-3">
        <p className="text-sm text-muted-foreground">
          {eligibleCount} 名に配信します
        </p>
        <SubmitButton
          isPending={isPending}
          label="配信する"
          pendingLabel="配信中..."
          disabled={disabled}
        />
      </div>
    </form>
  );
}
