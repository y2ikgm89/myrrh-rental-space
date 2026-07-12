"use client";

import { IconArrowBackUp, IconArrowForwardUp } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

export function HistorySection({ canUndo, canRedo, onUndo, onRedo }: Props) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={onUndo}
        disabled={!canUndo}
        title="元に戻す"
        aria-label="元に戻す"
      >
        <IconArrowBackUp className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={onRedo}
        disabled={!canRedo}
        title="やり直す"
        aria-label="やり直す"
      >
        <IconArrowForwardUp className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
    </>
  );
}
