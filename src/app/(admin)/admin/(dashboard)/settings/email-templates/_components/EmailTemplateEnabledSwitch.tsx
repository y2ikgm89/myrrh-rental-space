"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/admin/components/ui";
import { toggleEmailTemplateEnabled } from "@/admin/actions/email-template";
import { isMutationError } from "@/shared/lib/mutation-result";

type Props = { type: string; enabled: boolean };

export function EmailTemplateEnabledSwitch({ type, enabled }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleChange = (checked: boolean) => {
    startTransition(async () => {
      const result = await toggleEmailTemplateEnabled(type, checked);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(checked ? "有効化しました" : "無効化しました");
      router.refresh();
    });
  };

  return (
    <Switch
      checked={enabled}
      onCheckedChange={handleChange}
      disabled={pending}
      aria-label="メール送信の有効/無効"
    />
  );
}
