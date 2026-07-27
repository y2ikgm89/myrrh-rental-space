"use client";

import { getInputProps, getTextareaProps } from "@conform-to/react";

import { Input, Label, Textarea } from "@/admin/components/ui";

import type { ControlledFieldProps } from "./types";

interface AutoTextFieldProps extends ControlledFieldProps {
  readonly placeholder: string | undefined;
  readonly leadingIcon: string | undefined;
  readonly trailingIcon: string | undefined;
}

export function AutoTextField({
  field,
  fieldId,
  label,
  placeholder,
  helpText,
  leadingIcon,
  trailingIcon,
  isPending,
  error,
}: AutoTextFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        {...getInputProps(field, { type: "text" })}
        id={fieldId}
        placeholder={placeholder}
        disabled={isPending}
        {...(leadingIcon !== undefined && { leadingIcon })}
        {...(trailingIcon !== undefined && { trailingIcon })}
        // conform getInputProps が defaultValue / key を渡すため value 制御不要
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

export function AutoTextareaField({
  field,
  fieldId,
  label,
  placeholder,
  helpText,
  isPending,
  error,
}: ControlledFieldProps & { readonly placeholder: string | undefined }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Textarea
        {...getTextareaProps(field)}
        id={fieldId}
        placeholder={placeholder}
        rows={3}
        disabled={isPending}
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

interface AutoNumberFieldProps extends ControlledFieldProps {
  readonly suffix: string | undefined;
  readonly leadingIcon: string | undefined;
  readonly trailingIcon: string | undefined;
}

export function AutoNumberField({
  field,
  fieldId,
  label,
  suffix,
  helpText,
  leadingIcon,
  trailingIcon,
  isPending,
  error,
}: AutoNumberFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          {...getInputProps(field, { type: "number" })}
          id={fieldId}
          disabled={isPending}
          {...(leadingIcon !== undefined && { leadingIcon })}
          {...(trailingIcon !== undefined && { trailingIcon })}
        />
        {suffix && (
          <span className="text-sm text-muted-foreground shrink-0">
            {suffix}
          </span>
        )}
      </div>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && (
        <p id={field.errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

interface AutoUrlFieldProps extends ControlledFieldProps {
  readonly placeholder: string | undefined;
  readonly leadingIcon: string | undefined;
  readonly trailingIcon: string | undefined;
}

export function AutoUrlField({
  field,
  fieldId,
  label,
  placeholder,
  helpText,
  leadingIcon,
  trailingIcon,
  isPending,
  error,
}: AutoUrlFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        {...getInputProps(field, { type: "url" })}
        id={fieldId}
        placeholder={placeholder ?? "https://..."}
        disabled={isPending}
        {...(leadingIcon !== undefined && { leadingIcon })}
        {...(trailingIcon !== undefined && { trailingIcon })}
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
