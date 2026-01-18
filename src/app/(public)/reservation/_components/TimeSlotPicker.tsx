'use client'

import { useState, useEffect, useTransition, useRef, type ReactElement } from 'react'
import { tv } from 'tailwind-variants'
import { getAvailableTimeSlots } from '@/public/actions/reservation'
import type { TimeSlot } from '@/public/lib/validations/reservation'
import { cn } from '@/shared/lib/utils'

const timeSlotStyles = tv({
  slots: {
    container: 'w-full',
    header: 'mb-4',
    title: 'text-lg font-semibold text-foreground',
    subtitle: 'text-sm text-muted-foreground mt-1',
    grid: 'grid grid-cols-3 sm:grid-cols-4 gap-2',
    slot: [
      'px-3 py-2 text-sm font-medium rounded-md border transition-all',
      'hover:border-primary hover:bg-primary/5',
      'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
    ],
    slotAvailable: 'border-border bg-background text-foreground cursor-pointer',
    slotUnavailable: 'border-muted bg-muted text-muted-foreground cursor-not-allowed opacity-50',
    slotSelected: 'border-primary bg-primary text-primary-foreground',
    loading: 'flex items-center justify-center py-8',
    spinner: 'animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full',
    rangeIndicator: 'mt-4 p-3 bg-muted rounded-md',
    rangeText: 'text-sm text-muted-foreground',
    rangeValue: 'font-medium text-foreground',
    emptyState: 'text-center py-8 text-muted-foreground',
  },
})

const styles = timeSlotStyles()

interface TimeSlotPickerProps {
  spaceId: string
  selectedDate: Date | null
  startTime: string | null
  endTime: string | null
  onSelectStartTime: (time: string) => void
  onSelectEndTime: (time: string) => void
}

export function TimeSlotPicker({
  spaceId,
  selectedDate,
  startTime,
  endTime,
  onSelectStartTime,
  onSelectEndTime,
}: TimeSlotPickerProps): ReactElement {
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [isPending, startTransition] = useTransition()
  const prevDateRef = useRef<Date | null>(null)

  // 日付が変更されたら時間枠を取得
  useEffect(() => {
    if (!selectedDate) {
      // 日付がクリアされた場合、次のレンダリングでslotsを空にするためrefを更新
      prevDateRef.current = null
      return
    }

    const dateStr = selectedDate.toISOString().split('T')[0]
    prevDateRef.current = selectedDate

    startTransition(async () => {
      const availableSlots = await getAvailableTimeSlots(spaceId, dateStr)
      setSlots(availableSlots)
    })
  }, [spaceId, selectedDate])

  // 選択状態を派生状態として計算（useEffect 内での setState を回避）
  const isSelecting: 'start' | 'end' = startTime && !endTime ? 'end' : 'start'

  // 日付がクリアされた場合、slots を空配列として扱う
  const displaySlots = selectedDate ? slots : []

  const handleSlotClick = (time: string, available: boolean): void => {
    if (!available) return

    if (isSelecting === 'start') {
      onSelectStartTime(time)
      onSelectEndTime('') // 終了時間をリセット
    } else {
      // 開始時間より後の時間のみ選択可能
      if (startTime && time > startTime) {
        // 終了時間は次の時間枠（例: 10:00 を選んだら 11:00 まで）
        const [hourStr] = time.split(':')
        const endHour = parseInt(hourStr, 10) + 1
        const endTimeStr = `${endHour.toString().padStart(2, '0')}:00`
        onSelectEndTime(endTimeStr)
      }
    }
  }

  const isSlotInRange = (time: string): boolean => {
    if (!startTime || !endTime) return false
    return time >= startTime && time < endTime
  }

  const calculateDuration = (): number | null => {
    if (!startTime || !endTime) return null
    const [startHour] = startTime.split(':').map(Number)
    const [endHour] = endTime.split(':').map(Number)
    return endHour - startHour
  }

  if (!selectedDate) {
    return (
      <div className={styles.container()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>時間を選択</h3>
          <p className={styles.subtitle()}>まず日付を選択してください</p>
        </div>
        <div className={styles.emptyState()}>
          <p>カレンダーから日付を選択すると、空き時間が表示されます</p>
        </div>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className={styles.container()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>時間を選択</h3>
        </div>
        <div className={styles.loading()}>
          <div className={styles.spinner()} />
        </div>
      </div>
    )
  }

  const duration = calculateDuration()

  return (
    <div className={styles.container()}>
      <div className={styles.header()}>
        <h3 className={styles.title()}>時間を選択</h3>
        <p className={styles.subtitle()}>
          {isSelecting === 'start'
            ? '開始時間を選択してください'
            : '終了時間を選択してください（利用したい最後の時間枠をタップ）'}
        </p>
      </div>

      <div className={styles.grid()}>
        {displaySlots.map((slot) => {
          const isSelected =
            slot.time === startTime || isSlotInRange(slot.time)
          const isStartSlot = slot.time === startTime
          const canSelectAsEnd =
            isSelecting === 'end' &&
            startTime &&
            slot.time > startTime &&
            slot.available

          return (
            <button
              key={slot.time}
              type="button"
              onClick={() => handleSlotClick(slot.time, slot.available)}
              disabled={!slot.available && !canSelectAsEnd}
              className={cn(
                styles.slot(),
                slot.available
                  ? styles.slotAvailable()
                  : styles.slotUnavailable(),
                isSelected && styles.slotSelected(),
                isStartSlot && 'ring-2 ring-primary ring-offset-1'
              )}
              aria-label={`${slot.time}${slot.available ? '' : '（予約済み）'}`}
              aria-pressed={isSelected}
            >
              {slot.time}
            </button>
          )
        })}
      </div>

      {startTime && endTime && duration && (
        <div className={styles.rangeIndicator()}>
          <p className={styles.rangeText()}>
            選択された時間帯:{' '}
            <span className={styles.rangeValue()}>
              {startTime} 〜 {endTime}（{duration}時間）
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
