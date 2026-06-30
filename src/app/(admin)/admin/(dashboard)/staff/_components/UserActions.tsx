"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { deleteUser } from "@/admin/actions/user";
import { isMutationError } from "@/shared/lib/mutation-result";
import { canModifyUser } from "@/shared/lib/admin-roles";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { UserData } from "@/shared/domain/users/types";
import type { Role } from "@/shared/lib/validations/enums/prisma-types";

type Props = {
  user: UserData;
  currentUser: {
    id: string;
    role: Role;
  };
};

export function UserActions({ user, currentUser }: Props) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const result = await deleteUser(user.id);
      if (!isMutationError(result)) {
        setDeleteDialogOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  const canModifyTarget = canModifyUser(currentUser.role, user.role);
  const canEdit =
    hasPermission(currentUser.role, "user", "update") && canModifyTarget;
  const canDelete =
    currentUser.id !== user.id &&
    hasPermission(currentUser.role, "user", "delete") &&
    canModifyTarget;

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem href={`/admin/staff/${user.id}`}>
          詳細
        </ActionDropdownItem>
        {canEdit ? (
          <ActionDropdownItem href={`/admin/staff/${user.id}/edit`}>
            編集
          </ActionDropdownItem>
        ) : null}
        {canDelete ? (
          <>
            <ActionDropdownSeparator />
            <ActionDropdownItem
              destructive
              onClick={() => setDeleteDialogOpen(true)}
            >
              削除
            </ActionDropdownItem>
          </>
        ) : null}
      </ActionDropdown>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={user.name || user.email}
        onConfirm={handleDelete}
        isPending={isDeleting}
      />
    </>
  );
}
