"use client";

/**
 * config-forms 共通型 + FormActions
 */

import { useEffect } from "react";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { SubmitButton } from "@/admin/components/ui";
import type { PageSectionData } from "@/admin/actions/page-section-types";
import type { DynamicSectionOptions } from "@/shared/domain/sections/dynamic-options";

export interface ConfigFormSavePayload {
  config: Record<string, unknown>;
}

export interface ConfigFormProps {
  section: PageSectionData;
  onSave: (payload: ConfigFormSavePayload) => void;
  isPending: boolean;
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
  dynamicOptions?: DynamicSectionOptions;
}

export function FormActions({
  isDirty,
  isPending,
  onDirtyChange,
}: {
  isDirty: boolean;
  isPending: boolean;
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
}) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  return (
    <div className="flex items-center justify-end gap-3">
      {isDirty && (
        <span className="text-sm text-warning font-medium">
          未保存の変更があります
        </span>
      )}
      <SubmitButton
        isPending={isPending}
        disabled={!isDirty}
        label="保存"
        pendingLabel="保存中..."
      >
        <>
          <IconDeviceFloppy className="h-4 w-4 mr-2" />
          保存
        </>
      </SubmitButton>
    </div>
  );
}
