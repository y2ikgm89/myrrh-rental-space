"use client";

import { IconMessagePlus } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";

type Props = {
  onAddComment?: (() => void) | undefined;
  onOpenRuby?: (() => void) | undefined;
  onOpenTooltip?: (() => void) | undefined;
};

export function ExtraActions({
  onAddComment,
  onOpenRuby,
  onOpenTooltip,
}: Props) {
  return (
    <>
      {onAddComment && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onAddComment}
          aria-label="コメントを追加"
          title="コメントを追加"
        >
          <IconMessagePlus className="h-4 w-4" />
        </Button>
      )}
      {onOpenRuby && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-xs font-bold"
          onClick={onOpenRuby}
          aria-label="ルビを挿入"
          title="ルビを挿入"
        >
          ルビ
        </Button>
      )}
      {onOpenTooltip && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-xs font-bold"
          onClick={onOpenTooltip}
          aria-label="ツールチップを挿入"
          title="ツールチップを挿入"
        >
          TIP
        </Button>
      )}
    </>
  );
}
