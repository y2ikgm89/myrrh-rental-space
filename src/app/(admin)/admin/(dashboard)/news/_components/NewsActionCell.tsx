"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

type NewsActionCellProps = {
  newsId: string;
};

/**
 * お知らせ管理一覧の ActionDropdown。
 *
 * 公開 / 下書きの切替は同行の `PublishSwitch` で inline 変更するため、
 * 本 cell からは publish / unpublish menu を削除済み
 * （業界標準: WordPress / Notion / Linear ステータス inline 切替パターン。
 * PostActionCell.tsx 参照）。
 */
export function NewsActionCell({ newsId }: NewsActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/news/${newsId}`}>
        編集
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
