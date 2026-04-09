"use client";

/**
 * AutoBooleanField — useController ベースの制御された Switch
 *
 * RHF の useController で状態を同期し、Switch の checked prop がリアクティブに更新される。
 */

import { useController, type Control } from "react-hook-form";
import { Label, Switch } from "@/admin/components/ui";

interface AutoBooleanFieldProps {
  readonly fieldKey: string;
  readonly fieldId: string;
  readonly label: string;
  readonly helpText: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RHF generic compatibility
  readonly control: Control<any>;
  readonly isPending: boolean;
  readonly error: string | undefined;
}

export function AutoBooleanField({
  fieldKey,
  fieldId,
  label,
  helpText,
  control,
  isPending,
  error,
}: AutoBooleanFieldProps) {
  const { field } = useController({
    control,
    name: fieldKey,
  });

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Switch
          id={fieldId}
          checked={field.value === true}
          onCheckedChange={field.onChange}
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
