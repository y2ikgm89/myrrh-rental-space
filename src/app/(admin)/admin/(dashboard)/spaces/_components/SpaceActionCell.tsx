"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";
import { duplicateSpace } from "@/admin/actions/space";
import { isMutationError } from "@/shared/lib/mutation-result";

type SpaceActionCellProps = {
  spaceId: string;
};

export function SpaceActionCell({ spaceId }: SpaceActionCellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDuplicate = () => {
    startTransition(async () => {
      const result = await duplicateSpace(spaceId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("スペースを複製しました");
      router.push(`/admin/spaces/${result.id}/edit`);
    });
  };

  return (
    <ActionDropdown disabled={isPending}>
      <ActionDropdownItem href={`/admin/spaces/${spaceId}`}>
        詳細
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/spaces/${spaceId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem onClick={handleDuplicate}>複製</ActionDropdownItem>
    </ActionDropdown>
  );
}
