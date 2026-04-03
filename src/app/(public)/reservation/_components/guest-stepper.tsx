"use client";

import { useState, type ReactElement } from "react";

interface GuestStepperProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max: number;
}

export function GuestStepper({
  value,
  onChange,
  min = 1,
  max,
}: GuestStepperProps): ReactElement {
  const [inputValue, setInputValue] = useState(String(value));

  // React 19 推奨: useEffect ではなくレンダー中の状態調整で props→state を同期
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setInputValue(String(value));
  }

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setInputValue(raw);
  };

  const commitInput = () => {
    const parsed = Number.parseInt(inputValue, 10);
    if (Number.isNaN(parsed)) {
      setInputValue(String(value));
      return;
    }
    const clamped = clamp(parsed);
    onChange(clamped);
    setInputValue(String(clamped));
  };

  const handleStep = (next: number) => {
    const clamped = clamp(next);
    onChange(clamped);
    setInputValue(String(clamped));
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="利用人数を減らす"
        disabled={value <= min}
        onClick={() => handleStep(value - 1)}
        className="flex h-10 w-10 items-center justify-center border border-border
          text-lg transition-colors duration-200 hover:border-foreground/30
          disabled:opacity-40 disabled:pointer-events-none"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-live="polite"
        aria-label="利用人数"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={commitInput}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitInput();
          }
        }}
        className="h-10 w-14 border border-border bg-transparent text-center text-sm
          focus-visible:border-accent focus-visible:outline-none"
      />
      <button
        type="button"
        aria-label="利用人数を増やす"
        disabled={value >= max}
        onClick={() => handleStep(value + 1)}
        className="flex h-10 w-10 items-center justify-center border border-border
          text-lg transition-colors duration-200 hover:border-foreground/30
          disabled:opacity-40 disabled:pointer-events-none"
      >
        +
      </button>
      <span className="ml-1 text-sm text-muted-foreground">名</span>
    </div>
  );
}
