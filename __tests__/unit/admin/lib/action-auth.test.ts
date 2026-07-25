import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import type { Action } from "@/shared/lib/admin-resources";

const mockLogUserAction = mock();

mock.module("@/admin/lib/audit", () => ({
  logUserAction: (...args: Parameters<typeof mockLogUserAction>) =>
    mockLogUserAction(...args),
  logPermissionDenied: mock(),
}));

const { logAction } = await import("@/admin/lib/action-auth");

describe("logAction", () => {
  beforeEach(() => {
    mockLogUserAction.mockReset();
    mockLogUserAction.mockResolvedValue(undefined);
  });

  test.each<[Action, AuditAction]>([
    ["create", AuditAction.CREATE],
    ["read", AuditAction.READ],
    ["update", AuditAction.UPDATE],
    ["delete", AuditAction.DELETE],
    ["publish", AuditAction.PUBLISH],
    ["manage", AuditAction.MANAGE],
  ])(
    "maps %s permission action to AuditAction.%s",
    async (action, auditAction) => {
      await logAction("user-1", action, "auditLog", "resource-1");

      expect(mockLogUserAction).toHaveBeenCalledWith(
        { id: "user-1" },
        auditAction,
        "auditLog",
        "resource-1",
      );
    },
  );
});
