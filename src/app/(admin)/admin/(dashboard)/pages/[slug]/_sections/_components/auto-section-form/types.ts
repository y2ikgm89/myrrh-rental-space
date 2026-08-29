import type { FieldMetadata, FormMetadata } from "@conform-to/react";
import type { z } from "zod";

import type { DynamicSectionOptions } from "@/shared/domain/sections/dynamic-options";
import type { FieldType, MediaAcceptType } from "@/shared/lib/sections/types";

import type { ArrayItemFieldInfo, FieldInfo } from "../zod-introspection";

export type DynamicConfigValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | DynamicConfigValue[]
  | { readonly [key: string]: DynamicConfigValue };

export type DynamicConfigForm = Record<string, DynamicConfigValue>;

export interface AutoFieldProps<TForm extends Record<string, unknown>> {
  readonly fieldInfo: FieldInfo | ArrayItemFieldInfo;
  readonly field: FieldMetadata<unknown, TForm>;
  readonly form: FormMetadata<TForm>;
  readonly isPending: boolean;
  readonly defaultValue: unknown;
  readonly dynamicOptions: DynamicSectionOptions | undefined;
}

export interface AutoFieldByTypeProps<TForm extends Record<string, unknown>> {
  readonly fieldType: FieldType;
  readonly fieldKey: string;
  readonly fieldId: string;
  readonly label: string;
  readonly placeholder: string | undefined;
  readonly helpText: string | undefined;
  readonly suffix: string | undefined;
  readonly leadingIcon: string | undefined;
  readonly trailingIcon: string | undefined;
  readonly mediaAccept: MediaAcceptType | undefined;
  readonly schema: z.ZodType;
  readonly field: FieldMetadata<unknown, TForm>;
  readonly form: FormMetadata<TForm>;
  readonly isPending: boolean;
  readonly defaultValue: unknown;
  readonly error: string | undefined;
  readonly dynamicOptions: DynamicSectionOptions | undefined;
}

export interface ControlledFieldProps {
  readonly field: FieldMetadata;
  readonly fieldId: string;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly isPending: boolean;
  readonly error: string | undefined;
}
