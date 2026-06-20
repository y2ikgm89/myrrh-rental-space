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
 * - `isTodayColumn`: この列が「今日」を表す場合 true。`TimeGridProps.nowOffsetPx` と
 *   合わせて過去 (bg-muted/30) / 未来 (bg-primary/5) / Now ライン (赤) を自動描画する
 *   (Google Calendar / FullCalendar / Outlook 公式パターン)。
 */
export interface TimeGridColumn {
  key: string;
  header: ReactNode;
  body: ReactNode;
  minWidthPx: number;
  /** 列ヘッダー sticky セルに追加で適用する className */
  headerClassName?: string;
  /** 列ボディ relative セルに追加で適用する className (例: 過去日列の `bg-muted/30`) */
  bodyClassName?: string;
  /** この列が「今日」を表す場合 true (Week=今日の曜日 / Day=date が今日 / Resource=date が今日の全列) */
  isTodayColumn?: boolean;
}

interface TimeGridProps {
  timeSlots: string[];
  gridHeight: number;
  columns: TimeGridColumn[];
  /** スクリーンリーダー向けラベル (region として announce される) */
  ariaLabel: string;
  /**
   * 今日列に重ねる「現在時刻 (JST)」の y 座標 px。営業開始からの経過分 × pixelsPerHour / 60。
   * - null: 今日が含まれない / 営業時間外 → past/future overlay も Now ラインも描画しない
   * - 0 以上 gridHeight 以下: 過去帯 (0〜value) + 未来帯 (value〜gridHeight) + Now ライン
   */
  nowOffsetPx?: number | null;
}

/**
 * 2D スクロール対応の時間グリッド。
 *
 * Google Calendar / FullCalendar `timeGrid` / AG Grid pinned-rows/columns と同型の
 * 「凍結ペイン」パターンを単一スクロールコンテナ + `position: sticky` で実現する。
 *
 * z-index スタッキング:
 *   corner (sticky top+left) z-30 > header (sticky top) z-20 > time (sticky left) z-10 >
 *   now line z-[15] > events (1〜N, focus-visible:30) > overlays (z-0) > body z-0
 *
 * 「今日」列には `isTodayColumn` + `nowOffsetPx` で:
 * - 過去帯: `bg-muted/30` (Outlook/Google Calendar 同等)
 * - 未来帯: `bg-primary/5` (今日強調の継続)
 * - Now ライン: `bg-destructive` 細線 (red — 業界標準)
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
  nowOffsetPx,
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
        {columns.map((col) => {
          const renderTodayOverlay =
            col.isTodayColumn &&
            nowOffsetPx !== null &&
            nowOffsetPx !== undefined;
          const clampedNow = renderTodayOverlay
            ? Math.max(0, Math.min(nowOffsetPx, gridHeight))
            : 0;

          return (
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

              {renderTodayOverlay && (
                <>
                  {/* 過去帯 (営業開始〜現在) — events より下 (z-0) */}
                  {clampedNow > 0 && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute left-0 right-0 top-0 bg-muted/30"
                      style={{ height: `${clampedNow}px` }}
                    />
                  )}
                  {/* 未来帯 (現在〜営業終了) — events より下 (z-0) */}
                  {clampedNow < gridHeight && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-0 left-0 right-0 bg-primary/5"
                      style={{ top: `${clampedNow}px` }}
                    />
                  )}
                  {/* Now ライン — events より上 (z-[15]) で identification 確保 */}
                  {clampedNow > 0 && clampedNow < gridHeight && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute left-0 right-0 z-[15] h-0.5 bg-destructive"
                      style={{ top: `${clampedNow}px` }}
                    />
                  )}
                </>
              )}

              {col.body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
