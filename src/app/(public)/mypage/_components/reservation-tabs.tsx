"use client";

import { Tabs } from "radix-ui";
import { useQueryStates } from "nuqs";
import { cn } from "@/shared/lib/cn";
import {
  mypageReservationsSearchParamsParsers,
  isMypageReservationTab,
} from "@/public/lib/search-params";
import { ReservationList } from "./reservation-list";
import type { ReservationListItem } from "./reservation-list";

interface ReservationTabsProps {
  readonly activeItems: readonly ReservationListItem[];
  readonly pastItems: readonly ReservationListItem[];
}

const TAB_TRIGGER_CLASS = cn(
  "min-h-11 whitespace-nowrap px-5 py-3 text-base tracking-[0.12em] transition-colors",
  "underline decoration-2 underline-offset-[6px]",
  "text-muted-foreground decoration-transparent hover:text-foreground",
  "data-[state=active]:text-accent data-[state=active]:decoration-accent",
);

export function ReservationTabs({
  activeItems,
  pastItems,
}: ReservationTabsProps) {
  // タブ選択を URL に反映（共有/リロード復元/戻る進む対応）。
  // 両 Content は forceMount でクライアント常駐＝サーバ再フェッチ不要のため shallow:true。
  // 履歴は #629 のタブ方針に合わせ replace（戻るボタンを壊さない）。
  const [{ tab }, setParams] = useQueryStates(
    mypageReservationsSearchParamsParsers,
    { history: "replace", shallow: true },
  );

  // URL 未指定時は予約状況で初期タブを決める（これからの予約が無ければ過去を表示）。
  const activeTab = tab ?? (activeItems.length > 0 ? "active" : "past");

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(v) => {
        if (isMypageReservationTab(v)) void setParams({ tab: v });
      }}
    >
      <Tabs.List
        aria-label="予約一覧の表示切替"
        className="mb-6 flex justify-center border-b border-border"
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
        <ReservationList items={activeItems} />
      </Tabs.Content>
      <Tabs.Content
        value="past"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        <ReservationList items={pastItems} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
