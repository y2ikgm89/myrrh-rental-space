/**
 * CommentPanel view-state 純関数
 *
 * @description
 * コメントパネルの展開状態（複数カード同時展開）を管理する純関数群。
 * React state（`Set<string>`）の非破壊更新ロジックを UI から分離してテスト可能にする。
 */

import type { ThreadListItem } from "@/admin/types/editor-comment";

/** 展開状態の Set をトグル（非破壊）。 */
export function toggleExpanded(
  expanded: ReadonlySet<string>,
  threadId: string,
): Set<string> {
  const next = new Set(expanded);
  if (next.has(threadId)) {
    next.delete(threadId);
  } else {
    next.add(threadId);
  }
  return next;
}

/** activeMarkId に一致する thread を展開集合へ追加（非破壊・冪等）。 */
export function withActiveExpanded(
  expanded: ReadonlySet<string>,
  activeMarkId: string | null | undefined,
  threads: readonly ThreadListItem[],
): Set<string> {
  if (!activeMarkId) return new Set(expanded);
  const match = threads.find((t) => t.markId === activeMarkId);
  if (!match) return new Set(expanded);
  const next = new Set(expanded);
  next.add(match.id);
  return next;
}
