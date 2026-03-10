"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/admin/components/ui";
import { toggleTermsActive } from "@/admin/actions/terms";
import { isMutationError } from "@/shared/lib/mutation-result";

type TermsActiveSwitchProps = {
  id: string;
  isActive: boolean;
};

export function TermsActiveSwitch({ id, isActive }: TermsActiveSwitchProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (checked: boolean) => {
    startTransition(async () => {
      const result = await toggleTermsActive(id, checked);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(checked ? "規約を有効にしました" : "規約を無効にしました");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <Switch
        checked={isActive}
        onCheckedChange={handleChange}
        disabled={isPending}
      />
      <span className="text-xs text-muted-foreground">
        {isActive ? "有効" : "無効"}
      </span>
    </div>
  );
}
