import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { getPublicBusinessSettings } from "@/shared/domain/settings/queries/organization";

type PublicBusinessSettings = Awaited<
  ReturnType<typeof getPublicBusinessSettings>
>;

const mockGetPublicBusinessSettings = mock<
  () => Promise<PublicBusinessSettings>
>(() => Promise.resolve(null));

mock.module("@/shared/domain/settings/queries/organization", () => ({
  getPublicBusinessSettings: mockGetPublicBusinessSettings,
}));

import { getBusinessInfo } from "@/public/data/business";
import { SITE_DEFAULTS } from "@/shared/lib/constants";

describe("getBusinessInfo", () => {
  beforeEach(() => {
    mockGetPublicBusinessSettings.mockClear();
    mockGetPublicBusinessSettings.mockResolvedValue(null);
  });

  test("name falls back businessName → siteName → SITE_DEFAULTS.name", async () => {
    mockGetPublicBusinessSettings.mockResolvedValueOnce({
      businessName: null,
      siteName: "Site From SEO",
      siteDescription: null,
      businessNameKana: null,
      businessDescription: null,
      representativeName: null,
      establishedDate: null,
      registrationNumber: null,
      invoiceNumber: null,
      email: null,
      phoneNumber: null,
      faxNumber: null,
      postalCode: null,
      prefecture: null,
      city: null,
      streetAddress: null,
      buildingName: null,
      businessHours: null,
      holidayNotice: null,
    });

    await expect(getBusinessInfo()).resolves.toMatchObject({
      name: "Site From SEO",
    });

    mockGetPublicBusinessSettings.mockResolvedValueOnce(null);
    await expect(getBusinessInfo()).resolves.toMatchObject({
      name: SITE_DEFAULTS.name,
    });
  });

  test("streetAddressLine joins streetAddress and buildingName", async () => {
    mockGetPublicBusinessSettings.mockResolvedValueOnce({
      businessName: "Biz",
      siteName: "Site",
      siteDescription: null,
      businessNameKana: null,
      businessDescription: null,
      representativeName: null,
      establishedDate: null,
      registrationNumber: null,
      invoiceNumber: null,
      email: null,
      phoneNumber: null,
      faxNumber: null,
      postalCode: "150-0001",
      prefecture: "東京都",
      city: "渋谷区",
      streetAddress: "神宮前1-1-1",
      buildingName: "本館ビル",
      businessHours: null,
      holidayNotice: null,
    });

    const info = await getBusinessInfo();
    expect(info.streetAddressLine).toBe("神宮前1-1-1 本館ビル");
    expect(info.streetAddress).toBe("神宮前1-1-1");
    expect(info.buildingName).toBe("本館ビル");
    expect(info.address).toBe("〒150-0001東京都渋谷区神宮前1-1-1本館ビル");
  });
});
