/**
 * 公開イベント一覧の開催状況タブ SSoT。
 *
 * 依存方向: `src/shared/*` からも `src/app/(public)/*` の nuqs parser からも
 * 参照するため shared 側に置く(app → shared の一方向依存を守る。
 * `src/shared/domain/spaces/space-sort.ts` と同型の配置理由)。
 */

export const EVENT_LIST_TABS = ["upcoming", "past"] as const;

export type EventListTab = (typeof EVENT_LIST_TABS)[number];

const eventListTabSet = new Set<string>(EVENT_LIST_TABS);

export function isEventListTab(value: string): value is EventListTab {
  return eventListTabSet.has(value);
}
