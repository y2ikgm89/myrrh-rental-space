"use client";

import { useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { spaceReviewSchema } from "@/shared/lib/validations/review";
import { submitReview } from "@/public/actions/review";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { isMutationError } from "@/shared/lib/mutation-result";
import { Heading } from "@/public/components/design-system/heading";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import { Button } from "@/public/components/design-system/button";
import { Badge } from "@/public/components/design-system/badge";
import { StarRating } from "@/public/components/ui/star-rating";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import type { SpaceReviewInput } from "@/shared/lib/validations/review";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewFormProps {
  readonly reservationId: string;
  readonly spaceName: string;
  readonly turnstileSiteKey: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewForm({
  reservationId,
  spaceName,
  turnstileSiteKey,
}: ReviewFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const { form, isPending, onSubmit } = usePublicForm<
    SpaceReviewInput,
    { id: string }
  >(
    spaceReviewSchema,
    async (data) => {
      const result = await submitReview(data);
      if (isMutationError(result)) {
        turnstileRef.current?.reset();
      } else {
        setSubmitted(true);
      }
      return result;
    },
    {
      defaultValues: {
        reservationId,
        rating: 0,
        title: "",
        comment: "",
      },
    },
  );

  function handleTurnstileVerify(token: string) {
    form.setValue("turnstileToken", token);
  }

  function handleTurnstileExpire() {
    form.setValue("turnstileToken", "");
  }

  const rating = useWatch({ control: form.control, name: "rating" });

  if (submitted) {
    return (
      <div className="mt-4 md:mt-8 border border-border bg-surface p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Badge variant="success">送信完了</Badge>
          <p className="text-sm text-muted-foreground">
            レビューを投稿しました。承認後に公開されます。
          </p>
        </div>
      </div>
    );
  }

  const ratingError = form.formState.errors.rating?.message;

  return (
    <section className="mt-4 md:mt-8 border border-border bg-surface p-4 sm:p-6">
      <Heading level={2} className="mb-4 !text-lg">
        「{spaceName}」のレビューを投稿
      </Heading>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Hidden reservation ID */}
        <input type="hidden" {...form.register("reservationId")} />

        {/* IconStar Rating */}
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
            rating={rating ?? 0}
            size={28}
            onChange={(value) => {
              form.setValue("rating", value, { shouldValidate: true });
            }}
          />
          {ratingError ? (
            <p className="mt-1 text-sm text-destructive" role="alert">
              {ratingError}
            </p>
          ) : null}
        </div>

        {/* Title */}
        <Input
          label="タイトル（任意）"
          id="review-title"
          {...form.register("title")}
          {...(form.formState.errors.title?.message
            ? { error: form.formState.errors.title.message }
            : {})}
        />

        {/* Comment */}
        <Textarea
          label="コメント（任意）"
          id="review-comment"
          rows={4}
          {...form.register("comment")}
          {...(form.formState.errors.comment?.message
            ? { error: form.formState.errors.comment.message }
            : {})}
        />

        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
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
