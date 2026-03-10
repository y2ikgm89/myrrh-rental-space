/**
 * 文字数カウンター
 *
 * フォームフィールドの文字数制限状態を視覚的に表示。
 * ratio に応じて色を変更: 超過=destructive、80%以上=warning、それ以下=muted。
 */

interface CharCountProps {
  /** 現在の文字数 */
  current: number;
  /** 最大文字数（推奨値） */
  max: number;
}

export function CharCount({ current, max }: CharCountProps) {
  const ratio = current / max;

  let colorClass = "text-muted-foreground";
  if (ratio > 1) {
    colorClass = "text-destructive";
  } else if (ratio >= 0.8) {
    colorClass = "text-warning";
  }

  return (
    <span className={`text-xs tabular-nums ${colorClass}`}>
      {current}/{max}
    </span>
  );
}
