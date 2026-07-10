import "server-only";

import {
  getCustomApiKeys as getCustomApiKeysQuery,
  getCustomApiKeyValue as getCustomApiKeyValueQuery,
  getGoogleMapsConfig as getGoogleMapsConfigQuery,
  getResendConfig as getResendConfigQuery,
  getSwitchBotConfig as getSwitchBotConfigQuery,
  getTurnstileConfig as getTurnstileConfigQuery,
} from "@/shared/domain/settings/api-key-queries";
import type {
  CustomApiKeyData,
  GoogleMapsConfig,
  ResendConfig,
  SwitchBotConfig,
  TurnstileConfig,
} from "@/shared/types/api-keys";
import { requireAdminPermission } from "./_helpers";

export type {
  CustomApiKeyData,
  GoogleMapsConfig,
  ResendConfig,
  SwitchBotConfig,
  TurnstileConfig,
};

export async function getResendConfig(): Promise<ResendConfig> {
  await requireAdminPermission("settings", "read");
  return getResendConfigQuery();
}

export async function getTurnstileConfig(): Promise<TurnstileConfig> {
  await requireAdminPermission("settings", "read");
  return getTurnstileConfigQuery();
}

export async function getGoogleMapsConfig(): Promise<GoogleMapsConfig> {
  await requireAdminPermission("settings", "read");
  return getGoogleMapsConfigQuery();
}

export async function getSwitchBotConfig(): Promise<SwitchBotConfig> {
  await requireAdminPermission("settings", "read");
  return getSwitchBotConfigQuery();
}

export async function getCustomApiKeys(): Promise<CustomApiKeyData[]> {
  await requireAdminPermission("settings", "read");
  return getCustomApiKeysQuery();
}

export async function getCustomApiKeyValue(id: string): Promise<string | null> {
  await requireAdminPermission("settings", "read");
  return getCustomApiKeyValueQuery(id);
}
