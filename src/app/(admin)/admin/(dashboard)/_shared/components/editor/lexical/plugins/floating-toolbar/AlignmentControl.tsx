"use client";

import type { ElementFormatType } from "lexical";
import { Button } from "@/admin/components/ui/button";
import { ALIGNMENT_OPTIONS, type AlignmentType } from "./types";

type Props = {
  elementFormat: AlignmentType;
  onChange: (format: ElementFormatType) => void;
};

export function AlignmentControl({ elementFormat, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {ALIGNMENT_OPTIONS.map(({ type, label, icon: Icon }) => (
        <Button
          key={type}
          type="button"
          variant={elementFormat === type ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => onChange(type)}
          aria-label={label}
          title={label}
        >
          <Icon className="h-3 w-3" />
        </Button>
      ))}
    </div>
  );
}
