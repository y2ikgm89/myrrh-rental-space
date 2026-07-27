import "server-only";

import { prisma } from "@/shared/db/prisma";
import type {
  HeaderBackgroundMode,
  HeaderScrollBehavior,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import type { SidebarSettings } from "@/shared/lib/validations/sidebar";
import {
  SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
  toExpectedUpdatedAt,
} from "@/shared/domain/settings/commands/optimistic";

export type HeaderSettingsInput = {
  headerScrollBehavior: HeaderScrollBehavior;
  headerBackgroundMode: HeaderBackgroundMode;
  /** 楽観的 concurrency: 読み込み時の SettingsLayout.updatedAt */
  expectedUpdatedAt: string | Date;
};

export type FooterSettingsInput = {
  footerTagline: string | null;
  footerNavigationLabel: string;
  footerContactLabel: string;
  footerHoursLabel: string;
  footerShowSocialLinks: boolean;
  themeColor: string;
  /** 楽観的 concurrency: 読み込み時の SettingsLayout.updatedAt */
  expectedUpdatedAt: string | Date;
};

export async function updateSidebarSettings(
  data: SidebarSettings,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    sidebarEnabled: data.sidebarEnabled,
    sidebarWidgets: data.sidebarWidgets,
    sidebarRecentCount: data.sidebarRecentCount,
    sidebarPopularCount: data.sidebarPopularCount,
    sidebarTocEnabled: data.sidebarTocEnabled,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsSidebar.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateHeaderSettings(
  data: HeaderSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    headerScrollBehavior: data.headerScrollBehavior,
    headerBackgroundMode: data.headerBackgroundMode,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsLayout.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateFooterSettings(
  data: FooterSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    footerTagline: data.footerTagline,
    footerNavigationLabel: data.footerNavigationLabel,
    footerContactLabel: data.footerContactLabel,
    footerHoursLabel: data.footerHoursLabel,
    footerShowSocialLinks: data.footerShowSocialLinks,
    themeColor: data.themeColor,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsLayout.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}
