"use client";

import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { TimeColumn } from "./TimeColumn";

/**
 * TimeGrid 1 列の入力。
 *
 * - `header` は sticky ヘッダーセル内に描画される。背景は親 cell 側で `bg-card`
 *   不透明に固定されるため、`header` 自身に alpha 背景を当てる場合は内側 div の
 *   別レイヤーに置く（cn のクラスマージで bg-card が上書きされ透けるのを防ぐ）。
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
  /** 列ボディ relative セルに追加で適用する className（例: 今日列の `bg-primary/5`） */
  bodyClassName?: string;
}

interface TimeGridProps {
  timeSlots: string[];
  gridHeight: number;
  columns: TimeGridColumn[];
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
 * **外側カード（rounded-lg border bg-card）は含まない** — 呼び出し側で wrap する。
 * これにより ResourceView の orphan footer のような付帯要素を同じカード内に配置できる。
 */
export function TimeGrid({ timeSlots, gridHeight, columns }: TimeGridProps) {
  const gridTemplate = [
    "60px",
    ...columns.map((c) => `minmax(${c.minWidthPx}px, 1fr)`),
  ].join(" ");

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
        {/* Corner cell: 縦横スクロール時も常に左上に固定 (z-30) */}
        <div className="sticky left-0 top-0 z-30 border-b border-r bg-card" />

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
              <div key={time} className="h-[60px] border-b last:border-b-0" />
            ))}
            {col.body}
          </div>
        ))}
      </div>
    </div>
  );
}
