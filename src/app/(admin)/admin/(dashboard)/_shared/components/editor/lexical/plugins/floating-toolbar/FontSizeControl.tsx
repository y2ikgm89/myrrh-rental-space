"use client";

import { IconMinus, IconPlus } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "./font-size";

type Props = {
  fontSize: number;
  onIncrement: () => void;
  onDecrement: () => void;
};

export function FontSizeControl({ fontSize, onIncrement, onDecrement }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onDecrement}
        disabled={fontSize <= MIN_FONT_SIZE}
        aria-label="フォントサイズを小さく"
        title="フォントサイズを小さく"
      >
        <IconMinus className="h-3 w-3" />
      </Button>
      <span className="min-w-[2rem] text-center text-xs tabular-nums">
        {fontSize}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onIncrement}
        disabled={fontSize >= MAX_FONT_SIZE}
        aria-label="フォントサイズを大きく"
        title="フォントサイズを大きく"
      >
        <IconPlus className="h-3 w-3" />
      </Button>
    </div>
  );
}
