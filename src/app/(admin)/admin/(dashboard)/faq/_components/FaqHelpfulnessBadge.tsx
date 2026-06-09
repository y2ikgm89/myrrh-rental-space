/**
 * FaqHelpfulnessBadge
 *
 * FAQ 項目の「役立ち度」を表示する読み取り専用バッジ。
 * 公開ページの「役に立ちましたか？」投票（helpfulCount / notHelpfulCount）を
 * 管理画面で可視化し、不評票が役立ち票以上の項目はセマンティックカラーで強調する
 * （Zendesk の votes / Intercom の reactions レポートと同思想）。
 */

import { IconThumbDown, IconThumbUp } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";

type FaqHelpfulnessBadgeProps = {
  readonly helpful: number;
  readonly notHelpful: number;
};

export function FaqHelpfulnessBadge({
  helpful,
  notHelpful,
}: FaqHelpfulnessBadgeProps) {
  const total = helpful + notHelpful;

  if (total === 0) {
    return (
      <span className="text-xs text-muted-foreground" aria-label="評価なし">
        —
      </span>
    );
  }

  const rate = Math.round((helpful / total) * 100);
  // 不評票が役立ち票以上＝要改善シグナル
  const isLowRated = notHelpful >= helpful;

  return (
    <span
      className="inline-flex items-center gap-2 text-xs tabular-nums"
      aria-label={`評価率 ${rate}%、役立った ${helpful} 件、役立たなかった ${notHelpful} 件`}
    >
      <span
        className={cn(
          "font-medium",
          isLowRated ? "text-destructive" : "text-foreground",
        )}
      >
        {rate}%
      </span>
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <IconThumbUp className="h-3 w-3" aria-hidden="true" />
        {helpful}
        <IconThumbDown className="ml-1 h-3 w-3" aria-hidden="true" />
        {notHelpful}
      </span>
    </span>
  );
}
