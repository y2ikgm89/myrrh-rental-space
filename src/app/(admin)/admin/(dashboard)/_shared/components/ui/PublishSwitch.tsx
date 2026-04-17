"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "./switch";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";

// =============================================================================
// Types
// =============================================================================

type PublishSwitchProps<TData = unknown> = {
  id: string;
  isPublished: boolean;
  onToggle: (id: string, checked: boolean) => Promise<MutationResult<TData>>;
  label?: { published: string; unpublished: string };
};

// =============================================================================
// PublishSwitch Component
// =============================================================================

export function PublishSwitch<TData = unknown>({
  id,
  isPublished,
  onToggle,
  label = {
    published: PUBLISH_LABELS.published,
    unpublished: PUBLISH_LABELS.unpublished,
  },
}: PublishSwitchProps<TData>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (checked: boolean) => {
    startTransition(async () => {
      const result = await onToggle(id, checked);
      if (!isMutationError(result)) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <Switch
        checked={isPublished}
        onCheckedChange={handleChange}
        disabled={isPending}
      />
      <span className="text-xs text-muted-foreground">
        {isPublished ? label.published : label.unpublished}
      </span>
    </div>
  );
}
