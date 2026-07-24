"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconEyeOff } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui/button";
import { anonymizeInquiry } from "@/admin/actions/inquiry";
import { AnonymizeInquiryConfirmDialog } from "@/admin/components/AnonymizeInquiryConfirmDialog";
import type { AnonymizeInquiryReason } from "@/shared/domain/inquiries/anonymize-commands";
import { isMutationError } from "@/shared/lib/mutation-result";

type Props = {
  inquiryId: string;
  subject: string;
  /** 非 null なら既に匿名化済み — ボタン自体を表示しない (冪等 CONFLICT を UI で先回り回避)。 */
  anonymizedAt: string | null;
};

/**
 * Inquiry Overhaul Phase 6: お問い合わせ詳細画面の匿名化ボタン。
 *
 * `AnonymizeCustomerButton` と同型。匿名化は物理削除ではなく PII の placeholder
 * 置換のため、実行後も詳細ページ自体は表示可能 — customer 版と異なり一覧への
 * リダイレクトはせず `router.refresh()` で最新状態を反映する。
 */
export function AnonymizeInquiryButton({
  inquiryId,
  subject,
  anonymizedAt,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (anonymizedAt !== null) {
    return null;
  }

  const handleConfirm = (reason: AnonymizeInquiryReason) => {
    startTransition(async () => {
      const result = await anonymizeInquiry(inquiryId, reason);
      if (isMutationError(result)) {
        setOpen(false);
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success("お問い合わせを匿名化しました");
      router.refresh();
    });
  };

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        <IconEyeOff className="mr-2 h-4 w-4" />
        匿名化
      </Button>
      <AnonymizeInquiryConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`「${subject}」を匿名化しますか？`}
        description="この操作は取り消せません。お問い合わせ本文・返信・添付ファイルの個人情報が削除されます。以降、このお問い合わせへの返信フォームは表示されなくなります。"
        onConfirm={handleConfirm}
        isPending={isPending}
      />
    </>
  );
}
