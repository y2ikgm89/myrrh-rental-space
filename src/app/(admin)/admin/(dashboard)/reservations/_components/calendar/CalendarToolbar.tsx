"use client";

import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { formatDateLabel } from "@/admin/lib/calendar";
import { getReservationStatusFilterOrAll } from "@/shared/lib/validations/enums";
import type { CalendarState } from "./hooks";

interface CalendarToolbarProps {
  state: CalendarState;
}

export function CalendarToolbar({ state }: CalendarToolbarProps) {
  const {
    view,
    currentDate,
    spaces,
    spaceId,
    status,
    setView,
    goNext,
    goPrevious,
    goToday,
    setSpaceFilter,
    setStatusFilter,
  } = state;

  const dateLabel = formatDateLabel(currentDate, view);

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      {/* 左: ビュー切替 */}
      <div className="flex gap-1">
        <Button
          variant={view === "month" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("month")}
        >
          月
        </Button>
        <Button
          variant={view === "week" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("week")}
        >
          週
        </Button>
        <Button
          variant={view === "day" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("day")}
        >
          日
        </Button>
      </div>

      {/* 中央: 日付ナビゲーション */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={goPrevious}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={goToday}
          className="min-w-[80px]"
        >
          <Calendar className="mr-2 h-4 w-4" />
          今日
        </Button>
        <Button variant="outline" size="icon" onClick={goNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-2 min-w-[160px] text-center text-lg font-semibold">
          {dateLabel}
        </span>
      </div>

      {/* 右: フィルター */}
      <div className="flex gap-2">
        <Select
          value={spaceId ?? "all"}
          onValueChange={(v) => setSpaceFilter(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="スペース" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全スペース</SelectItem>
            {spaces.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) =>
            setStatusFilter(getReservationStatusFilterOrAll(v))
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべて</SelectItem>
            <SelectItem value="PENDING">保留中</SelectItem>
            <SelectItem value="CONFIRMED">確認済み</SelectItem>
            <SelectItem value="CANCELLED">キャンセル</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
