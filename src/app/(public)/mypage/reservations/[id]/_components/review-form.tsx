"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { spaceReviewSchema } from "@/shared/lib/validations/review";
import { submitReview } from "@/public/actions/review";
import { Heading } from "@/public/components/design-system/heading";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import { Button } from "@/public/components/design-system/button";
import { Badge } from "@/public/components/design-system/badge";
import { StarRating } from "@/public/components/ui/star-rating";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewFormProps {
  readonly reservationId: string;
  readonly spaceName: string;
  readonly reviewsEnabled: boolean;
  readonly reviewsFeatureEnabled: boolean;
  readonly turnstileSiteKey: string | null;
}

type ReviewFormInnerProps = Omit<
  ReviewFormProps,
  "reviewsEnabled" | "reviewsFeatureEnabled"
>;

// ---------------------------------------------------------------------------
// Outer gate (hooks なし — feature flag による render 分岐)
// ---------------------------------------------------------------------------

/**
 * Outer gate (hooks なし):
 * - Global OFF → "サイト全体で無効化" メッセージ
 * - Global ON + per-space OFF → "このスペースは受け付けていません" メッセージ
 * - 両方 ON → ReviewFormInner
 *
 * precedence: global が上位 (WordPress / Ghost pattern)
 */
export function ReviewForm({
  reservationId,
  spaceName,
  reviewsEnabled,
  reviewsFeatureEnabled,
  turnstileSiteKey,
}: ReviewFormProps): ReactElement {
  if (!reviewsFeatureEnabled) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted-foreground">
          レビュー機能は現在サイト全体で無効化されています。
        </p>
      </div>
    );
  }

  if (!reviewsEnabled) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted-foreground">
          このスペースはレビュー投稿を受け付けていません。
        </p>
      </div>
    );
  }

  return (
    <ReviewFormInner
      reservationId={reservationId}
      spaceName={spaceName}
      turnstileSiteKey={turnstileSiteKey}
    />
  );
}

// ---------------------------------------------------------------------------
// Inner (conform pattern)
// ---------------------------------------------------------------------------

function ReviewFormInner({
  reservationId,
  spaceName,
  turnstileSiteKey,
}: ReviewFormInnerProps): ReactElement {
  const [rating, setRating] = useState<number>(0);
  const [previousResult, setPreviousResult] = useState<unknown>(undefined);
  const [submitted, setSubmitted] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const [lastResult, formAction, isPending] = useActionState(
    submitReview,
    undefined,
  );

  const [form, fields] = useForm({
    id: "review-form",
    constraint: getZodConstraint(spaceReviewSchema),
    lastResult,
    defaultValue: {
      reservationId,
      title: "",
      comment: "",
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: spaceReviewSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const turnstileTokenControl = useInputControl(fields.turnstileToken);

  // Render 中 state sync: 成功検出 (executeConformMutation default
  // `resetForm: true` で `{ initialValue: null }` を返す)
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
      <div className="mt-4 md:mt-8 border border-border p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Badge variant="success">送信完了</Badge>
          <p className="text-sm text-muted-foreground">
            レビューを投稿しました。承認後に公開されます。
          </p>
        </div>
      </div>
    );
  }

  const ratingError = fields.rating.errors?.[0];
  const formErrorMessage =
    form.errors !== undefined && form.errors.length > 0 ? form.errors[0] : null;

  return (
    <section className="mt-4 md:mt-8 border border-border p-4 sm:p-6">
      <Heading level={2} className="mb-4 !text-lg">
        「{spaceName}」のレビューを投稿
      </Heading>

      <form {...getFormProps(form)} action={formAction} className="space-y-6">
        {/* Hidden inputs for transit (rating は useState 経由) */}
        <input
          type="hidden"
          name={fields.reservationId.name}
          value={reservationId}
        />
        <input type="hidden" name={fields.rating.name} value={String(rating)} />
        <input
          type="hidden"
          name={fields.turnstileToken.name}
          value={turnstileTokenControl.value ?? ""}
        />

        {formErrorMessage !== null && (
          <div
            className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            {formErrorMessage}
          </div>
        )}

        {/* Star Rating */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            評価
            <span aria-hidden="true" className="text-destructive">
              {" "}
              *
            </span>
          </label>
          <StarRating
            mode="interactive"
            rating={rating}
            size={28}
            onChange={(value) => {
              setRating(value);
            }}
          />
          {ratingError !== undefined ? (
            <p className="mt-1 text-sm text-destructive" role="alert">
              {ratingError}
            </p>
          ) : null}
        </div>

        {/* Title */}
        <Input
          label="タイトル（任意）"
          {...(fields.title.errors?.[0] !== undefined && {
            error: fields.title.errors[0],
          })}
          {...getInputProps(fields.title, { type: "text" })}
        />

        {/* Comment */}
        <Textarea
          label="コメント（任意）"
          rows={4}
          {...(fields.comment.errors?.[0] !== undefined && {
            error: fields.comment.errors[0],
          })}
          {...getInputProps(fields.comment, { type: "text" })}
        />

        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.review}
          onVerify={handleTurnstileVerify}
          onExpire={handleTurnstileExpire}
        />

        <Button type="submit" disabled={isPending}>
          {isPending ? "送信中..." : "レビューを投稿する"}
        </Button>
      </form>
    </section>
  );
}
