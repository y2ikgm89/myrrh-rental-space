import { describe, test, expect, mock, beforeEach } from "bun:test";

type SettingsUpsertArgs = {
  where?: { id: string };
  update?: Record<string, unknown>;
  create?: Record<string, unknown>;
};

const mockSettingsOrganizationUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsFeaturesUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsSystemUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsSystem: { upsert: mockSettingsSystemUpsert },
    settingsSeo: { upsert: mock(() => Promise.resolve({ id: "singleton" })) },
    settingsAnalytics: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsLayout: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsSidebar: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsOrganization: { upsert: mockSettingsOrganizationUpsert },
    settingsCommerce: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsNotification: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsReservation: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsStripe: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsResend: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsTurnstile: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsGoogleMaps: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsGoogleCalendar: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsGoogleBusinessProfile: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsInstagram: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsSwitchbot: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
    settingsFeatures: { upsert: mockSettingsFeaturesUpsert },
    settingsDataRetention: {
      upsert: mock(() => Promise.resolve({ id: "singleton" })),
    },
  },
}));

import {
  ensureSettingsFeatures,
  ensureSettingsOrganization,
  ensureSettingsSystem,
} from "@/shared/domain/settings/ensure-commands";
import { DEFAULT_BUSINESS_HOURS_WEEK } from "@/shared/lib/business-hours";
import { buildInitialFeatureModules } from "@/shared/lib/features/registry";

describe("ensureSettingsSystem", () => {
  beforeEach(() => {
    mockSettingsSystemUpsert.mockReset();
    mockSettingsSystemUpsert.mockResolvedValue({ id: "singleton" });
  });

  test("singleton を空 update で upsert する", async () => {
    await ensureSettingsSystem();

    expect(mockSettingsSystemUpsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
  });
});

describe("ensureSettingsOrganization", () => {
  beforeEach(() => {
    mockSettingsOrganizationUpsert.mockReset();
    mockSettingsOrganizationUpsert.mockResolvedValue({ id: "singleton" });
  });

  test("create 時に DEFAULT_BUSINESS_HOURS_WEEK を businessHours として seed する", async () => {
    await ensureSettingsOrganization();

    expect(mockSettingsOrganizationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "singleton" },
        update: {},
        create: expect.objectContaining({
          id: "singleton",
          businessHours: DEFAULT_BUSINESS_HOURS_WEEK,
        }),
      }),
    );
  });
});

describe("ensureSettingsFeatures", () => {
  beforeEach(() => {
    mockSettingsFeaturesUpsert.mockReset();
    mockSettingsFeaturesUpsert.mockResolvedValue({ id: "singleton" });
  });

  test("create 時に buildInitialFeatureModules() を featureModules として seed する", async () => {
    await ensureSettingsFeatures();

    expect(mockSettingsFeaturesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "singleton" },
        update: {},
        create: expect.objectContaining({
          id: "singleton",
          featureModules: buildInitialFeatureModules(),
        }),
      }),
    );
  });
});
