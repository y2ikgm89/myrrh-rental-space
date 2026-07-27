import "server-only";

import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { DEFAULT_BUSINESS_HOURS_WEEK } from "@/shared/lib/business-hours";
import { buildInitialFeatureModules } from "@/shared/lib/features/registry";

export async function ensureSettingsSystem() {
  return prisma.settingsSystem.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsSeo() {
  return prisma.settingsSeo.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsAnalytics() {
  return prisma.settingsAnalytics.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsLayout() {
  return prisma.settingsLayout.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsSidebar() {
  return prisma.settingsSidebar.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsOrganization() {
  return prisma.settingsOrganization.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      businessHours: asPrismaInputJsonValue(
        DEFAULT_BUSINESS_HOURS_WEEK,
        "businessHours が不正です",
      ),
    },
  });
}

export async function ensureSettingsCommerce() {
  return prisma.settingsCommerce.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsNotification() {
  return prisma.settingsNotification.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsReservation() {
  return prisma.settingsReservation.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsStripe() {
  return prisma.settingsStripe.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsResend() {
  return prisma.settingsResend.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsTurnstile() {
  return prisma.settingsTurnstile.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsGoogleMaps() {
  return prisma.settingsGoogleMaps.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsGoogleCalendar() {
  return prisma.settingsGoogleCalendar.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsGoogleBusinessProfile() {
  return prisma.settingsGoogleBusinessProfile.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsInstagram() {
  return prisma.settingsInstagram.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsSwitchbot() {
  return prisma.settingsSwitchbot.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsFeatures() {
  const featureModules = asPrismaInputJsonValue(
    buildInitialFeatureModules(),
    "featureModules が不正です",
  );

  return prisma.settingsFeatures.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", featureModules },
  });
}

export async function ensureSettingsDataRetention() {
  return prisma.settingsDataRetention.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}
