"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

type PostActionCellProps = {
  postId: string;
};

/**
 * 投稿管理一覧の ActionDropdown。
 *
 * ステータス変更（公開 / 下書き / アーカイブ）は同行の `PostStatusSelect`
 * で inline 変更するため、本 cell からは publish / unpublish menu を削除済み
 * （業界標準: WordPress / Notion / Linear ステータス inline 切替パターン）。
 */
export function PostActionCell({ postId }: PostActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/posts/${postId}`}>
        編集
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
