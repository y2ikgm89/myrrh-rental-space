"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import { replyToReview, deleteReviewReply } from "@/admin/actions/review";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  reviewReplySchema,
  type ReviewReplyInput,
} from "@/shared/lib/validations/review";

// =============================================================================
// Types
// =============================================================================

type ReviewReplyDialogProps = {
  reviewId: string;
  initialReplyBody: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// =============================================================================
// ReviewReplyDialog Component
// =============================================================================

export function ReviewReplyDialog({
  reviewId,
  initialReplyBody,
  open,
  onOpenChange,
}: ReviewReplyDialogProps) {
  const router = useRouter();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);

  const hasExistingReply = initialReplyBody !== null;

  const form = useForm<ReviewReplyInput>({
    resolver: zodResolver(reviewReplySchema),
    defaultValues: {
      reviewId,
      replyBody: initialReplyBody ?? "",
    },
  });

  const isPending = isSubmitting || isDeleting;

  const handleSubmit = (data: ReviewReplyInput) => {
    startSubmitTransition(async () => {
      const result = await replyToReview(data);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        hasExistingReply ? "返信を更新しました" : "返信を投稿しました",
      );
      onOpenChange(false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    setIsDeleting(true);
    void (async () => {
      try {
        const result = await deleteReviewReply(reviewId);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success("返信を削除しました");
        onOpenChange(false);
        router.refresh();
      } finally {
        setIsDeleting(false);
      }
    })();
  };

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
        <Form {...form}>
          <form
            id="review-reply-form"
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="replyBody"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>返信内容</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={6}
                      maxLength={1000}
                      disabled={isPending}
                      placeholder="ご来店いただきありがとうございました。..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter className="sm:justify-between">
          <div>
            {hasExistingReply ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isPending}
              >
                {isDeleting ? "削除中..." : "返信を削除"}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <SubmitButton
              form="review-reply-form"
              isPending={isSubmitting}
              disabled={isDeleting}
              label={hasExistingReply ? "返信を更新" : "返信を投稿"}
              pendingLabel={hasExistingReply ? "更新中..." : "投稿中..."}
            />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
