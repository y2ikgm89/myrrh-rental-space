"use client";

import { useRef, useState, useEffect } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";

const MONTH_LABELS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
] as const;

interface MonthPickerProps {
  readonly year: number;
  readonly month: number;
  readonly onSelect: (year: number, month: number) => void;
}

export function MonthPicker({ year, month, onSelect }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const [yearInput, setYearInput] = useState("");
  const [isEditingYear, setIsEditingYear] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingYear) {
      inputRef.current?.select();
    }
  }, [isEditingYear]);

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setIsEditingYear(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setIsEditingYear(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleMonthSelect(m: number) {
    onSelect(pickerYear, m);
    setOpen(false);
    setIsEditingYear(false);
  }

  function startYearEdit() {
    setYearInput(String(pickerYear));
    setIsEditingYear(true);
  }

  function commitYearInput() {
    const parsed = Number.parseInt(yearInput, 10);
    if (!Number.isNaN(parsed) && parsed >= 1900 && parsed <= 2100) {
      setPickerYear(parsed);
    }
    setIsEditingYear(false);
  }

  const monthYearLabel = `${String(year)}年${String(month + 1)}月`;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setPickerYear(year);
          setIsEditingYear(false);
        }}
        className="group relative text-xl font-light tracking-wide text-foreground transition-colors hover:text-foreground md:text-2xl"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {monthYearLabel}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-full top-1/2 ml-1.5 -translate-y-1/2 text-muted-foreground transition-transform duration-200 group-aria-expanded:rotate-180"
        >
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="年月選択"
          className="absolute left-1/2 top-full z-20 mt-2 w-72 -translate-x-1/2 border border-border bg-background p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPickerYear((y) => y - 1)}
              className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label="前の年"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>

            {isEditingYear ? (
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={yearInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  if (v.length <= 4) setYearInput(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitYearInput();
                  if (e.key === "Escape") setIsEditingYear(false);
                }}
                onBlur={commitYearInput}
                className="w-20 border-b border-accent bg-transparent text-center text-lg font-light text-foreground outline-none"
                aria-label="年を入力"
              />
            ) : (
              <button
                type="button"
                onClick={startYearEdit}
                className="text-lg font-light text-foreground transition-colors hover:text-foreground"
                aria-label="年を直接入力"
                title="クリックで年を入力"
              >
                {pickerYear}年
              </button>
            )}

            <button
              type="button"
              onClick={() => setPickerYear((y) => y + 1)}
              className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label="次の年"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {MONTH_LABELS.map((label, i) => {
              const isCurrent = pickerYear === year && i === month;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleMonthSelect(i)}
                  className={cn(
                    "py-2 text-sm transition-colors",
                    isCurrent
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-foreground hover:bg-surface",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
