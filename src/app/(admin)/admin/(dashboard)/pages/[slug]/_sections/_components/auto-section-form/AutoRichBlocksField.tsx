"use client";

import { useState } from "react";

import { Label } from "@/admin/components/ui";
import type { PortableTextBlock } from "@/shared/lib/portable-text";

import { PortableTextBlockEditor } from "./dynamic-imports";
import { parsePortableTextBlocks } from "./helpers";
import type { ControlledFieldProps } from "./types";

export function AutoRichBlocksField({
  field,
  fieldId,
  label,
  helpText,
  isPending,
  error,
}: ControlledFieldProps) {
  const fieldValue = field.value;
  const [blocks, setBlocks] = useState<PortableTextBlock[]>(() =>
    parsePortableTextBlocks(fieldValue),
  );
  const [previousFieldValue, setPreviousFieldValue] = useState(fieldValue);
  if (fieldValue !== previousFieldValue) {
    setPreviousFieldValue(fieldValue);
    setBlocks(parsePortableTextBlocks(fieldValue));
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={field.name} value={JSON.stringify(blocks)} />
      <Label htmlFor={fieldId}>{label}</Label>
      <PortableTextBlockEditor
        id={fieldId}
        value={blocks}
        onChange={setBlocks}
        disabled={isPending}
        aria-label={label}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && (
        <p id={field.errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
