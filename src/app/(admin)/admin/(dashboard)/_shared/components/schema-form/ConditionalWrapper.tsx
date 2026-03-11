"use client";

import type { ReactElement, ReactNode } from "react";
import { useWatch } from "react-hook-form";
import type { Control, FieldValues } from "react-hook-form";
import type { FieldDefinition } from "@/shared/lib/sections/schema-utils";

interface ConditionalWrapperProps {
  readonly field: FieldDefinition;
  readonly control: Control<FieldValues>;
  readonly children: ReactNode;
}

export function ConditionalWrapper({
  field,
  control,
  children,
}: ConditionalWrapperProps): ReactElement | null {
  // useWatch must be called unconditionally (Rules of Hooks).
  // When visibleWhen is absent the watched field name is empty string — harmless.
  const watchedValue = useWatch({
    control,
    name: field.visibleWhen?.field ?? "",
  });

  if (!field.visibleWhen) return <>{children}</>;

  const isVisible = watchedValue === field.visibleWhen.value;
  if (!isVisible) return null;
  return <>{children}</>;
}
