"use client";

import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { CALENDAR_LAYOUT } from "@/admin/lib/calendar";
import { TimeColumn } from "./TimeColumn";

/**
 * TimeGrid 1 列の入力。
 *
 * - `header` は sticky ヘッダーセル内に描画される (`bg-card` 不透明) — 内側 div として
 *   レンダリングされるため、子要素に alpha 背景を当ててもセルの bg-card は親元素として
 *   独立しており cn のクラスマージで透けることはない (PR #683 で sticky 透過根治済み)。
 * - `body` は時間スロット罫線の上に重ねるイベントレイヤー。
 *   `absolute inset-0` で位置決めしたものを渡す。
 */
export interface TimeGridColumn {
  key: string;
  header: ReactNode;
  body: ReactNode;
  minWidthPx: number;
  /** 列ヘッダー sticky セルに追加で適用する className */
  headerClassName?: string;
  /** 列ボディ relative セルに追加で適用する className (例: 今日列の `bg-primary/5`) */
  bodyClassName?: string;
}

interface TimeGridProps {
  timeSlots: string[];
  gridHeight: number;
  columns: TimeGridColumn[];
  /** スクリーンリーダー向けラベル (region として announce される) */
  ariaLabel: string;
}

/**
 * 2D スクロール対応の時間グリッド。
 *
 * Google Calendar / FullCalendar `timeGrid` / AG Grid pinned-rows/columns と同型の
 * 「凍結ペイン」パターンを単一スクロールコンテナ + `position: sticky` で実現する。
 *
 * z-index スタッキング:
 *   corner (sticky top+left) z-30 > header (sticky top) z-20 > time (sticky left) z-10 > body z-0
 *
 * sticky 要素は必ず**不透明背景** (`bg-card`) を持つ。半透明 (`bg-muted/40` 等) にすると
 * スクロールしてきた本体セルが透けて見える。
 *
 * **外側カード (rounded-lg border bg-card) は含まない** — 呼び出し側で wrap する。
 *
 * **a11y**: role=region + aria-label で SR に discoverable な領域として announce する。
 * EventCell/EventBadge 内部の button は個別に aria-label を持つので Tab ナビゲーションで
 * 個々の予約に到達できる。キーボード矢印移動は将来拡張。
 */
export function TimeGrid({
  timeSlots,
  gridHeight,
  columns,
  ariaLabel,
}: TimeGridProps) {
  const gridTemplate = [
    `${CALENDAR_LAYOUT.timeColumnWidthPx}px`,
    ...columns.map((c) => `minmax(${c.minWidthPx}px, 1fr)`),
  ].join(" ");

  return (
    <div role="region" aria-label={ariaLabel} className="flex-1 overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
        {/* Corner cell: 縦横スクロール時も常に左上に固定 (z-30) */}
        <div
          aria-hidden="true"
          className="sticky left-0 top-0 z-30 border-b border-r bg-card"
        />

        {/* 列ヘッダー: 縦スクロール時に上部固定 (z-20) */}
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn(
              "sticky top-0 z-20 border-b border-r bg-card last:border-r-0",
              col.headerClassName,
            )}
          >
            {col.header}
          </div>
        ))}

        {/* 時刻列: 横スクロール時に左固定 (z-10) */}
        <div
          className="sticky left-0 z-10 border-r bg-card"
          style={{ height: `${gridHeight}px` }}
        >
          <TimeColumn timeSlots={timeSlots} />
        </div>

        {/* 各列のボディ: 通常配置。イベントは absolute レイヤーで重ねる */}
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn(
              "relative border-r last:border-r-0",
              col.bodyClassName,
            )}
            style={{ height: `${gridHeight}px` }}
          >
            {timeSlots.map((time) => (
              <div
                key={time}
                style={{ height: `${CALENDAR_LAYOUT.pixelsPerHour}px` }}
                className="border-b last:border-b-0"
              />
            ))}
            {col.body}
          </div>
        ))}
      </div>
    </div>
  );
}
