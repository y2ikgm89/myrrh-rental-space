"use client";

/**
 * ReviewReplyDialog
 *
 * `useForm` (RHF + `zodResolver`) → `useActionState` + `useForm`
 * (@conform-to/react) clean break 移行。parent component が `open` /
 * `onOpenChange` / `reviewId` / `initialReplyBody` を保持し、本 Dialog 内で
 * `useActionState` を回す controlled パターン (`dialogs.md` Variant B)。
 *
 * `replyToReviewCommand` は upsert なので create / edit は同 action で処理
 * (`hasExistingReply` で UI 文言のみ切替)。`deleteReviewReply` は form 経由
 * でない separate Server Action のため `useTransition` を維持。
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getFormProps, getTextareaProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import { replyToReview, deleteReviewReply } from "@/admin/actions/review";
import { isMutationError } from "@/shared/lib/mutation-result";
import { reviewReplySchema } from "@/shared/lib/validations/review";

type ReviewReplyDialogProps = {
  reviewId: string;
  initialReplyBody: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReviewReplyDialog({
  reviewId,
  initialReplyBody,
  open,
  onOpenChange,
}: ReviewReplyDialogProps) {
  const router = useRouter();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const hasExistingReply = initialReplyBody !== null;

  const [lastResult, formAction, isPending] = useActionState(
    replyToReview,
    undefined,
  );

  const [form, fields] = useForm({
    id: `review-reply-form-${reviewId}`,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: reviewReplySchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      reviewId,
      replyBody: initialReplyBody ?? "",
    },
  });

  const isSuccess = lastResult?.initialValue === null;

  // render 中 sync: success 検知 → Dialog close
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (isSuccess) {
      onOpenChange(false);
    }
  }

  useEffect(() => {
    if (isSuccess) {
      toast.success(
        hasExistingReply ? "返信を更新しました" : "返信を投稿しました",
      );
      router.refresh();
    }
  }, [isSuccess, hasExistingReply, router]);

  const handleDelete = () => {
    startDeleteTransition(async () => {
      const result = await deleteReviewReply(reviewId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("返信を削除しました");
      onOpenChange(false);
      router.refresh();
    });
  };

  const isBusy = isPending || isDeletePending;
  const formErrors = form.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {hasExistingReply ? "返信を編集" : "レビューに返信"}
          </DialogTitle>
          <DialogDescription>
            店舗からの返信として公開されます（1000文字以内）
          </DialogDescription>
        </DialogHeader>
        <form {...getFormProps(form)} action={formAction} className="space-y-4">
          {/* reviewId は親から固定、hidden input で送信 */}
          <input type="hidden" name={fields.reviewId.name} value={reviewId} />

          <div className="space-y-2">
            <Label htmlFor={fields.replyBody.id}>返信内容</Label>
            <Textarea
              {...getTextareaProps(fields.replyBody)}
              rows={6}
              maxLength={1000}
              disabled={isBusy}
              placeholder="ご来店いただきありがとうございました。..."
            />
            {fields.replyBody.errors && (
              <p
                id={fields.replyBody.errorId}
                className="text-sm text-destructive"
              >
                {fields.replyBody.errors.join(", ")}
              </p>
            )}
          </div>

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}
        </form>
        <DialogFooter className="sm:justify-between">
          <div>
            {hasExistingReply ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isBusy}
              >
                {isDeletePending ? "削除中..." : "返信を削除"}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isBusy}
            >
              キャンセル
            </Button>
            <SubmitButton
              form={form.id}
              isPending={isPending}
              disabled={isDeletePending}
              label={hasExistingReply ? "返信を更新" : "返信を投稿"}
              pendingLabel={hasExistingReply ? "更新中..." : "投稿中..."}
            />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
