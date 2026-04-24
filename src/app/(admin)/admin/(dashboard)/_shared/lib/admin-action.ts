import "server-only";

import type { AdminUser } from "@/shared/lib/admin-auth";
import type { Resource, Action } from "@/admin/lib/permissions";
import {
  checkPermission,
  checkResourceAccess,
  logAction,
} from "@/admin/lib/action-auth";
import { isDomainError } from "@/shared/domain/domain-error";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";
import type { MutationResult } from "@/shared/lib/mutation-result";

type ExecuteAdminMutationResultOptions<TData> = {
  resource: Resource;
  action: Action;
  resourceId?: string;
  checkResourceAccess?: boolean;
  execute: (user: AdminUser) => Promise<TData>;
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

    fireAndForget(
      logAction(
        permissionResult.user.id,
        options.action,
        options.resource,
        options.resolveAuditResourceId?.(data) ?? options.resourceId,
      ),
      {
        operation: "executeAdminMutationResult.logAction",
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: {
          resource: options.resource,
          action: options.action,
          userId: permissionResult.user.id,
        },
      },
    );

    return data;
  } catch (error) {
    if (isDomainError(error)) {
      return {
        error: error.message,
        code: error.code,
      };
    }

    throw error;
  }
}
