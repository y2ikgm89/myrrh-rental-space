import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

mock.module("server-only", () => ({}));

type MaintenanceSettingsMock = {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
};

const mockGetMaintenanceSettings = mock((): Promise<MaintenanceSettingsMock> =>
  Promise.resolve({ maintenanceMode: false, maintenanceMessage: null }),
);

mock.module("@/shared/domain/settings/queries/site", () => ({
  getMaintenanceSettings: mockGetMaintenanceSettings,
}));

describe("maintenance-guard", () => {
  beforeEach(() => {
    mockGetMaintenanceSettings.mockClear();
    mockGetMaintenanceSettings.mockImplementation(() =>
      Promise.resolve({ maintenanceMode: false, maintenanceMessage: null }),
    );
  });

  test("isPublicSiteInMaintenance returns false when maintenance OFF", async () => {
    const { isPublicSiteInMaintenance } =
      await import("@/shared/domain/settings/maintenance-guard");

    await expect(isPublicSiteInMaintenance()).resolves.toBe(false);
  });

  test("isPublicSiteInMaintenance returns true when maintenance ON", async () => {
    mockGetMaintenanceSettings.mockImplementation(() =>
      Promise.resolve({
        maintenanceMode: true,
        maintenanceMessage: "作業中",
      }),
    );

    const { isPublicSiteInMaintenance } =
      await import("@/shared/domain/settings/maintenance-guard");

    await expect(isPublicSiteInMaintenance()).resolves.toBe(true);
  });

  test("assertPublicSiteWritable throws DomainError when maintenance ON", async () => {
    mockGetMaintenanceSettings.mockImplementation(() =>
      Promise.resolve({ maintenanceMode: true, maintenanceMessage: null }),
    );

    const { assertPublicSiteWritable, PUBLIC_MAINTENANCE_BLOCKED_MESSAGE } =
      await import("@/shared/domain/settings/maintenance-guard");

    await expect(assertPublicSiteWritable()).rejects.toEqual(
      new DomainError(PUBLIC_MAINTENANCE_BLOCKED_MESSAGE, "FORBIDDEN"),
    );
  });

  test("checkPublicSiteWritable returns error when maintenance ON", async () => {
    mockGetMaintenanceSettings.mockImplementation(() =>
      Promise.resolve({ maintenanceMode: true, maintenanceMessage: null }),
    );

    const { checkPublicSiteWritable, PUBLIC_MAINTENANCE_BLOCKED_MESSAGE } =
      await import("@/shared/domain/settings/maintenance-guard");

    await expect(checkPublicSiteWritable()).resolves.toEqual({
      ok: false,
      error: PUBLIC_MAINTENANCE_BLOCKED_MESSAGE,
    });
  });

  test("getPublicMaintenanceBlockMutation returns MAINTENANCE code when ON", async () => {
    mockGetMaintenanceSettings.mockImplementation(() =>
      Promise.resolve({ maintenanceMode: true, maintenanceMessage: null }),
    );

    const {
      getPublicMaintenanceBlockMutation,
      PUBLIC_MAINTENANCE_BLOCKED_MESSAGE,
    } = await import("@/shared/domain/settings/maintenance-guard");

    await expect(getPublicMaintenanceBlockMutation()).resolves.toEqual({
      error: PUBLIC_MAINTENANCE_BLOCKED_MESSAGE,
      code: "MAINTENANCE",
    });
  });

  test("isPublicSiteInMaintenance returns true when getMaintenanceSettings throws (SYS-4 fail-closed)", async () => {
    mockGetMaintenanceSettings.mockImplementation(() =>
      Promise.reject(new Error("connection lost")),
    );

    const { isPublicSiteInMaintenance } =
      await import("@/shared/domain/settings/maintenance-guard");

    await expect(isPublicSiteInMaintenance()).resolves.toBe(true);
  });

  test("isCustomerAuthSignOutPath matches sign-out only", async () => {
    const { isCustomerAuthSignOutPath } =
      await import("@/shared/domain/settings/maintenance-guard");

    expect(isCustomerAuthSignOutPath("/api/customer-auth/sign-out")).toBe(true);
    expect(isCustomerAuthSignOutPath("/api/customer-auth/sign-out/")).toBe(
      true,
    );
    expect(isCustomerAuthSignOutPath("/api/customer-auth/sign-in")).toBe(false);
  });

  test("publicMaintenanceJsonResponse returns 503 JSON error", async () => {
    const {
      publicMaintenanceJsonResponse,
      PUBLIC_MAINTENANCE_BLOCKED_MESSAGE,
    } = await import("@/shared/domain/settings/maintenance-guard");

    const response = await publicMaintenanceJsonResponse();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: PUBLIC_MAINTENANCE_BLOCKED_MESSAGE,
    });
  });
});
