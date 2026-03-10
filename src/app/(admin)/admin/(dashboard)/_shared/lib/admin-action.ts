import "server-only";

import type { User } from "@/shared/lib/auth";
import type { Resource, Action } from "@/admin/lib/permissions";
import {
  checkPermission,
  checkResourceAccess,
  logAction,
} from "@/admin/lib/action-auth";
import { isDomainError } from "@/shared/domain/domain-error";
import type { MutationResult } from "@/shared/lib/mutation-result";

type ExecuteAdminMutationResultOptions<TData> = {
  resource: Resource;
  action: Action;
  resourceId?: string;
  checkResourceAccess?: boolean;
  execute: (user: User) => Promise<TData>;
  afterSuccess?: (data: TData) => Promise<void> | void;
  resolveAuditResourceId?: (data: TData) => string | undefined;
};

export async function executeAdminMutationResult<TData>(
  options: ExecuteAdminMutationResultOptions<TData>,
): Promise<MutationResult<TData>> {
  const permissionResult = options.checkResourceAccess
    ? await checkResourceAccess(
        options.resource,
        options.action,
        options.resourceId,
      )
    : await checkPermission(options.resource, options.action);

  if (!permissionResult.success) {
    return { error: permissionResult.error.error };
  }

  try {
    const data = await options.execute(permissionResult.user);
    await options.afterSuccess?.(data);

    logAction(
      permissionResult.user.id,
      options.action,
      options.resource,
      options.resolveAuditResourceId?.(data) ?? options.resourceId,
    );

    return data;
  } catch (error) {
    if (isDomainError(error)) {
      return { error: error.message };
    }

    throw error;
  }
}
