"use client";

import { useActionState } from "react";
import type { ReactElement } from "react";
import { getFormProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import type { z } from "zod";
import { Button } from "@/public/components/design-system/button";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";
import type { RequiredTerm } from "@/shared/domain/terms/queries";
import { reagreeAction } from "../_actions";
import { reagreeFormSchema } from "../_lib/reagree-schema";

interface ReagreeFormProps {
  readonly pending: readonly RequiredTerm[];
  readonly returnTo: string;
}

/**
 * LOGIN_SIGNUP scope の再同意フォーム。
 *
 * 各 pending term に対し `name="agreedTermsIds" value={termsId}` の checkbox を出す。
 * conform + Zod 4 の parseWithZod は同一 name の複数 value を配列に集約するため、
 * schema 側の `z.array(z.string().uuid())` と直接整合する。
 *
 * 提出成功時は Server Action 側の `redirect(sanitizeReturnTo(returnTo))` が throw する
 * ため、client 側では成功状態を扱わない (エラー系のみ表示)。
 */
export function ReagreeForm({
  pending,
  returnTo,
}: ReagreeFormProps): ReactElement {
  const [lastResult, formAction, isPending] = useActionState(
    reagreeAction,
    undefined,
  );

  const [form, fields] = useForm<z.input<typeof reagreeFormSchema>>({
    id: "reagree-form",
    lastResult,
    constraint: getZodConstraint(reagreeFormSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: reagreeFormSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(formAction),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const formErrorMessage =
    form.errors !== undefined && form.errors.length > 0 ? form.errors[0] : null;
  const agreedTermsErrorMessage =
    fields.agreedTermsIds.errors !== undefined &&
    fields.agreedTermsIds.errors.length > 0
      ? fields.agreedTermsIds.errors[0]
      : null;

  return (
    <form
      {...getFormProps(form)}
      action={formAction}
      aria-busy={isPending}
      className="space-y-6"
    >
      <input type="hidden" name={fields.returnTo.name} value={returnTo} />

      <div className="border border-accent/30 bg-accent/5 p-4 text-sm text-foreground">
        <p>
          ご利用規約が更新されました。引き続きサービスをご利用いただくため、以下の内容をご確認のうえ、改めてご同意ください。
        </p>
      </div>

      {formErrorMessage !== null && (
        <div
          id={form.errorId}
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {formErrorMessage}
        </div>
      )}

      {agreedTermsErrorMessage !== null && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {agreedTermsErrorMessage}
        </div>
      )}

      <div className="space-y-6">
        {pending.map((term) => (
          <section
            key={term.id}
            className="border border-border p-4 space-y-3"
            aria-labelledby={`reagree-title-${term.id}`}
          >
            <h2
              id={`reagree-title-${term.id}`}
              className="text-base font-medium"
            >
              {term.title}
            </h2>
            <div className="max-h-72 overflow-y-auto border border-border/60 bg-background p-3 text-sm">
              <SanitizedHtml
                sanitizedHtml={term.contentHtml}
                className="prose prose-sm max-w-none"
              />
            </div>

            {/* Phase 3.A (TERMS-REAGREE-P3A): 前回同意した版がある場合、
                <details> 折り畳みで併記する。native disclosure なので JS 不要、
                SSR-safe、a11y 標準 (改正民法 定型約款変更判例で求められる
                「変更内容の明示」への対応。差分ハイライトは Phase 3+ で検討)。 */}
            {term.previousSnapshot ? (
              <details className="border border-border/60 bg-muted/30 text-sm">
                <summary className="cursor-pointer px-3 py-2 font-medium">
                  以前同意した内容を表示
                </summary>
                <div className="max-h-72 overflow-y-auto border-t border-border/40 bg-background p-3">
                  <SanitizedHtml
                    sanitizedHtml={term.previousSnapshot}
                    className="prose prose-sm max-w-none"
                  />
                </div>
              </details>
            ) : null}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name={fields.agreedTermsIds.name}
                value={term.id}
                className="mt-1"
                required
              />
              <span>「{term.title}」に同意します</span>
            </label>
          </section>
        ))}
      </div>

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "送信中..." : "すべてに同意する"}
      </Button>
    </form>
  );
}
