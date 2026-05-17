"use client";

/**
 * AutoBooleanField — conform useInputControl ベースの Switch
 *
 * boolean 値は "on" / "" 文字列で FormData 送信、schema 層の preprocess で boolean 化する。
 */

import { useInputControl, type FieldMetadata } from "@conform-to/react";
import { Label, Switch } from "@/admin/components/ui";

interface AutoBooleanFieldProps {
  readonly field: FieldMetadata<unknown>;
  readonly fieldId: string;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly isPending: boolean;
  readonly error: string | undefined;
}

export function AutoBooleanField({
  field,
  fieldId,
  label,
  helpText,
  isPending,
  error,
}: AutoBooleanFieldProps) {
  // conform useInputControl は string ベースの FieldMetadata を要求するため境界変換
  // (型 ledger §5/§7 と同列の generic invariance 対応、動的 schema 用)
  const control = useInputControl(field as unknown as FieldMetadata<string>);
  const isOn = control.value === "on" || control.value === "true";

  return (
    <div className="space-y-1">
      <input type="hidden" name={field.name} value={isOn ? "on" : ""} />
      <div className="flex items-center gap-2">
        <Switch
          id={fieldId}
          checked={isOn}
          onCheckedChange={(checked) => control.change(checked ? "on" : "")}
          onBlur={control.blur}
          disabled={isPending}
        />
        <Label htmlFor={fieldId}>{label}</Label>
        {helpText && (
          <p className="text-xs text-muted-foreground ml-2">{helpText}</p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
