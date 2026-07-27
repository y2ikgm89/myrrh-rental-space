"use client";

import { useState } from "react";

import { Label } from "@/admin/components/ui";
import type { PortableTextSpan } from "@/shared/lib/portable-text";

import { PortableTextInlineEditor } from "./dynamic-imports";
import { parsePortableTextSpans } from "./helpers";
import type { ControlledFieldProps } from "./types";

// PortableText fields は `useInputControl` を使わず local state + hidden input transit
// (BarDialog / NavigationDialog canonical pattern と同型)。
//
// `useInputControl<string>` は内部 sync useEffect で `change(field.value)` を呼ぶが、
// conform `defaultValue` に `PortableTextSpan[]` / `PortableTextBlock[]` (array of objects)
// を渡すと `normalizeStringValues` が "Expected string or string[]" を throw する。
// hidden input 経由で JSON 文字列を FormData に乗せ、schema 側 preprocess で復号する
// (`createSpanArraySchema` / `createBlockArraySchema` の `decodePortableTextInput`)。
//
// variant 切替時の `form.update` 等で field.value が外部要因により変化した場合に同期できる
// よう、React 公式「Adjusting State Directly During Render」パターンを採用。
export function AutoRichLabelField({
  field,
  fieldId,
  label,
  helpText,
  isPending,
  error,
}: ControlledFieldProps) {
  const fieldValue = field.value;
  const [spans, setSpans] = useState<PortableTextSpan[]>(() =>
    parsePortableTextSpans(fieldValue),
  );
  const [previousFieldValue, setPreviousFieldValue] = useState(fieldValue);
  if (fieldValue !== previousFieldValue) {
    setPreviousFieldValue(fieldValue);
    setSpans(parsePortableTextSpans(fieldValue));
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={field.name} value={JSON.stringify(spans)} />
      <Label htmlFor={fieldId}>{label}</Label>
      <PortableTextInlineEditor
        id={fieldId}
        value={spans}
        onChange={setSpans}
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
