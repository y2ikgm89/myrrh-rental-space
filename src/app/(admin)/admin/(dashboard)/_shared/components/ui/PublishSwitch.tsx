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

type PublishSwitchProps<TData = unknown> = {
  id: string;
  isPublished: boolean;
  onToggle: (id: string, checked: boolean) => Promise<MutationResult<TData>>;
  /** 操作対象を識別する SR ラベル（例: 「{title} の公開状態」）— 必須 */
  resourceLabel: string;
  label?: { published: string; unpublished: string };
};

export function PublishSwitch<TData = unknown>({
  id,
  isPublished,
  onToggle,
  resourceLabel,
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
    <div className="inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 py-2">
      <Switch
        checked={isPublished}
        onCheckedChange={handleChange}
        disabled={isPending}
        aria-label={`${resourceLabel}（現在: ${isPublished ? label.published : label.unpublished}）`}
      />
      <span className="text-xs text-muted-foreground" aria-hidden="true">
        {isPublished ? label.published : label.unpublished}
      </span>
    </div>
  );
}
