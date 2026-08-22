"use client";

/**
 * ページ操作メニュー
 *
 * 削除、公開/非公開切り替えなどの操作
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconEye,
  IconEyeOff,
  IconTrash,
  IconExternalLink,
  IconPencil,
} from "@tabler/icons-react";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { deletePage, updatePagePublished } from "@/admin/actions/pages";
import { openExternalTab } from "@/admin/lib/open-external-tab";
import { isMutationError } from "@/shared/lib/mutation-result";
import { getPagePreviewHref } from "@/shared/lib/preview-routes";

type PageActionsProps = {
  slug: string;
  title: string;
  isPublished: boolean;
  isSystemPage?: boolean | undefined;
  isHomepage?: boolean | undefined;
  editHref?: string | undefined;
};

export function PageActions({
  slug,
  title,
  isPublished,
  isSystemPage = false,
  isHomepage = false,
  editHref,
}: PageActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleTogglePublished = () => {
    startTransition(async () => {
      const result = await updatePagePublished(slug, !isPublished);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isPublished
          ? "ページを公開しました"
          : "ページを非公開にしました",
      );
      router.refresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deletePage(slug);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("ページを削除しました");
      setShowDeleteDialog(false);
      router.refresh();
    });
  };

  const handlePreview = () => {
    openExternalTab(getPagePreviewHref(slug));
  };

  return (
    <>
      <ActionDropdown disabled={isPending}>
        {editHref && (
          <>
            <ActionDropdownItem href={editHref}>
              <IconPencil className="h-4 w-4 mr-2" />
              編集
            </ActionDropdownItem>
            <ActionDropdownSeparator />
          </>
        )}

        <ActionDropdownItem onClick={handlePreview}>
          <IconExternalLink className="h-4 w-4 mr-2" />
          プレビュー
        </ActionDropdownItem>

        {!isSystemPage && (
          <>
            <ActionDropdownSeparator />
            <ActionDropdownItem
              onClick={handleTogglePublished}
              disabled={isPending}
            >
              {isPublished ? (
                <>
                  <IconEyeOff className="h-4 w-4 mr-2" />
                  非公開にする
                </>
              ) : (
                <>
                  <IconEye className="h-4 w-4 mr-2" />
                  公開する
                </>
              )}
            </ActionDropdownItem>
          </>
        )}

        {!isSystemPage && !isHomepage && (
          <>
            <ActionDropdownSeparator />
            <ActionDropdownItem
              destructive
              onClick={() => setShowDeleteDialog(true)}
              disabled={isPending}
            >
              <IconTrash className="h-4 w-4 mr-2" />
              削除
            </ActionDropdownItem>
          </>
        )}
      </ActionDropdown>

      {/*
        既定文に乗らない（監査 A-12）。既定は「この操作は取り消せません」だが、
        ページの削除は論理削除で、一覧ヘッダーのゴミ箱から 1 クリックで復元できる。
        投稿 / FAQ は復元できる旨を案内しており、ページだけが嘘をついていた。
        （投稿 / FAQ の「30 日間」は書かない — ページには trash-cleanup cron が無く、
        ゴミ箱の保持期間は無期限のため。）
      */}
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        description={`「${title}（/${slug}）」を削除します。公開ページからは消えますが、ゴミ箱から復元できます。`}
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  );
}
