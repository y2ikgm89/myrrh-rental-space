"use client";

interface TimeColumnProps {
  timeSlots: string[];
}

/**
 * カレンダーグリッド左端の時刻列。
 * 親側で `sticky left-0` を付けて横スクロール時に固定表示する。
 */
export function TimeColumn({ timeSlots }: TimeColumnProps) {
  return (
    <div className="h-full">
      {timeSlots.map((time) => (
        <div
          key={time}
          className="flex h-[60px] items-start justify-end border-b pr-2 pt-1 text-xs font-medium tabular-nums text-muted-foreground last:border-b-0"
        >
          {time}
        </div>
      ))}
    </div>
  );
}
