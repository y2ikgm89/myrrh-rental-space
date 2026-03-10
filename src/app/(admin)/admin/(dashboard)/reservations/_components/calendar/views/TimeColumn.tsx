"use client";

interface TimeColumnProps {
  timeSlots: string[];
}

export function TimeColumn({ timeSlots }: TimeColumnProps) {
  return (
    <div className="sticky left-0 z-10 border-r bg-card">
      {timeSlots.map((time) => (
        <div
          key={time}
          className="flex h-[60px] items-start justify-end border-b pr-2 pt-1 text-xs text-muted-foreground"
        >
          {time}
        </div>
      ))}
    </div>
  );
}
