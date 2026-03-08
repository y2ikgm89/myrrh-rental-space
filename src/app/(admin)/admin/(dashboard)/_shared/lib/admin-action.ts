import "server-only";

import type { User } from "@/shared/lib/auth";
import type { Resource, Action } from "@/admin/lib/permissions";
import {
  checkPermission,
  checkResourceAccess,
  logAction,
} from "@/admin/lib/action-auth";
import {
  createFailure,
  type ActionResult,
  type ActionSuccess,
} from "@/admin/types/server-actions";
import { isDomainError } from "@/shared/domain/domain-error";

type ExecuteAdminMutationOptions<TData> = {
  resource: Resource;
  action: Action;
  resourceId?: string;
  checkResourceAccess?: boolean;
  execute: (user: User) => Promise<TData>;
  success: (data: TData) => ActionSuccess<TData>;
  afterSuccess?: (data: TData) => Promise<void> | void;
  resolveAuditResourceId?: (data: TData) => string | undefined;
};

export async function executeAdminMutation<TData>(
  options: ExecuteAdminMutationOptions<TData>,
): Promise<ActionResult<TData>> {
  const permissionResult = options.checkResourceAccess
    ? await checkResourceAccess(
        options.resource,
        options.action,
        options.resourceId,
      )
    : await checkPermission(options.resource, options.action);

  if (!permissionResult.success) {
    return permissionResult.error;
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

    return options.success(data);
  } catch (error) {
    if (isDomainError(error)) {
      return createFailure(error.message);
    }

    throw error;
  }
}
