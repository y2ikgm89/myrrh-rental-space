"use client";

import type { ReactElement } from "react";
import type {
  Control,
  FieldErrors,
  FieldValues,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import type { FieldDefinition } from "@/shared/lib/sections/schema-utils";
import { AutoTextField } from "./fields/AutoTextField";
import { AutoTextareaField } from "./fields/AutoTextareaField";
import { AutoNumberField } from "./fields/AutoNumberField";
import { AutoSelectField } from "./fields/AutoSelectField";
import { AutoSwitchField } from "./fields/AutoSwitchField";
import { AutoSliderField } from "./fields/AutoSliderField";
import { AutoColorField } from "./fields/AutoColorField";
import { IconSelectField } from "./fields/IconSelectField";
import { MediaPickerField } from "./fields/MediaPickerField";
import { MultiMediaPickerField } from "./fields/MultiMediaPickerField";
import { CTAButtonEditorField } from "./fields/CTAButtonEditorField";

export type FieldError = { readonly message?: string };

export interface FieldComponentProps {
  readonly field: FieldDefinition;
  readonly control: Control<FieldValues>;
  readonly register: UseFormRegister<FieldValues>;
  readonly error?: FieldError;
  readonly isPending: boolean;
  readonly setValue: UseFormSetValue<FieldValues>;
}

interface FieldRendererProps {
  readonly field: FieldDefinition;
  readonly control: Control<FieldValues>;
  readonly register: UseFormRegister<FieldValues>;
  readonly errors: FieldErrors<FieldValues>;
  readonly isPending: boolean;
  readonly setValue: UseFormSetValue<FieldValues>;
}

function extractError(errors: FieldErrors<FieldValues>, name: string): FieldError | undefined {
  const error = errors[name];
  if (error && typeof error === "object" && "message" in error) {
    const msg = error.message;
    if (typeof msg === "string") return { message: msg };
    return {};
  }
  return undefined;
}

export function FieldRenderer({
  field,
  control,
  register,
  errors,
  isPending,
  setValue,
}: FieldRendererProps): ReactElement {
  const error = extractError(errors, field.name);

  const baseProps = { field, control, register, isPending, setValue };
  const props: FieldComponentProps = error !== undefined
    ? { ...baseProps, error }
    : baseProps;

  switch (field.fieldType) {
    case "textarea":
      return <AutoTextareaField {...props} />;
    case "number":
      return <AutoNumberField {...props} />;
    case "select":
      return <AutoSelectField {...props} />;
    case "switch":
      return <AutoSwitchField {...props} />;
    case "slider":
      return <AutoSliderField {...props} />;
    case "color":
      return <AutoColorField {...props} />;
    case "icon-select":
      return <IconSelectField {...props} />;
    case "media":
      return <MediaPickerField {...props} />;
    case "media-multiple":
      return <MultiMediaPickerField {...props} />;
    case "cta-buttons":
      return <CTAButtonEditorField {...props} />;
    default:
      // text, url, and any unknown fieldType → text input
      return <AutoTextField {...props} />;
  }
}
