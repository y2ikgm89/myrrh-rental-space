"use client";

import { Tabs } from "radix-ui";
import { useQueryStates } from "nuqs";
import { cn } from "@/shared/lib/cn";
import {
  mypageEventsSearchParamsParsers,
  isMypageEventTab,
} from "@/public/lib/search-params";
import { EventRegistrationList } from "./event-registration-list";
import type { EventRegistrationListItem } from "./event-registration-list";

interface EventRegistrationTabsProps {
  readonly activeItems: readonly EventRegistrationListItem[];
  readonly pastItems: readonly EventRegistrationListItem[];
  readonly turnstileSiteKey: string | null;
  /** RSC render 時点の ISO 時刻。WAITLISTED_OFFERED カウントダウンの hydration-safe な初期値算出に使う。 */
  readonly nowIso: string;
  /** registrationId → Receipt.serialNo (発行済のみ)。DL リンク表示判定に使う。 */
  readonly receiptSerialNoMap: Readonly<Record<string, string>>;
  /** registrationId → FIFO waitlist 順位 (1-indexed)。WAITLIST_ACTIVE のみ。 */
  readonly waitlistPositionMap: Readonly<Record<string, number>>;
}

// 予約タブ (reservation-tabs.tsx) と完全対称な class。
// shrink-0 / tabular-nums の意図も同じ — 件数桁増による幅 jiggle と縮みを防止。
const TAB_TRIGGER_CLASS = cn(
  "min-h-11 shrink-0 whitespace-nowrap px-4 py-3 text-base tracking-[0.12em] transition-colors tabular-nums sm:px-5",
  "underline decoration-2 underline-offset-[6px]",
  "text-muted-foreground decoration-transparent hover:text-foreground",
  "data-[state=active]:text-accent data-[state=active]:decoration-accent",
);

export function EventRegistrationTabs({
  activeItems,
  pastItems,
  turnstileSiteKey,
  nowIso,
  receiptSerialNoMap,
  waitlistPositionMap,
}: EventRegistrationTabsProps) {
  // Pattern B: 親が 1 フェッチで全件取得し props で分割渡し → forceMount + shallow:true。
  // 履歴は #629 のタブ方針に合わせ replace。
  const [{ tab }, setParams] = useQueryStates(mypageEventsSearchParamsParsers, {
    history: "replace",
    shallow: true,
  });

  // URL 未指定時は申込状況で初期タブを決定（これからの申込が無ければ過去を表示）。
  const activeTab = tab ?? (activeItems.length > 0 ? "active" : "past");

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(v) => {
        if (isMypageEventTab(v)) void setParams({ tab: v });
      }}
    >
      <Tabs.List
        aria-label="イベント申込の表示切替"
        className="mb-4 flex shrink-0 justify-start overflow-x-auto border-b border-border [-webkit-overflow-scrolling:touch] [scrollbar-width:none] md:mb-6 md:justify-center"
      >
        <Tabs.Trigger value="active" className={TAB_TRIGGER_CLASS}>
          これから（{activeItems.length}）
        </Tabs.Trigger>
        <Tabs.Trigger value="past" className={TAB_TRIGGER_CLASS}>
          過去（{pastItems.length}）
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content
        value="active"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        <EventRegistrationList
          registrations={activeItems}
          emptyMessage="これからのイベント申込はありません"
          showBrowseCta
          turnstileSiteKey={turnstileSiteKey}
          nowIso={nowIso}
          receiptSerialNoMap={receiptSerialNoMap}
          waitlistPositionMap={waitlistPositionMap}
        />
      </Tabs.Content>
      <Tabs.Content
        value="past"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        <EventRegistrationList
          registrations={pastItems}
          emptyMessage="過去のイベント申込はありません"
          turnstileSiteKey={turnstileSiteKey}
          nowIso={nowIso}
          receiptSerialNoMap={receiptSerialNoMap}
          waitlistPositionMap={waitlistPositionMap}
        />
      </Tabs.Content>
    </Tabs.Root>
  );
}
